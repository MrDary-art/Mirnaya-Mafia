import asyncio
import re
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import (
    Company, CompanyAssignment, CompanyAssignmentTarget, CompanyCertificate, CompanyMembership,
)
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_certificate_download_handles_long_cyrillic_values_and_remains_private():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    completed_at = datetime(2026, 9, 29)
    title = "Переговоры о долгосрочном партнёрстве, распределении ответственности и интересах участников проекта"

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([
                User(id=1001, username="alexandra_mironova_partner_development", password_hash="unused",
                     first_name="Александра-Екатерина", middle_name="Сергеевна",
                     last_name="Миронова-Константинопольская"),
                User(id=1002, username="another-member", password_hash="unused"),
            ])
            await db.flush()
            db.add(Company(id=1001, name='Компания «Развитие & партнёрство» <Учебный пример>',
                           slug="certificate-test", created_by=1001))
            await db.flush()
            db.add_all([
                CompanyMembership(id=user_id, company_id=1001, user_id=user_id, status="ACTIVE",
                                  corporate_role="EMPLOYEE", job_title="Руководитель корпоративного обучения")
                for user_id in (1001, 1002)
            ])
            db.add(CompanyAssignment(id=1001, company_id=1001, title=title, created_by=1001, passing_score=70))
            await db.flush()
            db.add(CompanyAssignmentTarget(company_id=1001, assignment_id=1001, membership_id=1001,
                                           status="COMPLETED", best_score=92, completed_at=completed_at))
            db.add_all([
                CompanyCertificate(id=1001, company_id=1001, membership_id=1001, title=title,
                                   certificate_id="ARENA-PDF-TEST", verification_code="test-code-1",
                                   issued_at=completed_at, expires_at=datetime(2027, 9, 29)),
                CompanyCertificate(id=1002, company_id=1001, membership_id=1002, title="Без связанного задания",
                                   certificate_id="ARENA-PDF-FALLBACK", verification_code="test-code-2",
                                   issued_at=completed_at),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    try:
        client = TestClient(app)
        for user_id, username, code in (
            (1001, "alexandra_mironova_partner_development", "ARENA-PDF-TEST"),
            (1002, "another-member", "ARENA-PDF-FALLBACK"),
        ):
            headers = {"Authorization": f"Bearer {create_token(user_id, username)}"}
            response = client.get(f"/api/company/1001/certificates/{user_id}/pdf", headers=headers)
            assert response.status_code == 200, response.text[:200]
            assert response.headers["content-type"] == "application/pdf"
            assert response.headers["content-disposition"] == f'attachment; filename="{code}.pdf"'
            assert response.content.startswith(b"%PDF-")
            assert response.content.rstrip().endswith(b"%%EOF")
            assert len(re.findall(rb"/Type\s*/Page\b", response.content)) == 1
            assert b"/FontFile2" in response.content  # Cyrillic fonts travel with the file.
            dimensions = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", response.content)
            assert dimensions is not None
            assert abs(float(dimensions[1]) - 841.89) < 0.1
            assert abs(float(dimensions[2]) - 595.28) < 0.1
            other_id = 1002 if user_id == 1001 else 1001
            assert client.get(f"/api/company/1001/certificates/{other_id}/pdf", headers=headers).status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())
