"""Bounded, process-local throttling; deployment runs one API worker."""
import time
from collections import OrderedDict, deque
from fastapi import HTTPException

_limits = OrderedDict()


def rate_limit(action, key, count=10, window=60):
    now = time.monotonic()
    bucket = _limits.setdefault((action, key), deque())
    _limits.move_to_end((action, key))
    while bucket and bucket[0] < now - window:
        bucket.popleft()
    if len(bucket) >= count:
        raise HTTPException(429, "Слишком много попыток. Подождите минуту.", headers={"Retry-After": str(window)})
    bucket.append(now)
    while len(_limits) > 10000:
        _limits.popitem(last=False)
