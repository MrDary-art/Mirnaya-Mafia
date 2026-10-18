"""Host-wide seat and meeting reservations, serialized on an existing settings row."""
import json
import os
from datetime import datetime, timedelta
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from app.models import AppSetting
from app.council_models import CouncilMeeting

DURATIONS = (15, 30, 45, 60, 90)

def limits():
    return max(1, int(os.getenv('COUNCIL_MAX_CONCURRENT_MEETINGS', '1'))), max(4, int(os.getenv('COUNCIL_MAX_CONCURRENT_SEATS', '20')))

def reserve_end(meeting):
    cfg = json.loads(meeting.configuration or '{}')
    return meeting.scheduled_at + timedelta(minutes=cfg.get('reservation_minutes', 50))

def fits(rows, start, minutes, seats):
    max_meetings, max_seats = limits()
    end = start + timedelta(minutes=minutes)
    events = [(start, 1, seats), (end, -1, -seats)]
    for row in rows:
        finish = reserve_end(row)
        if row.status == 'cancelled' or finish <= start or row.scheduled_at >= end:
            continue
        amount = json.loads(row.configuration or '{}').get('capacity', 4)
        events.extend([(max(start, row.scheduled_at), 1, amount), (min(end, finish), -1, -amount)])
    count = people = 0
    for _, change, load in sorted(events, key=lambda e:(e[0], e[1])):
        count += change
        people += load
        if count > max_meetings or people > max_seats:
            return False
    return True

async def reservations(db, start, end):
    return list((await db.scalars(select(CouncilMeeting).where(CouncilMeeting.status != 'cancelled', CouncilMeeting.scheduled_at < end, CouncilMeeting.scheduled_at > start - timedelta(hours=2)))).all())

async def acquire(db, start, minutes, seats):
    if minutes not in DURATIONS:
        raise HTTPException(422, 'Выберите резерв на 15, 30, 45, 60 или 90 минут')
    # This write lock survives until the new meeting and quotas commit together.
    await db.execute(insert(AppSetting).values(key='council_reservation_lock', value='0').on_conflict_do_nothing(index_elements=['key']))
    await db.execute(update(AppSetting).where(AppSetting.key == 'council_reservation_lock').values(value='0'))
    rows = await reservations(db, start, start + timedelta(minutes=minutes))
    if not fits(rows, start, minutes, seats):
        raise HTTPException(409, 'Интервал занят с учётом длительности и числа участников. Выберите свободное время.')
