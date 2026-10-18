import json
import sqlite3
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.config import settings
from app.models import User,AppSetting


def test_upgrade_preserves_legacy_thread_and_rollback_copy(tmp_path,monkeypatch):
    path=tmp_path/"migration.db"
    monkeypatch.setattr(settings,"db_path",str(path))
    root=Path(__file__).resolve().parents[1]
    cfg=Config(str(root/"alembic.ini"));cfg.set_main_option("script_location",str(root/"alembic"))
    command.upgrade(cfg,"0051_company_join_code")
    engine=create_engine(f"sqlite:///{path.as_posix()}")
    with Session(engine) as db:
        db.add(User(id=1,username="legacy-user",password_hash="unused"));db.flush()
        for i,staff in enumerate((False,True)):
            row={"id":f"old-message-{i}","owner_id":1,"staff":staff,"text":["Старый вопрос","Старый ответ"][i],"at":f"2026-10-17T10:0{i}:00+00:00"}
            db.add(AppSetting(key=f"support_message:{i}",value=json.dumps(row,ensure_ascii=False)))
        db.commit()
    engine.dispose()
    command.upgrade(cfg,"head")
    command.upgrade(cfg,"head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT owner_id,status FROM support_tickets").fetchall()==[(1,"OPEN")]
        assert db.execute("SELECT text FROM support_ticket_messages ORDER BY created_at").fetchall()==[("Старый вопрос",),("Старый ответ",)]
    command.downgrade(cfg,"0051_company_join_code")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM app_settings WHERE key LIKE 'support_ticket_backup:%'").fetchone()[0]==1
    command.upgrade(cfg,"head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM support_ticket_messages").fetchone()[0]==2
