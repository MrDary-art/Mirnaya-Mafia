"""A fresh installation must not depend on current ORM model shapes."""
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.config import settings


def test_fresh_company_meeting_migration_reaches_head(tmp_path, monkeypatch):
    database = tmp_path / "fresh-company-meetings.db"
    monkeypatch.setattr(settings, "db_path", str(database))
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))

    command.upgrade(config, "0050_company_meeting_protocols")
    with sqlite3.connect(database) as db:
        meeting_columns = {row[1] for row in db.execute("PRAGMA table_info(company_meetings)")}
        participant_columns = {row[1] for row in db.execute("PRAGMA table_info(company_meeting_participants)")}
        assert "episode_id" not in meeting_columns
        assert "consent_purposes" not in meeting_columns
        assert "consent_preferences" not in participant_columns

    command.upgrade(config, "head")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == ScriptDirectory.from_config(config).get_current_head()
        meeting_columns = {row[1] for row in db.execute("PRAGMA table_info(company_meetings)")}
        participant_columns = {row[1] for row in db.execute("PRAGMA table_info(company_meeting_participants)")}
        assert {"episode_id", "consent_purposes"} <= meeting_columns
        assert "consent_preferences" in participant_columns
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
