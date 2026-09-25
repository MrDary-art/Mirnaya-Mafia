"""company material scopes and safe AI-use settings"""

from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_materials") as batch:
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("file_name", sa.String(255), nullable=True))
        batch.add_column(sa.Column("scope_type", sa.String(24), nullable=False, server_default="COMPANY"))
        batch.add_column(sa.Column("department_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("program_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("scenario_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("ai_allowed", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"))
        batch.create_foreign_key("fk_material_department", "company_departments", ["department_id"], ["id"])
        batch.create_foreign_key("fk_material_program", "company_programs", ["program_id"], ["id"])
        batch.create_foreign_key("fk_material_scenario", "company_scenarios", ["scenario_id"], ["id"])


def downgrade():
    with op.batch_alter_table("company_materials") as batch:
        batch.drop_constraint("fk_material_scenario", type_="foreignkey")
        batch.drop_constraint("fk_material_program", type_="foreignkey")
        batch.drop_constraint("fk_material_department", type_="foreignkey")
        batch.drop_column("status")
        batch.drop_column("ai_allowed")
        batch.drop_column("scenario_id")
        batch.drop_column("program_id")
        batch.drop_column("department_id")
        batch.drop_column("scope_type")
        batch.drop_column("file_name")
        batch.drop_column("description")
