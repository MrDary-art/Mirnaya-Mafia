"""Persistent, atomic per-account resend cooldowns; counters survive API restarts."""
import json
import math
import time
from fastapi import HTTPException
from sqlalchemy.dialects.sqlite import insert
from app.models import AppSetting


async def reserve_send(db, user_id):
    now = time.time()
    key = f"password-recovery:{user_id}"
    row = await db.get(AppSetting, key)
    previous = row.value if row else None
    saved = json.loads(previous) if previous else {}
    remaining = math.ceil(saved.get("until", 0) - now)
    if remaining > 0:
        raise HTTPException(429, f"Письмо уже запрошено. Повторная отправка через {remaining} сек. Проверьте папку «Спам».", headers={"Retry-After":str(remaining)})
    times = [stamp for stamp in saved.get("sent", []) if stamp > now - 3600]
    delay = 30 if not times else 60 if len(times) == 1 else 300
    encoded = json.dumps({"sent": [*times, now], "until":now+delay})
    statement = insert(AppSetting).values(key=key, value=encoded)
    if previous is None:
        statement = statement.on_conflict_do_nothing(index_elements=["key"])
    else:
        statement = statement.on_conflict_do_update(index_elements=["key"], set_={"value":encoded}, where=AppSetting.value==previous)
    result = await db.execute(statement)
    if result.rowcount != 1:
        raise HTTPException(429, "Запрос уже обрабатывается. Проверьте почту и папку «Спам».", headers={"Retry-After":"30"})
    return delay, len(times) + 1
