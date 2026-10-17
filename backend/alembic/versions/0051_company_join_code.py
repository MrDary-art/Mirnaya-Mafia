"""Add unique ten-character company application codes, including existing companies."""
import secrets

from alembic import op
import sqlalchemy as sa

revision = "0051_company_join_code"
down_revision = "0050_company_meeting_protocols"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("companies")}
    if "join_code" not in columns:
        op.add_column("companies", sa.Column("join_code", sa.String(10), nullable=True))
    codes = set(bind.execute(sa.text("SELECT join_code FROM companies WHERE join_code IS NOT NULL")).scalars().all())
    for company_id in bind.execute(sa.text("SELECT id FROM companies WHERE join_code IS NULL")).scalars().all():
        while True:
            raw = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(9))
            code = raw[:4] + "-" + raw[4:]
            if code not in codes:
                break
        codes.add(code)
        bind.execute(sa.text("UPDATE companies SET join_code = :code WHERE id = :id"), {"code": code, "id": company_id})
    constraints = sa.inspect(bind).get_unique_constraints("companies")
    with op.batch_alter_table("companies", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}) as batch:
        batch.alter_column("join_code", existing_type=sa.String(10), nullable=False)
        if not any(item["column_names"] == ["join_code"] for item in constraints):
            batch.create_unique_constraint("uq_companies_join_code", ["join_code"])


def downgrade():
    with op.batch_alter_table("companies", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}) as batch:
        batch.drop_constraint("uq_companies_join_code", type_="unique")
        batch.drop_column("join_code")
