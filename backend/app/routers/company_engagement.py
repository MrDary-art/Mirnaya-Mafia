"""Corporate feedback, program enrolments and privacy-aware benchmarks."""

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import (Company, CompanyAssignmentAttempt, CompanyAssignmentTarget, CompanyInboxMessage, CompanyMembership, CompanyProgram,
    CompanyProgramEnrollment, CompanyProgramStep, CompanyResultComment, CompanySurvey, CompanySurveyResponse)
from app.db import get_db
from app.models import Notification, User
from app.routers.company import MANAGE_TEAM, allows_member_notification, as_json, audit, refresh_program_enrollment, require_membership, require_role, visible_membership_ids
from app.services import dumps

router = APIRouter(prefix="/company", tags=["company-engagement"])


class SurveyIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    questions: list[str] = Field(min_length=1, max_length=20)
    assignment_id: int | None = None
    anonymous: bool = True


class SurveyResponseIn(BaseModel):
    answers: dict[str, str | int] = Field(default_factory=dict)


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=3000)


class EnrollIn(BaseModel):
    membership_ids: list[int] = Field(min_length=1, max_length=1000)


def survey_payload(row: CompanySurvey, answered: bool = False) -> dict:
    return {"id": row.id, "title": row.title, "questions": as_json(row.questions, []), "assignment_id": row.assignment_id,
            "anonymous": bool(row.anonymous), "status": row.status, "answered": answered,
            "created_at": row.created_at.isoformat() if row.created_at else None}


@router.get("/{company_id}/surveys")
async def surveys(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanySurvey).where(CompanySurvey.company_id == company_id, CompanySurvey.status == "ACTIVE"))).all()
    answered = set((await db.scalars(select(CompanySurveyResponse.survey_id).where(CompanySurveyResponse.membership_id == membership.id))).all())
    return [survey_payload(row, row.id in answered) for row in rows]


@router.post("/{company_id}/surveys")
async def create_survey(company_id: int, body: SurveyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    row = CompanySurvey(company_id=company_id, assignment_id=body.assignment_id, title=body.title.strip(),
                        questions=dumps([item.strip() for item in body.questions]), anonymous=int(body.anonymous), created_by=user.id)
    db.add(row); await db.flush(); await audit(db, membership, user.id, "SURVEY_CREATED", "survey", row.id)
    await db.commit(); return survey_payload(row)


@router.post("/{company_id}/surveys/{survey_id}/responses")
async def answer_survey(company_id: int, survey_id: int, body: SurveyResponseIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    survey = await db.get(CompanySurvey, survey_id)
    if not survey or survey.company_id != company_id or survey.status != "ACTIVE": raise HTTPException(404, "Опрос не найден")
    existing = await db.scalar(select(CompanySurveyResponse.id).where(CompanySurveyResponse.survey_id == survey_id, CompanySurveyResponse.membership_id == membership.id))
    if existing: raise HTTPException(409, "Ответ на этот опрос уже отправлен")
    db.add(CompanySurveyResponse(company_id=company_id, survey_id=survey_id, membership_id=membership.id, answers=dumps(body.answers)))
    await db.commit(); return {"ok": True}


@router.get("/{company_id}/surveys/{survey_id}/results")
async def survey_results(company_id: int, survey_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    survey = await db.get(CompanySurvey, survey_id)
    if not survey or survey.company_id != company_id: raise HTTPException(404, "Опрос не найден")
    rows = (await db.scalars(select(CompanySurveyResponse).where(CompanySurveyResponse.survey_id == survey_id))).all()
    aggregate: dict[str, dict[str, int]] = {}
    for row in rows:
        for question, answer in as_json(row.answers, {}).items():
            aggregate.setdefault(question, Counter())[str(answer)] += 1
    # For anonymous surveys there are deliberately no participant identifiers in this response.
    return {"survey": survey_payload(survey), "responses": len(rows), "answers": {key: dict(value) for key, value in aggregate.items()}}


@router.get("/{company_id}/attempts/{attempt_id}/comments")
async def result_comments(company_id: int, attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    attempt = await db.get(CompanyAssignmentAttempt, attempt_id)
    if not attempt or attempt.company_id != company_id: raise HTTPException(404, "Результат не найден")
    if attempt.membership_id != membership.id and membership.corporate_role not in MANAGE_TEAM: raise HTTPException(403, "Нет доступа к этому результату")
    company = await db.get(Company, company_id)
    if attempt.membership_id != membership.id and as_json(company.settings, {}).get("privacy", {}).get("records") == "employee_only":
        raise HTTPException(status_code=403)
    rows = (await db.scalars(select(CompanyResultComment).where(CompanyResultComment.attempt_id == attempt_id).order_by(CompanyResultComment.created_at))).all()
    return [{"id": row.id, "text": row.text, "created_at": row.created_at.isoformat(), "author": "Руководитель"} for row in rows]


@router.post("/{company_id}/attempts/{attempt_id}/comments")
async def add_result_comment(company_id: int, attempt_id: int, body: CommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    attempt = await db.get(CompanyAssignmentAttempt, attempt_id)
    if not attempt or attempt.company_id != company_id: raise HTTPException(404, "Результат не найден")
    company = await db.get(Company, company_id)
    if as_json(company.settings, {}).get("privacy", {}).get("records") == "employee_only":
        raise HTTPException(status_code=403)
    allowed = set(await visible_membership_ids(db, membership))
    if attempt.membership_id not in allowed: raise HTTPException(403, "Нет доступа к результату сотрудника")
    row = CompanyResultComment(company_id=company_id, attempt_id=attempt_id, author_membership_id=membership.id, text=body.text.strip())
    db.add(row)
    target_member = await db.get(CompanyMembership, attempt.membership_id)
    if target_member and allows_member_notification(target_member, "result"):
        db.add(CompanyInboxMessage(company_id=company_id, membership_id=target_member.id, type="MANAGER_COMMENT",
            title="\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044f", text="\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043e\u0441\u0442\u0430\u0432\u0438\u043b \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u043a \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0443 \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u043e\u0433\u043e \u0437\u0430\u0434\u0430\u043d\u0438\u044f.",
            payload=dumps({"attempt_id": attempt_id, "comment_id": row.id})))
        db.add(Notification(user_id=target_member.user_id, type="MANAGER_COMMENT", payload=dumps({
            "company_id": company_id, "attempt_id": attempt_id, "comment_id": row.id,
        })))
    await audit(db, membership, user.id, "RESULT_COMMENTED", "attempt", attempt_id)
    await db.commit()
    return {"id": row.id, "text": row.text, "created_at": row.created_at.isoformat(), "author": "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c"}

@router.post("/{company_id}/programs/{program_id}/enroll")
async def enroll_program(company_id: int, program_id: int, body: EnrollIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_TEAM)
    program = await db.get(CompanyProgram, program_id)
    if not program or program.company_id != company_id:
        raise HTTPException(404, "\u041e\u0448\u0438\u0431\u043a\u0430")
    if program.status != "PUBLISHED":
        raise HTTPException(409, "\u041e\u0448\u0438\u0431\u043a\u0430")
    allowed = set(await visible_membership_ids(db, membership))
    recipients = allowed & set(body.membership_ids)
    if not recipients:
        raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
    created = 0
    for membership_id in recipients:
        row = await db.scalar(select(CompanyProgramEnrollment).where(
            CompanyProgramEnrollment.program_id == program_id,
            CompanyProgramEnrollment.membership_id == membership_id,
        ))
        if not row:
            row = CompanyProgramEnrollment(company_id=company_id, program_id=program_id, membership_id=membership_id)
            db.add(row)
            await db.flush()
            created += 1
        target_member = await db.get(CompanyMembership, membership_id)
        if target_member and row.status == "ACTIVE":
            await refresh_program_enrollment(db, target_member, row)
    await audit(db, membership, user.id, "PROGRAM_ENROLLED", "program", program_id, {"recipients": created})
    await db.commit()
    return {"created": created}


@router.get("/{company_id}/programs/{program_id}/enrolments")
async def program_enrolments(company_id: int, program_id: int, db: AsyncSession = Depends(get_db),
                             user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_TEAM)
    if not await db.scalar(select(CompanyProgram.id).where(
        CompanyProgram.id == program_id, CompanyProgram.company_id == company_id,
    )):
        raise HTTPException(404, "\u041e\u0448\u0438\u0431\u043a\u0430")
    allowed = set(await visible_membership_ids(db, actor))
    rows = (await db.scalars(select(CompanyProgramEnrollment).where(
        CompanyProgramEnrollment.company_id == company_id,
        CompanyProgramEnrollment.program_id == program_id,
        CompanyProgramEnrollment.membership_id.in_(allowed),
    ).order_by(CompanyProgramEnrollment.enrolled_at.desc()))).all()
    steps = (await db.scalars(select(CompanyProgramStep).where(
        CompanyProgramStep.program_id == program_id).order_by(CompanyProgramStep.position))).all()
    result = []
    for row in rows:
        person = await db.get(CompanyMembership, row.membership_id)
        account = await db.get(User, person.user_id) if person else None
        next_step = next((item for item in steps if item.position == row.unlocked_step + 1), None)
        result.append({
            "id": row.id, "membership_id": row.membership_id,
            "name": (account.display_name or account.username) if account else "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a",
            "status": row.status, "unlocked_step": row.unlocked_step,
            "completed_steps": as_json(row.completed_steps, []),
            "manual_step_available": next_step.position if next_step and next_step.unlock_rule == "MANUAL" else None,
            "manual_step_title": next_step.title if next_step and next_step.unlock_rule == "MANUAL" else None,
        })
    return result


@router.post("/{company_id}/programs/{program_id}/enrolments/{membership_id}/unlock")
async def manually_unlock_program_stage(company_id: int, program_id: int, membership_id: int,
                                        db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_TEAM)
    if membership_id not in set(await visible_membership_ids(db, actor)):
        raise HTTPException(403, "\u041e\u0448\u0438\u0431\u043a\u0430")
    enrollment = await db.scalar(select(CompanyProgramEnrollment).where(
        CompanyProgramEnrollment.company_id == company_id,
        CompanyProgramEnrollment.program_id == program_id,
        CompanyProgramEnrollment.membership_id == membership_id,
        CompanyProgramEnrollment.status == "ACTIVE",
    ))
    if not enrollment:
        raise HTTPException(404, "\u041e\u0448\u0438\u0431\u043a\u0430")
    next_step = await db.scalar(select(CompanyProgramStep).where(
        CompanyProgramStep.program_id == program_id,
        CompanyProgramStep.position == enrollment.unlocked_step + 1,
    ))
    if not next_step or next_step.unlock_rule != "MANUAL" or not next_step.assignment_id:
        raise HTTPException(409, "\u041e\u0448\u0438\u0431\u043a\u0430")
    existing = await db.scalar(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.assignment_id == next_step.assignment_id,
        CompanyAssignmentTarget.membership_id == membership_id,
    ))
    if not existing:
        db.add(CompanyAssignmentTarget(company_id=company_id, assignment_id=next_step.assignment_id,
                                       membership_id=membership_id, status="ASSIGNED"))
    enrollment.unlocked_step = next_step.position
    await audit(db, actor, user.id, "PROGRAM_STAGE_UNLOCKED", "program_enrollment", enrollment.id,
                {"step": next_step.position, "membership_id": membership_id})
    await db.commit()
    return {"ok": True, "unlocked_step": next_step.position}

@router.get("/{company_id}/programs/enrolments/me")
async def my_program_enrolments(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyProgramEnrollment).where(CompanyProgramEnrollment.membership_id == membership.id))).all()
    result = []
    for row in rows:
        program = await db.get(CompanyProgram, row.program_id)
        steps = as_json(program.steps, []) if program else []
        result.append({"id": row.id, "program_id": row.program_id, "title": program.title if program else "Программа",
                       "steps": steps, "unlocked_step": row.unlocked_step, "completed_steps": as_json(row.completed_steps, []), "status": row.status})
    return result


@router.get("/{company_id}/benchmark/me")
async def my_benchmark(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id,
        CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    own = [row.final_score for row in attempts if row.membership_id == membership.id]
    if not own or len(attempts) < 5: return {"available": False, "reason": "Для сравнения нужно не менее 5 завершённых попыток."}
    score = max(own); percentile = round(100 * sum(1 for row in attempts if row.final_score <= score) / len(attempts))
    return {"available": True, "score": score, "percentile": percentile, "sample_size": len(attempts),
            "note": "Сравнение обезличено и не раскрывает результаты коллег."}
