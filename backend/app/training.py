from __future__ import annotations
import json
from collections import Counter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.engine.training_tree import NODES, public_node, evaluate
from app.models import TrainingProgress, User
from app.features.progression import award_xp, record_activity, refresh_rank

def load(raw, default): return json.loads(raw) if raw else default

async def progress(db: AsyncSession, user: User) -> TrainingProgress:
    row = await db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id))
    if row: return row
    row = TrainingProgress(user_id=user.id)
    db.add(row); await db.flush()
    return row

def state(node, completed, xp=0):
    if node["type"] in {"root", "profession", "skill"}: return "available"
    if node["id"] in completed: return "mastered" if completed[node["id"]].get("stars") == 3 else "completed"
    return "available" if xp >= node.get("min_xp", 0) and all(item in completed for item in node.get("required_previous", [])) else "locked"

async def tree(db, user):
    row = await progress(db, user); completed = load(row.completed, {})
    return {"xp":user.xp,"level":user.level,"stars":user.stars,"nodes":[public_node(node) | {"state":state(node, completed, user.xp),"stars":completed.get(node["id"],{}).get("stars",0),"locked_reason": f"Требуется {node.get('min_xp', 0)} опыта обучения" if user.xp < node.get("min_xp", 0) else None} for node in NODES.values()]}

async def submit(db, user, node_id, option_id, answer):
    node=NODES.get(node_id)
    if not node or node["type"] != "training": raise KeyError(node_id)
    row=await progress(db,user); completed=load(row.completed,{})
    if state(node,completed,user.xp)=="locked": raise ValueError("Сначала завершите предыдущий уровень или получите нужный опыт обучения")
    result=evaluate(node,option_id,answer); attempts=load(row.attempts,[])
    attempts.append({"node_id":node_id,"ok":result["ok"],"tags":result["tags"]})
    new_completion = False
    if result["ok"]:
        stars=3 if not any(a["node_id"]==node_id and not a["ok"] for a in attempts[:-1]) else 2
        previous=completed.get(node_id,{}); completed[node_id]={"stars":max(previous.get("stars",0),stars)}
        if not previous:
            await award_xp(db, user, amount=node["xp_reward"], source=node_id)
            new_completion = True
    errors=Counter(tag for a in attempts if not a["ok"] for tag in a["tags"] if tag.startswith(("missing_","emotion_","premature_","no_","unreciprocated_","avoidance","грубость")))
    row.completed=json.dumps(completed,ensure_ascii=False); row.attempts=json.dumps(attempts,ensure_ascii=False); row.errors=json.dumps([{"tag":k,"count":v} for k,v in errors.most_common()],ensure_ascii=False)
    if new_completion:
        await record_activity(db, user, "training")
        await refresh_rank(db, user)
    await db.commit()
    return result | {"tree":await tree(db,user)}

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
    if state(node,completed,user.xp)=="locked": return None
    stars=3 if confidence>=75 else 2 if confidence>=55 else 1
    if node_id not in completed:
        await award_xp(db, user, amount=node["xp_reward"], source=node_id)
    completed[node_id]={"stars":max(stars,completed.get(node_id,{}).get("stars",0))}; row.completed=json.dumps(completed,ensure_ascii=False)
    return {"node_id":node_id,"stars":stars,"xp_reward":node["xp_reward"]}
