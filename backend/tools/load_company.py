"""Bounded read-heavy load probe for a deployed corporate workspace."""
import argparse
import asyncio
from collections import Counter
from statistics import median
from time import perf_counter
import httpx

async def run(args):
    paths=[f"/api/company/context?company_id={args.company_id}",f"/api/company/{args.company_id}/assignments",f"/api/company/{args.company_id}/calendar",f"/api/company/{args.company_id}/analytics"]
    queue=asyncio.Queue()
    for index in range(args.requests): queue.put_nowait(paths[index%len(paths)])
    durations,statuses=[],Counter()
    async with httpx.AsyncClient(base_url=args.base_url.rstrip("/"),headers={"Authorization":f"Bearer {args.token}"},timeout=args.timeout,limits=httpx.Limits(max_connections=args.concurrency)) as client:
        async def worker():
            while True:
                try:path=queue.get_nowait()
                except asyncio.QueueEmpty:return
                started=perf_counter()
                try:statuses[(await client.get(path)).status_code]+=1
                except httpx.HTTPError:statuses[0]+=1
                durations.append((perf_counter()-started)*1000);queue.task_done()
        started=perf_counter();await asyncio.gather(*(worker() for _ in range(args.concurrency)));elapsed=perf_counter()-started
    ordered=sorted(durations);percentile=lambda p:ordered[min(len(ordered)-1,round((len(ordered)-1)*p))] if ordered else 0
    print({"requests":len(ordered),"seconds":round(elapsed,2),"rps":round(len(ordered)/elapsed,2) if elapsed else 0,"latency_ms":{"median":round(median(ordered),1) if ordered else 0,"p95":round(percentile(.95),1),"p99":round(percentile(.99),1)},"statuses":dict(statuses)})
    if statuses[0] or any(code>=500 for code in statuses):raise SystemExit(1)

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--base-url",required=True);parser.add_argument("--token",required=True);parser.add_argument("--company-id",type=int,required=True);parser.add_argument("--concurrency",type=int,default=10);parser.add_argument("--requests",type=int,default=200);parser.add_argument("--timeout",type=float,default=15);asyncio.run(run(parser.parse_args()))
