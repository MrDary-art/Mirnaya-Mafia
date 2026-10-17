"""Both published migration lines reach one head without replaying existing tables."""

import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.config import settings


@pytest.mark.parametrize("starting_revision", ["0033", "0033_social_feed", "legacy_social"])
def test_business_and_social_migrations_reconcile(tmp_path, monkeypatch, starting_revision):
    path = tmp_path / f"{starting_revision}.db"
    monkeypatch.setattr(settings, "db_path", str(path))
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    branch = "0033_social_feed" if starting_revision == "legacy_social" else starting_revision
    command.upgrade(cfg, branch)

    if starting_revision == "legacy_social":
        with sqlite3.connect(path) as db:
            assert db.execute("SELECT version_num FROM alembic_version").fetchall() == [("0033_social_feed",)]
            db.execute("UPDATE alembic_version SET version_num = '0033'")
            db.commit()

    command.upgrade(cfg, "head")
    with sqlite3.connect(path) as db:
        revision = db.execute("SELECT version_num FROM alembic_version").fetchall()
        assert revision == [(ScriptDirectory.from_config(cfg).get_current_head(),)]
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert {"stories", "social_posts", "company_invitations", "business_leads"} <= tables


def test_renamed_company_meeting_revision_reaches_head(tmp_path, monkeypatch):
    path = tmp_path / "renamed-company-meetings.db"
    monkeypatch.setattr(settings, "db_path", str(path))
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "0048_enterprise_completion")
    with sqlite3.connect(path) as db:
        db.execute("UPDATE alembic_version SET version_num = '0049_company_meeting_protocols'")
        db.commit()

    command.upgrade(cfg, "head")

    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == ScriptDirectory.from_config(cfg).get_current_head()
        columns = {row[1] for row in db.execute("PRAGMA table_info(council_meetings)")}
        assert "configuration" in columns
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert {"company_meetings", "company_meeting_protocols"} <= tables
