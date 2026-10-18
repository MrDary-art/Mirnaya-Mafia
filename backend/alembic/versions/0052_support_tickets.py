"""Durable support tickets, private diagnostics and participant-confirmed archive."""
import json
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa

revision="0052_support_tickets"
down_revision="0051_company_join_code"
branch_labels=None
depends_on=None


def parsed_date(value):
    try:
        return datetime.fromisoformat(value.replace("Z","+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
    except (ValueError,TypeError,AttributeError):
        return datetime.now(timezone.utc).replace(tzinfo=None)


def upgrade():
    from app.support_models import SupportTicket,SupportTicketMessage,SupportActionLog
    bind=op.get_bind()
    for model in (SupportTicket,SupportTicketMessage,SupportActionLog):
        model.__table__.create(bind,checkfirst=True)
    tickets=SupportTicket.__table__
    messages=SupportTicketMessage.__table__
    existing=set(bind.execute(sa.select(tickets.c.id)).scalars())
    people=set(bind.execute(sa.text("SELECT id FROM users")).scalars())
    grouped={}
    for value in bind.execute(sa.text("SELECT value FROM app_settings WHERE key LIKE 'support_message:%'")).scalars():
        try:
            message=json.loads(value)
            owner=int(message["owner_id"])
            if owner in people:grouped.setdefault(owner,[]).append(message)
        except (ValueError,KeyError,TypeError):
            continue
    for owner,rows in grouped.items():
        identifier=f"legacy-{owner}"
        if identifier in existing:continue
        rows=list({row["id"]:row for row in rows}.values())
        rows.sort(key=lambda row:row.get("at",""))
        bind.execute(tickets.insert().values(id=identifier,owner_id=owner,kind="SUPPORT",status="OPEN",developer_only=0,
            private_context='{"legacy":true}',internal_note="",version=0,created_at=parsed_date(rows[0].get("at")),updated_at=parsed_date(rows[-1].get("at"))))
        for row in rows:
            bind.execute(messages.insert().values(id=row["id"],ticket_id=identifier,author_id=owner if not row.get("staff") else None,
                staff=int(bool(row.get("staff"))),text=row.get("text",""),receipt=row.get("receipt"),created_at=parsed_date(row.get("at"))))
    reports=bind.execute(sa.text("SELECT id,reporter_user_id,reason,target_id,status,created_at,resolved_at FROM social_reports")).mappings()
    for report in reports:
        identifier=f"community-{report['id']}"
        if identifier in existing:continue
        bind.execute(tickets.insert().values(id=identifier,owner_id=report["reporter_user_id"],kind="COMMUNITY",source_report_id=report["id"],
            status="OPEN" if report["status"]=="PENDING" else "CLOSED",developer_only=0,private_context='{"legacy":true}',internal_note="",version=0,
            created_at=parsed_date(report["created_at"]),updated_at=parsed_date(report["created_at"]),closed_at=parsed_date(report["resolved_at"]) if report["resolved_at"] else None))
        bind.execute(messages.insert().values(id=f"community-message-{report['id']}",ticket_id=identifier,author_id=report["reporter_user_id"],staff=0,
            text=f"Обращение о материале №{report['target_id']}: {report['reason']}",created_at=parsed_date(report["created_at"])))


def downgrade():
    bind=op.get_bind()
    # Keep a recoverable snapshot if an operator deliberately rolls the feature back.
    for row in bind.execute(sa.text("SELECT * FROM support_tickets")).mappings():
        bind.execute(sa.text("INSERT OR REPLACE INTO app_settings(key,value) VALUES(:key,:value)"),
                     {"key":f"support_ticket_backup:{row['id']}","value":json.dumps(dict(row),default=str,ensure_ascii=False)})
    for row in bind.execute(sa.text("SELECT m.*,t.owner_id FROM support_ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.kind='SUPPORT'")).mappings():
        value={"id":row["id"],"owner_id":row["owner_id"],"author":"Поддержка" if row["staff"] else f"Участник {row['owner_id']}",
               "staff":bool(row["staff"]),"text":row["text"],"path":"","at":str(row["created_at"]),"receipt":row["receipt"]}
        bind.execute(sa.text("INSERT OR IGNORE INTO app_settings(key,value) VALUES(:key,:value)"),
            {"key":f"support_message:{row['id']}","value":json.dumps(value,ensure_ascii=False)})
    op.drop_table("support_action_log")
    op.drop_table("support_ticket_messages")
    op.drop_table("support_tickets")
