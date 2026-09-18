from __future__ import annotations
import json
from collections import Counter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.engine.training_tree import NODES, public_node, evaluate
from app.models import TrainingProgress, User

def load(raw, default): return json.loads(raw) if raw else default

async def progress(db: AsyncSession, user: User) -> TrainingProgress:
    row = await db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id))
    if row: return row
    row = TrainingProgress(user_id=user.id)
    db.add(row); await db.flush()
    return row

def state(node, completed):
    if node["type"] in {"root", "profession", "skill"}: return "available"
    if node["id"] in completed: return "mastered" if completed[node["id"]].get("stars") == 3 else "completed"
    return "available" if all(item in completed for item in node.get("required_previous", [])) else "locked"

async def tree(db, user):
    row = await progress(db, user); completed = load(row.completed, {})
    return {"xp":user.xp,"level":user.level,"stars":user.stars,"nodes":[public_node(node) | {"state":state(node, completed),"stars":completed.get(node["id"],{}).get("stars",0)} for node in NODES.values()]}

async def submit(db, user, node_id, option_id, answer, round_index=0):
    node=NODES.get(node_id)
    if not node or node["type"] != "training": raise KeyError(node_id)
    row=await progress(db,user); completed=load(row.completed,{})
    if state(node,completed)=="locked": raise ValueError("Сначала завершите предыдущий уровень")
    result=evaluate(node,option_id,answer,round_index); attempts=load(row.attempts,[])
    attempts.append({"node_id":node_id,"round":round_index,"ok":result["ok"],"tags":result["tags"]})
    total=len(node["exercise"].get("rounds",[node["exercise"]])); completed=result["ok"] and round_index==total-1
    if completed:
        stars=3 if not any(a["node_id"]==node_id and not a["ok"] for a in attempts[:-1]) else 2
        previous=completed.get(node_id,{}); completed[node_id]={"stars":max(previous.get("stars",0),stars)}
        if not previous: user.xp += node["xp_reward"]
    errors=Counter(tag for a in attempts if not a["ok"] for tag in a["tags"] if tag.startswith(("missing_","emotion_","premature_","no_","unreciprocated_","avoidance","грубость")))
    row.completed=json.dumps(completed,ensure_ascii=False); row.attempts=json.dumps(attempts,ensure_ascii=False); row.errors=json.dumps([{"tag":k,"count":v} for k,v in errors.most_common()],ensure_ascii=False)
    await db.commit()
    return result | {"round_index":round_index,"total_rounds":total,"completed":completed,"next_round":round_index+1 if result["ok"] and not completed else None,"tree":await tree(db,user)}

async def errors(db,user):
    row=await progress(db,user); tags=load(row.errors,[])
    selected=[]
    for node in NODES.values():
        if node["type"]=="training" and any(tag["tag"].replace("missing_","") in str(node.get("exercise",{})) for tag in tags[:3]): selected.append(public_node(node))
    return {"errors":tags,"nodes":selected[:3]}

async def complete_final(db,user,node_id,confidence):
    node=NODES.get(node_id)
    if not node or node["type"]!="final": return None
    row=await progress(db,user); completed=load(row.completed,{})
    if state(node,completed)=="locked": return None
    stars=3 if confidence>=75 else 2 if confidence>=55 else 1
    if node_id not in completed: user.xp += node["xp_reward"]
    completed[node_id]={"stars":max(stars,completed.get(node_id,{}).get("stars",0))}; row.completed=json.dumps(completed,ensure_ascii=False)
    return {"node_id":node_id,"stars":stars,"xp_reward":node["xp_reward"]}
