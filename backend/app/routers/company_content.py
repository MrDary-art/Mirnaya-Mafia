import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_scenario_engine import normalize_steps
from app.company_models import CompanyAssignment, CompanyAssignmentTarget, CompanyDepartment, CompanyKPI, CompanyMaterial, CompanyProgram, CompanyProgramEnrollment, CompanyProgramStep, CompanyScenario
from app.db import get_db
from app.models import User
from app.services import dumps
from app.routers.company import KPIIn, MANAGE_ALL, ProgramIn, ScenarioIn, as_json, audit, require_membership, require_role

class ProgramStepsIn(BaseModel):
    steps: list[dict]


class ProgramStatusIn(BaseModel):
    status: str


class MaterialIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    description: str = Field(default="", max_length=3000)
    content_type: str = Field(default="TEXT", max_length=40)
    content: str = Field(min_length=1, max_length=20000)
    file_name: str | None = Field(default=None, max_length=255)
    scope_type: str = "COMPANY"
    department_id: int | None = None
    program_id: int | None = None
    scenario_id: int | None = None
    confidential: bool = False
    ai_allowed: bool = True


class ScenarioDraftIn(BaseModel):
    situation: str = Field(min_length=30, max_length=6000)
    industry: str = Field(default="", max_length=120)
    employee_role: str = Field(default="", max_length=160)
    opponent_role: str = Field(default="", max_length=160)


class ScenarioStatusIn(BaseModel):
    status: str

router = APIRouter(prefix="/company", tags=["company-content"])

MATERIAL_STORAGE = Path(__file__).resolve().parents[2] / "data" / "company_materials"
MAX_MATERIAL_BYTES = 10 * 1024 * 1024
ALLOWED_MATERIAL_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx"}


def material_file_path(material: CompanyMaterial) -> Path:
    """Resolve a stored file without accepting a client-controlled filesystem path."""
    if not material.content.startswith("file:"):
        raise HTTPException(404, "\u0424\u0430\u0439\u043b \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    token = material.content.removeprefix("file:")
    if not re.fullmatch(r"[a-f0-9]{32}(?:\.[a-z0-9]{1,8})?", token):
        raise HTTPException(404, "\u0424\u0430\u0439\u043b \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    return MATERIAL_STORAGE / str(material.company_id) / token


async def can_read_material(db: AsyncSession, material: CompanyMaterial, member) -> bool:
    if member.corporate_role in MANAGE_ALL:
        return True
    if material.confidential:
        return False
    if material.scope_type == "COMPANY":
        return True
    if material.scope_type == "DEPARTMENT":
        return material.department_id == member.department_id
    if material.scope_type == "PROGRAM":
        return bool(await db.scalar(select(CompanyProgramEnrollment.id).where(
            CompanyProgramEnrollment.membership_id == member.id,
            CompanyProgramEnrollment.program_id == material.program_id,
            CompanyProgramEnrollment.status == "ACTIVE",
        )))
    if material.scope_type == "SCENARIO":
        return bool(await db.scalar(select(CompanyAssignmentTarget.id).join(
            CompanyAssignment, CompanyAssignment.id == CompanyAssignmentTarget.assignment_id
        ).where(
            CompanyAssignmentTarget.membership_id == member.id,
            CompanyAssignment.company_scenario_id == material.scenario_id,
        )))
    return False


def scenario_draft_from_situation(body: ScenarioDraftIn) -> dict:
    """Create a reviewable local draft without sending company data to an external provider."""
    situation = " ".join(body.situation.split())
    situation = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "[контакт скрыт]", situation)
    situation = re.sub(r"(?:\+?\d[\d()\-\s]{8,}\d)", "[телефон скрыт]", situation)
    situation = re.sub(r"https?://\S+", "[ссылка скрыта]", situation)
    employee_role = body.employee_role.strip() or "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438"
    opponent_role = body.opponent_role.strip() or "\u041a\u043b\u0438\u0435\u043d\u0442 \u0438\u043b\u0438 \u0434\u0435\u043b\u043e\u0432\u043e\u0439 \u043f\u0430\u0440\u0442\u043d\u0451\u0440"
    lower = situation.lower()
    is_discount = any(word in lower for word in ("\u0441\u043a\u0438\u0434", "\u0434\u0435\u0448\u0435\u0432", "\u0446\u0435\u043d", "\u043c\u0430\u0440\u0436"))
    title = "\u041f\u0435\u0440\u0435\u0433\u043e\u0432\u043e\u0440\u044b \u043f\u043e \u0443\u0441\u043b\u043e\u0432\u0438\u044f\u043c \u0441\u0434\u0435\u043b\u043a\u0438" if is_discount else "\u0414\u0435\u043b\u043e\u0432\u044b\u0435 \u043f\u0435\u0440\u0435\u0433\u043e\u0432\u043e\u0440\u044b \u0441 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c"
    restriction = "\u041d\u0435 \u0441\u043e\u0433\u043b\u0430\u0448\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0443\u0441\u043b\u043e\u0432\u0438\u044f \u0432\u043d\u0435 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b\u0445 \u0433\u0440\u0430\u043d\u0438\u0446 \u0438 \u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433."
    return {
        "draft": {
            "title": title,
            "description": "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u043d\u0430 \u043e\u0441\u043d\u043e\u0432\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u043d\u043e\u0439 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u0439 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0435\u0433\u043e \u043f\u0435\u0440\u0435\u0434 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435\u043c.",
            "industry": body.industry.strip(), "employee_role": employee_role, "opponent_role": opponent_role,
            "context": situation, "employee_goal": "\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u044c \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u044b \u0432\u0442\u043e\u0440\u043e\u0439 \u0441\u0442\u043e\u0440\u043e\u043d\u044b \u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u043c\u044b\u0439 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.",
            "opponent_goal": "\u0414\u043e\u0431\u0438\u0442\u044c\u0441\u044f \u0432\u044b\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439 \u0438 \u0441\u043d\u0438\u0437\u0438\u0442\u044c \u0441\u0432\u043e\u0438 \u0440\u0438\u0441\u043a\u0438.",
            "difficulty": "\u0441\u0440\u0435\u0434\u043d\u044f\u044f", "tone": "\u043d\u0435\u0439\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439",
            "batna": "\u041e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c \u0434\u043e \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438.",
            "zopa": "\u041e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u0434\u043e \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438.", "restrictions": restriction,
            "success_criteria": ["\u0412\u044b\u044f\u0432\u043b\u0435\u043d\u044b \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u044b \u0432\u0442\u043e\u0440\u043e\u0439 \u0441\u0442\u043e\u0440\u043e\u043d\u044b", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433", "\u0421\u043e\u0431\u043b\u044e\u0434\u0435\u043d\u044b \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u044f"],
            "source_materials": [],
        },
        "opponent_behaviors": ["\u0423\u0442\u043e\u0447\u043d\u044f\u0435\u0442 \u0443\u0441\u043b\u043e\u0432\u0438\u044f", "\u041f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442 \u0430\u043b\u044c\u0442\u0435\u0440\u043d\u0430\u0442\u0438\u0432\u0443", "\u0412\u043e\u0437\u0440\u0430\u0436\u0430\u0435\u0442 \u043f\u043e \u0446\u0435\u043d\u0435 \u0438\u043b\u0438 \u0441\u0440\u043e\u043a\u0430\u043c"],
        "recommended_kpis": ["\u0412\u044b\u044f\u0432\u043b\u0435\u043d\u0438\u0435 \u043f\u043e\u0442\u0440\u0435\u0431\u043d\u043e\u0441\u0442\u0438", "\u0421\u043e\u0431\u043b\u044e\u0434\u0435\u043d\u0438\u0435 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439", "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433"],
        "source": "offline_draft",
    }


@router.get("/{company_id}/materials")
async def materials(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyMaterial).where(
        CompanyMaterial.company_id == company_id, CompanyMaterial.status == "ACTIVE"
    ).order_by(CompanyMaterial.created_at.desc()))).all()
    enrolled_programs = set((await db.scalars(select(CompanyProgramEnrollment.program_id).where(
        CompanyProgramEnrollment.membership_id == member.id, CompanyProgramEnrollment.status == "ACTIVE"
    ))).all())
    assigned_scenarios = set((await db.scalars(select(CompanyAssignment.company_scenario_id).join(
        CompanyAssignmentTarget, CompanyAssignmentTarget.assignment_id == CompanyAssignment.id
    ).where(
        CompanyAssignmentTarget.membership_id == member.id,
        CompanyAssignment.company_scenario_id.is_not(None),
    ))).all())
    def allowed(row: CompanyMaterial) -> bool:
        if member.corporate_role in MANAGE_ALL:
            return True
        if row.confidential:
            return False
        if row.scope_type == "COMPANY":
            return True
        if row.scope_type == "DEPARTMENT":
            return row.department_id == member.department_id
        if row.scope_type == "PROGRAM":
            return row.program_id in enrolled_programs
        if row.scope_type == "SCENARIO":
            return row.scenario_id in assigned_scenarios
        return False
    return [{"id": row.id, "title": row.title, "description": row.description, "content_type": row.content_type,
             "content": row.content if not row.confidential or member.corporate_role in MANAGE_ALL else None,
             "file_name": row.file_name, "scope_type": row.scope_type, "department_id": row.department_id,
             "program_id": row.program_id, "scenario_id": row.scenario_id, "confidential": bool(row.confidential),
             "ai_allowed": bool(row.ai_allowed), "created_at": row.created_at.isoformat()} for row in rows if allowed(row)]


@router.post("/{company_id}/materials")
async def create_material(company_id: int, body: MaterialIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id); require_role(member, MANAGE_ALL)
    scope = body.scope_type.upper()
    if scope not in {"COMPANY", "DEPARTMENT", "PROGRAM", "SCENARIO"}:
        raise HTTPException(400, "\u041d\u0435\u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u043e\u0431\u043b\u0430\u0441\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430")
    references = {"DEPARTMENT": (CompanyDepartment, body.department_id), "PROGRAM": (CompanyProgram, body.program_id),
                  "SCENARIO": (CompanyScenario, body.scenario_id)}
    if scope in references:
        model, identifier = references[scope]
        row_ref = await db.get(model, identifier) if identifier else None
        if not row_ref or row_ref.company_id != company_id:
            raise HTTPException(400, "\u041e\u0431\u043b\u0430\u0441\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430")
    row = CompanyMaterial(company_id=company_id, title=body.title.strip(), description=body.description.strip() or None,
                          content_type=body.content_type.upper(), content=body.content.strip(), file_name=body.file_name,
                          scope_type=scope, department_id=body.department_id if scope == "DEPARTMENT" else None,
                          program_id=body.program_id if scope == "PROGRAM" else None,
                          scenario_id=body.scenario_id if scope == "SCENARIO" else None,
                          confidential=int(body.confidential), ai_allowed=int(body.ai_allowed), created_by=user.id)
    db.add(row); await db.flush(); await audit(db, member, user.id, "MATERIAL_CREATED", "material", row.id,
                                               {"confidential": bool(row.confidential), "scope_type": scope, "ai_allowed": bool(row.ai_allowed)})
    await db.commit(); return {"id": row.id, "title": row.title}


@router.post("/{company_id}/materials/upload")
async def upload_material(
    company_id: int,
    title: str = Form(..., min_length=2, max_length=220),
    file: UploadFile = File(...),
    description: str = Form(default="", max_length=3000),
    confidential: bool = Form(default=False),
    ai_allowed: bool = Form(default=False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Store a company document outside the repository and retain only a safe token in the database."""
    member = await require_membership(db, user, company_id)
    require_role(member, MANAGE_ALL)
    original_name = Path(file.filename or "").name
    suffix = Path(original_name).suffix.lower()
    if not original_name or suffix not in ALLOWED_MATERIAL_EXTENSIONS:
        raise HTTPException(415, "\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b \u0444\u0430\u0439\u043b\u044b PDF, DOCX, TXT, MD, CSV \u0438 XLSX")
    payload = await file.read(MAX_MATERIAL_BYTES + 1)
    if not payload:
        raise HTTPException(400, "\u0424\u0430\u0439\u043b \u043f\u0443\u0441\u0442")
    if len(payload) > MAX_MATERIAL_BYTES:
        raise HTTPException(413, "\u0420\u0430\u0437\u043c\u0435\u0440 \u0444\u0430\u0439\u043b\u0430 \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u043f\u0440\u0435\u0432\u044b\u0448\u0430\u0442\u044c 10 \u041c\u0411")
    token = f"{uuid.uuid4().hex}{suffix}"
    destination = MATERIAL_STORAGE / str(company_id) / token
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".uploading")
    try:
        temporary.write_bytes(payload)
        row = CompanyMaterial(
            company_id=company_id, title=title.strip(), description=description.strip() or None,
            content_type="FILE", content=f"file:{token}", file_name=original_name,
            scope_type="COMPANY", confidential=int(confidential), ai_allowed=int(ai_allowed), created_by=user.id,
        )
        db.add(row)
        await db.flush()
        temporary.replace(destination)
        await audit(db, member, user.id, "MATERIAL_FILE_UPLOADED", "material", row.id,
                    {"file_name": original_name, "bytes": len(payload), "ai_allowed": bool(ai_allowed)})
        await db.commit()
    except Exception:
        temporary.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        await db.rollback()
        raise
    return {"id": row.id, "title": row.title, "file_name": row.file_name}


@router.get("/{company_id}/materials/{material_id}/file")
async def download_material(company_id: int, material_id: int, db: AsyncSession = Depends(get_db),
                            user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    material = await db.get(CompanyMaterial, material_id)
    if not material or material.company_id != company_id or material.status != "ACTIVE":
        raise HTTPException(404, "\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    if not await can_read_material(db, material, member):
        raise HTTPException(403, "\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0443")
    path = material_file_path(material)
    if not path.is_file():
        raise HTTPException(404, "\u0424\u0430\u0439\u043b \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    return FileResponse(path, filename=material.file_name or path.name, media_type="application/octet-stream")

@router.get("/{company_id}/scenarios")
async def company_scenarios(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyScenario).where(CompanyScenario.company_id == company_id,
                                                           CompanyScenario.status != "ARCHIVED").order_by(CompanyScenario.updated_at.desc()))).all()
    return [{"id": row.id, "title": row.title, "description": row.description, "employee_role": row.employee_role,
             "opponent_role": row.opponent_role, "difficulty": row.difficulty, "status": row.status,
             "revision": row.revision, "criteria": as_json(row.success_criteria, []), "steps": as_json(row.scenario_steps, []),
             "updated_at": row.updated_at.isoformat()} for row in rows]


@router.post("/{company_id}/scenarios")
async def create_company_scenario(company_id: int, body: ScenarioIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_ALL)
    try:
        steps = normalize_steps(body.steps, body.context, body.employee_goal)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    row = CompanyScenario(company_id=company_id, title=body.title.strip(), description=body.description.strip(),
        industry=body.industry.strip(), employee_role=body.employee_role.strip(), opponent_role=body.opponent_role.strip(),
        context=body.context.strip(), employee_goal=body.employee_goal.strip(), opponent_goal=body.opponent_goal.strip(),
        difficulty=body.difficulty, tone=body.tone, batna=body.batna.strip(), zopa=body.zopa.strip(),
        restrictions=body.restrictions.strip(), success_criteria=dumps(body.success_criteria), scenario_steps=dumps(steps),
        source_materials=dumps(body.source_materials), author_id=user.id, owner_id=user.id, last_editor_id=user.id)
    db.add(row); await db.flush(); await audit(db, membership, user.id, "SCENARIO_CREATED", "scenario", row.id)
    await db.commit(); return {"id": row.id, "status": row.status}


@router.post("/{company_id}/scenarios/draft")
async def create_scenario_draft(company_id: int, body: ScenarioDraftIn,
                                db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Returns an editable draft only; publication remains an explicit human action."""
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_ALL)
    return scenario_draft_from_situation(body)


@router.put("/{company_id}/scenarios/{scenario_id}")
async def update_company_scenario(company_id: int, scenario_id: int, body: ScenarioIn,
                                  db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_ALL)
    current = await db.get(CompanyScenario, scenario_id)
    if not current or current.company_id != company_id:
        raise HTTPException(404, "\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    values = body.model_dump()
    try:
        values["scenario_steps"] = dumps(normalize_steps(values.pop("steps"), body.context, body.employee_goal))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    values["source_materials"] = dumps(values["source_materials"])
    values["success_criteria"] = dumps(values["success_criteria"])
    if current.status == "PUBLISHED":
        revision = CompanyScenario(company_id=company_id, status="DRAFT", revision=current.revision + 1,
            author_id=current.author_id, owner_id=current.owner_id, last_editor_id=user.id, **values)
        db.add(revision); await db.flush()
        await audit(db, membership, user.id, "SCENARIO_REVISION_CREATED", "scenario", revision.id,
                    {"previous_id": current.id, "revision": revision.revision})
        await db.commit()
        return {"id": revision.id, "revision": revision.revision, "status": revision.status, "created_revision": True}
    for field, value in values.items():
        setattr(current, field, value)
    current.last_editor_id = user.id
    await audit(db, membership, user.id, "SCENARIO_UPDATED", "scenario", current.id, {"revision": current.revision})
    await db.commit()
    return {"id": current.id, "revision": current.revision, "status": current.status, "created_revision": False}


@router.post("/{company_id}/scenarios/{scenario_id}/status")
async def set_company_scenario_status(company_id: int, scenario_id: int, body: ScenarioStatusIn,
                                      db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_ALL)
    if body.status not in {"DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"}:
        raise HTTPException(400, "\u041d\u0435\u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u044f")
    scenario = await db.get(CompanyScenario, scenario_id)
    if not scenario or scenario.company_id != company_id:
        raise HTTPException(404, "\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    if scenario.status == "ARCHIVED" and body.status == "PUBLISHED":
        raise HTTPException(409, "\u0410\u0440\u0445\u0438\u0432\u043d\u0443\u044e \u0432\u0435\u0440\u0441\u0438\u044e \u043d\u0435\u043b\u044c\u0437\u044f \u0441\u043d\u043e\u0432\u0430 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c; \u0441\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u043d\u043e\u0432\u0443\u044e \u0440\u0435\u0432\u0438\u0437\u0438\u044e")
    scenario.status = body.status
    scenario.last_editor_id = user.id
    await audit(db, membership, user.id, "SCENARIO_STATUS_CHANGED", "scenario", scenario.id, {"status": body.status})
    await db.commit()
    return {"id": scenario.id, "revision": scenario.revision, "status": scenario.status}


@router.get("/{company_id}/kpis")
async def kpis(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyKPI).where(CompanyKPI.company_id == company_id,
                                                      CompanyKPI.status == "ACTIVE").order_by(CompanyKPI.name))).all()
    return [{"id": row.id, "name": row.name, "description": row.description, "unit": row.unit, "rule": row.rule,
             "threshold": row.threshold, "weight": row.weight, "required": bool(row.required), "max_score": row.max_score} for row in rows]


@router.post("/{company_id}/kpis")
async def create_kpi(company_id: int, body: KPIIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_ALL)
    row = CompanyKPI(company_id=company_id, name=body.name.strip(), description=body.description.strip(), unit=body.unit,
                     rule=body.rule, threshold=body.threshold, weight=body.weight, required=int(body.required), max_score=body.max_score)
    db.add(row); await db.flush(); await audit(db, membership, user.id, "KPI_CREATED", "kpi", row.id)
    await db.commit(); return {"id": row.id}


@router.get("/{company_id}/programs")
async def company_programs(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyProgram).where(CompanyProgram.company_id == company_id,
                                                          CompanyProgram.status != "ARCHIVED").order_by(CompanyProgram.updated_at.desc()))).all()
    return [{"id": row.id, "title": row.title, "description": row.description, "audience": row.audience,
             "steps": as_json(row.steps, []), "status": row.status} for row in rows]


@router.post("/{company_id}/programs")
async def create_program(company_id: int, body: ProgramIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_ALL)
    row = CompanyProgram(company_id=company_id, title=body.title.strip(), description=body.description.strip(),
                         audience=body.audience.strip(), steps=dumps(body.steps), owner_id=user.id)
    db.add(row); await db.flush(); await audit(db, membership, user.id, "PROGRAM_CREATED", "program", row.id)
    await db.commit(); return {"id": row.id, "status": row.status}


@router.put("/{company_id}/programs/{program_id}/steps")
async def save_program_steps(company_id: int, program_id: int, body: ProgramStepsIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_ALL)
    program = await db.get(CompanyProgram, program_id)
    if not program or program.company_id != company_id:
        raise HTTPException(404, "\u041e\u0448\u0438\u0431\u043a\u0430")
    if not body.steps:
        raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
    normalized = []
    seen_assignments: set[int] = set()
    for position, item in enumerate(body.steps, 1):
        assignment_id = item.get("assignment_id")
        if not isinstance(assignment_id, int):
            raise HTTPException(400, f"\u041e\u0448\u0438\u0431\u043a\u0430")
        assignment = await db.get(CompanyAssignment, assignment_id)
        if not assignment or assignment.company_id != company_id or assignment.status != "ACTIVE":
            raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
        if assignment_id in seen_assignments:
            raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
        seen_assignments.add(assignment_id)
        title = (item.get("title") or f"\u042d\u0442\u0430\u043f {position}").strip()[:220]
        rule = (item.get("unlock_rule") or "PREVIOUS").upper()
        if rule not in {"PREVIOUS", "MIN_SCORE", "MANUAL"}:
            raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
        min_score = item.get("min_score")
        if rule == "MIN_SCORE" and (not isinstance(min_score, int) or not 0 <= min_score <= 100):
            raise HTTPException(400, "\u041e\u0448\u0438\u0431\u043a\u0430")
        normalized.append({"id": position, "title": title, "content_type": "ASSIGNMENT",
                           "assignment_id": assignment_id, "unlock_rule": rule,
                           "min_score": min_score if rule == "MIN_SCORE" else None,
                           "required": bool(item.get("required", True))})
    existing = (await db.scalars(select(CompanyProgramStep).where(CompanyProgramStep.program_id == program_id))).all()
    for item in existing:
        await db.delete(item)
    for item in normalized:
        db.add(CompanyProgramStep(company_id=company_id, program_id=program_id, position=item["id"],
            title=item["title"], content_type=item["content_type"], assignment_id=item["assignment_id"],
            unlock_rule=item["unlock_rule"], min_score=item["min_score"], required=int(item["required"])))
    program.steps = dumps(normalized)
    await audit(db, membership, user.id, "PROGRAM_STEPS_UPDATED", "program", program_id, {"count": len(normalized)})
    await db.commit()
    return {"steps": normalized}

@router.post("/{company_id}/programs/{program_id}/status")
async def set_program_status(company_id: int, program_id: int, body: ProgramStatusIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_ALL)
    if body.status not in {"DRAFT", "PUBLISHED", "ARCHIVED"}: raise HTTPException(400, "Недопустимый статус программы")
    program = await db.get(CompanyProgram, program_id)
    if not program or program.company_id != company_id: raise HTTPException(404, "Программа не найдена")
    if body.status == "PUBLISHED" and not as_json(program.steps, []):
        raise HTTPException(409, "Нельзя опубликовать программу без этапов")
    program.status = body.status; await audit(db, membership, user.id, "PROGRAM_STATUS_CHANGED", "program", program_id, {"status": body.status})
    await db.commit(); return {"id": program.id, "status": program.status}
