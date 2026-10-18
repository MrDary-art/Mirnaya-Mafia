import sqlite3
from pathlib import Path
from alembic import command
from alembic.config import Config
from app.config import settings


def test_company_migration_preserves_roster_and_private_fields(tmp_path, monkeypatch):
    path=tmp_path/"council-migration.db"
    monkeypatch.setattr(settings,"db_path",str(path))
    root=Path(__file__).resolve().parents[1]
    cfg=Config(str(root/"alembic.ini"));cfg.set_main_option("script_location",str(root/"alembic"))
    command.upgrade(cfg,"0052_support_tickets")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users(id,username,password_hash) VALUES(9001,'migration-owner','unused')")
        db.execute("INSERT INTO companies(id,name,slug,join_code,created_by,corporate_color,secondary_color,timezone,language,status,settings) VALUES(901,'Migration company','migration-company','ABCD-EFGHJ',9001,'#63E6F0','#8B7CFF','Europe/Moscow','ru','ACTIVE','{}')")
        db.execute("INSERT INTO council_meetings(id,organizer_id,organizer_plays,company_id,visibility,status,scheduled_at,agreement,agreement_version,reminder_sent,decision_sent,configuration) VALUES(902,9001,1,901,'private','open','2026-10-25','{}',0,0,0,'{}')")
        db.execute("INSERT INTO council_members(id,meeting_id,user_id,seat,status,ready,role_read,notes,muted,camera_blocked) VALUES(903,902,9001,1,'confirmed',1,1,'private notes',1,0)")
        db.commit()
    command.upgrade(cfg,"head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT company_id,notes,muted,ready FROM council_members WHERE id=903").fetchone()==(901,"private notes",1,1)
        assert db.execute("SELECT COUNT(*) FROM council_companies").fetchone()==(0,)
        assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
    command.downgrade(cfg,"0052_support_tickets")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT notes FROM council_members WHERE id=903").fetchone()==("private notes",)
