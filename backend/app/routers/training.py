from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.db import get_db
from app.engine.training_tree import NODES, public_node
from app.models import User
from app.schemas import TrainingSubmitIn
from app.services import create_session, serialize_session
from app.training import errors, submit, tree

router = APIRouter(prefix="/training", tags=["training"])

@router.get("/tree")
async def get_tree(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await tree(db, user)

@router.get("/nodes/{node_id}")
async def get_node(node_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = NODES.get(node_id)
    if not node: raise HTTPException(404, "Узел не найден")
    return public_node(node) | {"tree": await tree(db, user)}

@router.post("/nodes/{node_id}/submit")
async def answer(node_id: str, body: TrainingSubmitIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try: return await submit(db, user, node_id, body.option_id, body.answer, body.round_index)
    except KeyError as exc: raise HTTPException(404, "Упражнение не найдено") from exc
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc

@router.post("/nodes/{node_id}/start")
async def start_final(node_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node=NODES.get(node_id)
    if not node or node["type"] != "final": raise HTTPException(400, "Это не финальная сцена")
    current=await tree(db,user)
    current_node=next(item for item in current["nodes"] if item["id"]==node_id)
    if current_node["state"]=="locked": raise HTTPException(400,"Сначала завершите два упражнения")
    session=await create_session(db,user,{"mode":"scenario","scenario_id":node["scenario_id"],"preset":node["scenario_id"],"training_node_id":node_id,"ghost":False,"goal":node["title"]})
    return serialize_session(session)

@router.get("/errors")
async def get_errors(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await errors(db,user)
