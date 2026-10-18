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

def blocked_intervals(rows, start, end, seats):
    """Exact occupied spans for the requested seat count, without meeting data."""
    max_meetings, max_seats = limits()
    events = {start: [0, 0], end: [0, 0]}
    for row in rows:
        a, b = max(start, row.scheduled_at), min(end, reserve_end(row))
        if row.status == 'cancelled' or a >= b:
            continue
        amount = json.loads(row.configuration or '{}').get('capacity', 4)
        for stamp, count, load in ((a, 1, amount), (b, -1, -amount)):
            item = events.setdefault(stamp, [0, 0])
            item[0] += count
            item[1] += load
    spans, count, people = [], 0, 0
    stamps = sorted(events)
    for index, stamp in enumerate(stamps[:-1]):
        count += events[stamp][0]
        people += events[stamp][1]
        if count + 1 > max_meetings or people + seats > max_seats:
            finish = stamps[index + 1]
            if spans and spans[-1][1] == stamp:
                spans[-1] = (spans[-1][0], finish)
            else:
                spans.append((stamp, finish))
    return spans
