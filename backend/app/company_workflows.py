"""Corporate results reuse Arena metrics and remain scoped to explicit assignments."""

from datetime import datetime
import json
import secrets

from fastapi import HTTPException
from sqlalchemy import select

from app.company_models import (CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentTarget,
    CompanyCertificate, CompanyMembership, CompanyProgram, CompanyProgramEnrollment, CompanyInboxMessage)
from app.models import Session, User

METRICS = ("trust", "goal", "control", "eq")
KPI_RULES = {"MIN", "MAX"} | {f"{metric.upper()}_{direction}" for metric in METRICS for direction in ("MIN", "MAX")}


def parse(value, fallback):
    try:
        return json.loads(value or "")
    except (ValueError, TypeError):
        return fallback


async def owned(db, model, object_id, company_id, label="Объект"):
    row = await db.get(model, object_id)
    if not row or row.company_id != company_id:
        raise HTTPException(404, f"{label} не найден")
    return row


async def scoped_assignment(db, actor, assignment_id):
    from app.company_access import capabilities, visible_membership_ids
    assignment = await owned(db, CompanyAssignment, assignment_id, actor.company_id, "Задание")
    if not capabilities(actor).get("manage_learning"):
        allowed = set(await visible_membership_ids(db, actor))
        targets = (await db.scalars(select(CompanyAssignmentTarget.membership_id).where(
            CompanyAssignmentTarget.company_id == actor.company_id,
            CompanyAssignmentTarget.assignment_id == assignment_id))).all()
        if not targets or any(member_id not in allowed for member_id in targets):
            raise HTTPException(403, "Задание находится вне вашей области доступа")
    return assignment


def evaluate_kpis(snapshot, metrics, arena_score):
    """Binary threshold checks on observed metrics; unknown rules have no invented score."""
    results = []
    for item in snapshot:
        rule = str(item.get("rule") or "").upper()
        metric = rule.rsplit("_", 1)[0].lower() if "_" in rule else "arena_score"
        value = arena_score if metric == "arena_score" else metrics.get(metric)
        threshold = item.get("threshold")
        available = rule in KPI_RULES and isinstance(value, (int, float)) and isinstance(threshold, (int, float))
        passed = (value >= threshold if rule.endswith("MIN") else value <= threshold) if available else None
        results.append({"id": item.get("id"), "name": item.get("name"), "rule": rule,
            "metric": metric, "value": value if available else None, "threshold": threshold,
            "available": available, "passed": passed, "score": (100 if passed else 0) if available else None,
            "weight": max(0, int(item.get("weight") or 0)), "required": bool(item.get("required")),
            "note": None if available else "Для этого критерия нет подтверждённого измерения"})
    measured = [item for item in results if item["available"] and item["weight"] > 0]
    denominator = sum(item["weight"] for item in measured)
    score = round(sum(item["score"] * item["weight"] for item in measured) / denominator) if denominator else None
    required_ok = all(item["passed"] is True for item in results if item["required"])
    return score, results, required_ok


async def sync_member_attempts(db, membership):
    from app.routers.company import grant_completed_achievements, refresh_program_enrollment, allows_member_notification
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == membership.company_id,
        CompanyAssignmentAttempt.membership_id == membership.id,
        CompanyAssignmentAttempt.status == "IN_PROGRESS"))).all()
    changed = False
    linked_episode_ids = set()
    for attempt in attempts:
        session = await db.get(Session, attempt.session_id) if attempt.session_id else None
        if not session or session.user_id != membership.user_id or session.status != "finished":
            continue
        corporate = parse(session.settings, {}).get("corporate") or {}
        if corporate.get("company_id") != membership.company_id or corporate.get("assignment_id") != attempt.assignment_id:
            continue
        metrics = {key: min(100, max(0, int(parse(session.metrics, {}).get(key, 0)))) for key in METRICS}
        assignment = await owned(db, CompanyAssignment, attempt.assignment_id, membership.company_id, "Задание")
        arena_score = round(sum(metrics.values()) / len(METRICS))
        company_score, kpi_results, required_ok = evaluate_kpis(parse(assignment.kpi_snapshot, []), metrics, arena_score)
        total_weight = assignment.arena_weight + (assignment.company_weight if company_score is not None else 0)
        final_score = round((arena_score * assignment.arena_weight + (company_score or 0) * assignment.company_weight) / total_weight) if total_weight else arena_score
        attempt.arena_score, attempt.company_score, attempt.final_score = arena_score, company_score, final_score
        attempt.kpi_results = json.dumps(kpi_results, ensure_ascii=False)
        attempt.metrics_snapshot = json.dumps(metrics)
        attempt.status = "COMPLETED"
        attempt.completed_at = session.finished_at or datetime.now()
        await db.flush()
        completed = (await db.scalars(select(CompanyAssignmentAttempt).where(
            CompanyAssignmentAttempt.target_id == attempt.target_id,
            CompanyAssignmentAttempt.company_id == membership.company_id,
            CompanyAssignmentAttempt.status == "COMPLETED").order_by(CompanyAssignmentAttempt.started_at, CompanyAssignmentAttempt.id))).all()
        scored = [item for item in completed if item.final_score is not None]
        policy = assignment.attempt_policy.upper()
        selected = scored[:1] if policy == "FIRST" else scored[-1:] if policy == "LAST" else scored if policy == "AVERAGE" else [max(scored, key=lambda item: item.final_score)]
        score = round(sum(item.final_score for item in selected) / len(selected)) if policy == "AVERAGE" else max(item.final_score for item in selected)
        required_passed = all(all(item.get("passed") is True for item in parse(row.kpi_results, []) if item.get("required")) for row in selected)
        target = await owned(db, CompanyAssignmentTarget, attempt.target_id, membership.company_id, "Получатель задания")
        target.best_score = score
        target.status = "PASSED" if score >= assignment.passing_score and required_passed else "FAILED"
        target.completed_at = attempt.completed_at
        if assignment.episode_id:
            linked_episode_ids.add(assignment.episode_id)
        if target.status == "PASSED" and assignment.issue_certificate:
            exists = await db.scalar(select(CompanyCertificate.id).where(
                CompanyCertificate.company_id == membership.company_id,
                CompanyCertificate.membership_id == membership.id,
                CompanyCertificate.program_id == assignment.program_id,
                CompanyCertificate.title == assignment.title))
            if not exists:
                db.add(CompanyCertificate(company_id=membership.company_id, membership_id=membership.id,
                    program_id=assignment.program_id, title=assignment.title,
                    certificate_id=f"ARENA-{secrets.token_hex(6).upper()}", verification_code=secrets.token_urlsafe(18)))
        await grant_completed_achievements(db, membership, attempt, assignment, metrics)
        if allows_member_notification(membership, "result"):
            db.add(CompanyInboxMessage(company_id=membership.company_id, membership_id=membership.id,
                type="ASSIGNMENT_RESULT", title=assignment.title, text="Результат корпоративной тренировки готов.",
                payload=json.dumps({"assignment_id": assignment.id, "attempt_id": attempt.id})))
        manager = await db.get(CompanyMembership, membership.manager_membership_id) if membership.manager_membership_id else None
        if manager and manager.status == "ACTIVE" and allows_member_notification(manager, "result"):
            employee = await db.get(User, membership.user_id)
            employee_name = (employee.display_name or employee.username) if employee else "Сотрудник"
            db.add(CompanyInboxMessage(company_id=membership.company_id, membership_id=manager.id,
                type="TEAM_ASSIGNMENT_COMPLETED", title=assignment.title,
                text=f"Сотрудник {employee_name} завершил задание. Итоговый результат: {score} из 100.",
                payload=json.dumps({"assignment_id": assignment.id, "attempt_id": attempt.id,
                                    "membership_id": membership.id, "score": score})))
        changed = True
    if changed:
        if linked_episode_ids:
            from app.company_episode_models import CompanyWorkEpisode
            from app.company_preparation import refresh_episode_completion
            episodes = (await db.scalars(select(CompanyWorkEpisode).where(
                CompanyWorkEpisode.company_id == membership.company_id,
                CompanyWorkEpisode.id.in_(linked_episode_ids),
            ))).all()
            for episode in episodes:
                await refresh_episode_completion(db, episode)
        enrollments = (await db.scalars(select(CompanyProgramEnrollment).where(
            CompanyProgramEnrollment.company_id == membership.company_id,
            CompanyProgramEnrollment.membership_id == membership.id,
            CompanyProgramEnrollment.status == "ACTIVE"))).all()
        for enrollment in enrollments:
            await refresh_program_enrollment(db, membership, enrollment)
            if enrollment.status == "COMPLETED":
                program = await db.get(CompanyProgram, enrollment.program_id)
                exists = await db.scalar(select(CompanyCertificate.id).where(
                    CompanyCertificate.company_id == membership.company_id,
                    CompanyCertificate.membership_id == membership.id,
                    CompanyCertificate.program_id == enrollment.program_id,
                    CompanyCertificate.title == program.title))
                if not exists:
                    db.add(CompanyCertificate(company_id=membership.company_id, membership_id=membership.id,
                        program_id=enrollment.program_id, title=program.title,
                        certificate_id=f"ARENA-{secrets.token_hex(6).upper()}", verification_code=secrets.token_urlsafe(18)))
        await db.commit()


async def sync_visible_attempts(db, actor):
    from app.routers.company import visible_membership_ids
    ids = await visible_membership_ids(db, actor)
    members = (await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == actor.company_id, CompanyMembership.id.in_(ids)))).all()
    for member in members:
        await sync_member_attempts(db, member)
    return set(ids)
