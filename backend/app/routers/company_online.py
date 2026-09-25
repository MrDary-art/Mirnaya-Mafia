from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.company_models import (CompanyAssignmentAttempt, CompanyCompetition, CompanyCompetitionParticipant, CompanyInboxMessage, CompanyMembership,
    CompanyProgram, CompanyProgramStep, CompanyRoomBooking, CompanyTeamGoal, CompanyTournamentMatch)
from app.company_notifications import deliver_company_event
from app.db import get_db
from app.models import ArenaRoom, Notification, User
from app.routers.company import MANAGE_TEAM, allows_member_notification, audit, require_membership, require_role, visible_membership_ids
from app.routers.rooms import RoomCreate, RoomJoin, create_room, join_room

router = APIRouter(prefix="/company", tags=["company-online"])
class BookingIn(BaseModel):
    host_membership_id: int
    guest_membership_id: int
    title: str = Field(min_length=3, max_length=220)
    situation: str = Field(min_length=3, max_length=1000)
    goal: str = Field(min_length=3, max_length=500)
    scheduled_at: str
    duration_minutes: int = Field(default=15, ge=2, le=30)
    scenario_id: str | None = None
class CompetitionIn(BaseModel):
    title: str = Field(min_length=3, max_length=220); assignment_id: int | None = None; membership_ids: list[int] = []
    kind: str = "TOURNAMENT"; starts_at: datetime | None = None; ends_at: datetime | None = None; rules: dict = {}
class MatchResultIn(BaseModel):
    winner_membership_id: int
class GoalIn(BaseModel):
    title: str = Field(min_length=3, max_length=220); target_score: int = Field(ge=1); department_id: int | None = None; deadline: datetime | None = None

@router.post("/{company_id}/online-1x1")
async def book(company_id:int, body:BookingIn, db:AsyncSession=Depends(get_db), user:User=Depends(get_current_user)):
    actor=await require_membership(db,user,company_id); require_role(actor,MANAGE_TEAM)
    allowed=set(await visible_membership_ids(db,actor))
    if {body.host_membership_id,body.guest_membership_id} - allowed or body.host_membership_id==body.guest_membership_id: raise HTTPException(400,"Выберите двух сотрудников из доступной команды")
    host=await db.get(CompanyMembership,body.host_membership_id); guest=await db.get(CompanyMembership,body.guest_membership_id)
    try:
        requested_at = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise HTTPException(400, "Укажите корректную дату и время") from exc
    requested_end = requested_at + timedelta(minutes=body.duration_minutes)
    booked = (await db.scalars(select(CompanyRoomBooking).where(
        CompanyRoomBooking.company_id == company_id, CompanyRoomBooking.status == "SCHEDULED"))).all()
    for existing in booked:
        if not {existing.host_membership_id, existing.guest_membership_id} & {host.id, guest.id}:
            continue
        existing_end = existing.scheduled_at + timedelta(minutes=existing.duration_minutes or 15)
        if requested_at < existing_end and existing.scheduled_at < requested_end:
            raise HTTPException(409, "У одного из участников уже есть встреча в это время")
    host_user=await db.get(User,host.user_id); guest_user=await db.get(User,guest.user_id)
    room=await create_room(RoomCreate(mode="human", display_name=host_user.display_name or host_user.username,
        request_text=body.situation, goal=body.goal, scheduled_at=body.scheduled_at, timezone="UTC",
        duration_minutes=body.duration_minutes, scenario_id=body.scenario_id), db, host_user)
    # A corporate booking has a fixed pair: attach the invited colleague immediately.
    await join_room(RoomJoin(code=room["code"],display_name=guest_user.display_name or guest_user.username),db,guest_user)
    created=await db.get(ArenaRoom,room["id"])
    row=CompanyRoomBooking(company_id=company_id,room_id=created.id,host_membership_id=host.id,guest_membership_id=guest.id,title=body.title,scheduled_at=datetime.fromisoformat(room["scheduled_at"]).replace(tzinfo=None),duration_minutes=body.duration_minutes,created_by=user.id)
    db.add(row)
    await db.flush()
    for recipient in (host, guest):
        if not allows_member_notification(recipient, "room"):
            continue
        db.add(Notification(user_id=recipient.user_id, type="COMPANY_ONLINE_1X1", payload=__import__("json").dumps({
            "company_id": company_id, "booking_id": row.id, "room_id": created.id, "title": body.title,
            "scheduled_at": room["scheduled_at"],
        }, ensure_ascii=False)))
        db.add(CompanyInboxMessage(
            company_id=company_id, membership_id=recipient.id, type="COMPANY_ONLINE_1X1",
            title="\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430 \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u0430\u044f \u0432\u0441\u0442\u0440\u0435\u0447\u0430",
            text="\u0412\u0441\u0442\u0440\u0435\u0447\u0430: " + body.title + ". " + room["scheduled_at"] + ".",
            payload=__import__("json").dumps({"booking_id": row.id, "room_id": created.id}, ensure_ascii=False),
        ))
    await audit(db,actor,user.id,"ONLINE_1X1_BOOKED","room",created.id,{"guest":guest.id})
    await db.commit()
    await deliver_company_event(db, company_id, {"type": "ONLINE_1X1_BOOKED", "booking_id": row.id,
                                                  "title": body.title, "scheduled_at": room["scheduled_at"]})
    return {"id":row.id,"room_id":created.id,"scheduled_at":room["scheduled_at"],"status":row.status}

@router.get("/{company_id}/online-1x1")
async def bookings(company_id:int, db:AsyncSession=Depends(get_db), user:User=Depends(get_current_user)):
    member=await require_membership(db,user,company_id); rows=(await db.scalars(select(CompanyRoomBooking).where(CompanyRoomBooking.company_id==company_id).order_by(CompanyRoomBooking.scheduled_at))).all()
    allowed=set(await visible_membership_ids(db,member)) if member.corporate_role in MANAGE_TEAM else {member.id}
    result=[]
    for row in rows:
        if row.host_membership_id not in allowed and row.guest_membership_id not in allowed: continue
        room = await db.get(ArenaRoom, row.room_id)
        host = await db.get(CompanyMembership, row.host_membership_id)
        guest = await db.get(CompanyMembership, row.guest_membership_id)
        host_user = await db.get(User, host.user_id) if host else None
        guest_user = await db.get(User, guest.user_id) if guest else None
        room_state = __import__("json").loads(room.state or "{}") if room else {}
        team = room_state.get("team_result") or {}
        result.append({
            "id": row.id, "room_id": row.room_id, "title": row.title,
            "scheduled_at": row.scheduled_at.isoformat(), "duration_minutes": row.duration_minutes,
            "status": room.status if room else row.status,
            "can_open": member.id in {row.host_membership_id, row.guest_membership_id},
            "participants": [
                {"membership_id": row.host_membership_id, "name": (host_user.display_name or host_user.username) if host_user else "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"},
                {"membership_id": row.guest_membership_id, "name": (guest_user.display_name or guest_user.username) if guest_user else "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"},
            ],
            "topic": room_state.get("request_text") if room else None,
            "result": {"available": bool(team.get("complete")), "team_score": team.get("score")} if room and room.status == "finished" else {"available": False},
        })
    return result

@router.post("/{company_id}/competitions")
async def competition(company_id:int, body:CompetitionIn, db:AsyncSession=Depends(get_db), user:User=Depends(get_current_user)):
    member=await require_membership(db,user,company_id); require_role(member,MANAGE_TEAM); allowed=set(await visible_membership_ids(db,member)); recipients=allowed & set(body.membership_ids)
    if len(recipients) < 2:
        raise HTTPException(400, "Для турнира нужны минимум два участника")
    row=CompanyCompetition(company_id=company_id,title=body.title,assignment_id=body.assignment_id,kind=body.kind,starts_at=body.starts_at,ends_at=body.ends_at,created_by=user.id,rules=__import__("json").dumps(body.rules)); db.add(row); await db.flush()
    participants=sorted(recipients)
    db.add_all([CompanyCompetitionParticipant(competition_id=row.id,membership_id=item) for item in participants])
    for position, offset in enumerate(range(0, len(participants), 2), 1):
        first=participants[offset]; second=participants[offset+1] if offset+1 < len(participants) else None
        db.add(CompanyTournamentMatch(competition_id=row.id,round_number=1,position=position,first_membership_id=first,second_membership_id=second,winner_membership_id=first if second is None else None,status="BYE" if second is None else "SCHEDULED"))
    await audit(db,member,user.id,"COMPETITION_CREATED","competition",row.id,{"participants":len(participants)}); await db.commit(); return {"id":row.id,"participants":len(recipients)}

@router.get("/{company_id}/competitions")
async def competition_list(company_id:int,db:AsyncSession=Depends(get_db),user:User=Depends(get_current_user)):
    await require_membership(db,user,company_id); rows=(await db.scalars(select(CompanyCompetition).where(CompanyCompetition.company_id==company_id))).all(); out=[]
    for row in rows:
        ids=(await db.scalars(select(CompanyCompetitionParticipant.membership_id).where(CompanyCompetitionParticipant.competition_id==row.id))).all(); attempts=(await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id==company_id,CompanyAssignmentAttempt.membership_id.in_(ids),CompanyAssignmentAttempt.status=="COMPLETED"))).all(); scores={}
        for a in attempts: scores[a.membership_id]=max(scores.get(a.membership_id,0),a.final_score or 0)
        out.append({"id":row.id,"title":row.title,"kind":row.kind,"status":row.status,"participants":len(ids),"leaderboard":[{"membership_id":k,"score":v} for k,v in sorted(scores.items(),key=lambda x:x[1],reverse=True)]})
    return out

async def advance_bracket(db: AsyncSession, competition_id: int, round_number: int) -> None:
    current = (await db.scalars(select(CompanyTournamentMatch).where(
        CompanyTournamentMatch.competition_id == competition_id,
        CompanyTournamentMatch.round_number == round_number).order_by(CompanyTournamentMatch.position))).all()
    if not current or any(item.winner_membership_id is None for item in current):
        return
    existing = await db.scalar(select(CompanyTournamentMatch.id).where(
        CompanyTournamentMatch.competition_id == competition_id, CompanyTournamentMatch.round_number == round_number + 1))
    if existing:
        return
    winners = [item.winner_membership_id for item in current]
    if len(winners) == 1:
        current[0].status = "COMPLETED"
        return
    for position, offset in enumerate(range(0, len(winners), 2), 1):
        first = winners[offset]; second = winners[offset + 1] if offset + 1 < len(winners) else None
        db.add(CompanyTournamentMatch(competition_id=competition_id, round_number=round_number + 1, position=position,
            first_membership_id=first, second_membership_id=second, winner_membership_id=first if second is None else None,
            status="BYE" if second is None else "SCHEDULED"))


@router.get("/{company_id}/competitions/{competition_id}/bracket")
async def competition_bracket(company_id: int, competition_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    competition = await db.get(CompanyCompetition, competition_id)
    if not competition or competition.company_id != company_id:
        raise HTTPException(404, "\u0422\u0443\u0440\u043d\u0438\u0440 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    rows = (await db.scalars(select(CompanyTournamentMatch).where(CompanyTournamentMatch.competition_id == competition_id).order_by(CompanyTournamentMatch.round_number, CompanyTournamentMatch.position))).all()
    async def label(member_id):
        if not member_id:
            return None
        member = await db.get(CompanyMembership, member_id); person = await db.get(User, member.user_id) if member else None
        return {"membership_id": member_id, "name": person.display_name or person.username if person else "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a"}
    return {"competition_id": competition.id, "title": competition.title, "rules": __import__("json").loads(competition.rules or "{}"),
            "matches": [{"id": row.id, "round": row.round_number, "position": row.position, "status": row.status,
                         "first": await label(row.first_membership_id), "second": await label(row.second_membership_id),
                         "winner_membership_id": row.winner_membership_id} for row in rows]}


@router.post("/{company_id}/competitions/{competition_id}/matches/{match_id}/result")
async def record_match_result(company_id: int, competition_id: int, match_id: int, body: MatchResultIn,
                              db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id); require_role(member, MANAGE_TEAM)
    competition = await db.get(CompanyCompetition, competition_id)
    match = await db.get(CompanyTournamentMatch, match_id)
    if not competition or competition.company_id != company_id or not match or match.competition_id != competition_id:
        raise HTTPException(404, "\u041c\u0430\u0442\u0447 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    if body.winner_membership_id not in {match.first_membership_id, match.second_membership_id}:
        raise HTTPException(400, "\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u043c \u043c\u0430\u0442\u0447\u0430")
    match.winner_membership_id = body.winner_membership_id; match.status = "COMPLETED"
    await advance_bracket(db, competition_id, match.round_number)
    await audit(db, member, user.id, "TOURNAMENT_MATCH_RECORDED", "tournament_match", match.id)
    await db.commit()
    return {"id": match.id, "winner_membership_id": match.winner_membership_id, "status": match.status}


@router.post("/{company_id}/team-goals")
async def team_goal(company_id:int,body:GoalIn,db:AsyncSession=Depends(get_db),user:User=Depends(get_current_user)):
    member=await require_membership(db,user,company_id); require_role(member,MANAGE_TEAM); row=CompanyTeamGoal(company_id=company_id,title=body.title,target_score=body.target_score,department_id=body.department_id,deadline=body.deadline,created_by=user.id);db.add(row);await db.flush();await audit(db,member,user.id,"TEAM_GOAL_CREATED","team_goal",row.id);await db.commit();return {"id":row.id}


@router.get("/{company_id}/team-goals")
async def team_goals(company_id:int,db:AsyncSession=Depends(get_db),user:User=Depends(get_current_user)):
    member=await require_membership(db,user,company_id)
    rows=(await db.scalars(select(CompanyTeamGoal).where(CompanyTeamGoal.company_id==company_id,CompanyTeamGoal.status=="ACTIVE").order_by(CompanyTeamGoal.deadline))).all()
    result=[]
    for row in rows:
        members_query=select(CompanyMembership.id).where(CompanyMembership.company_id==company_id,CompanyMembership.status=="ACTIVE")
        if row.department_id: members_query=members_query.where(CompanyMembership.department_id==row.department_id)
        member_ids=(await db.scalars(members_query)).all()
        attempts=(await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id==company_id,CompanyAssignmentAttempt.membership_id.in_(member_ids),CompanyAssignmentAttempt.status=="COMPLETED"))).all()
        scores=[item.final_score for item in attempts if item.final_score is not None]
        current=sum(scores); progress=min(100,round(current*100/row.target_score)) if row.target_score else 0
        result.append({"id":row.id,"title":row.title,"target_score":row.target_score,"current_score":current,"progress":progress,
                       "department_id":row.department_id,"deadline":row.deadline.isoformat() if row.deadline else None,
                       "participants":len(member_ids),"completed":current>=row.target_score})
    return result
