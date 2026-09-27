"""Persist installation configuration, speech workers and leased jobs."""
from alembic import op
import sqlalchemy as s

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", s.Column("is_demo", s.Integer(), nullable=False, server_default="0"))
    op.create_table("installation_config", s.Column("id", s.Integer(), primary_key=True),
                    s.Column("revision", s.Integer(), nullable=False), s.Column("value", s.Text(), nullable=False))
    op.create_table("admin_audit", s.Column("id", s.Integer(), primary_key=True),
                    s.Column("actor_id", s.Integer(), s.ForeignKey("users.id")),
                    s.Column("action", s.String(80), nullable=False), s.Column("detail", s.Text(), nullable=False),
                    s.Column("created", s.Float(), nullable=False))
    op.create_table("speech_workers", s.Column("id", s.String(36), primary_key=True),
                    s.Column("name", s.String(80), nullable=False), s.Column("token_hash", s.String(64), nullable=False, unique=True),
                    s.Column("revoked", s.Integer(), nullable=False), s.Column("ready", s.Integer(), nullable=False),
                    s.Column("last_seen", s.Float(), nullable=False), s.Column("diagnostic", s.Text(), nullable=False))
    op.create_table("speech_enrollments", s.Column("id", s.Integer(), primary_key=True),
                    s.Column("code_hash", s.String(64), nullable=False), s.Column("name", s.String(80), nullable=False),
                    s.Column("expires", s.Float(), nullable=False), s.Column("used", s.Integer(), nullable=False))
    op.create_table("speech_jobs", s.Column("id", s.String(36), primary_key=True),
                    s.Column("owner_id", s.Integer(), s.ForeignKey("users.id"), nullable=False),
                    s.Column("context", s.String(120), nullable=False), s.Column("request_key", s.String(100), nullable=False),
                    s.Column("audio_hash", s.String(64), nullable=False), s.Column("audio_size", s.Integer(), nullable=False),
                    s.Column("policy", s.String(16), nullable=False), s.Column("revision", s.Integer(), nullable=False),
                    s.Column("state", s.String(20), nullable=False), s.Column("created", s.Float(), nullable=False),
                    s.Column("deadline", s.Float(), nullable=False),
                    s.Column("worker_id", s.String(36), s.ForeignKey("speech_workers.id")),
                    s.Column("lease_token", s.String(64)), s.Column("lease_until", s.Float()),
                    s.Column("attempt", s.Integer(), nullable=False), s.Column("result", s.Text()),
                    s.Column("error", s.String(80)), s.Column("provider", s.String(24)),
                    s.Column("model", s.String(100)), s.Column("finished", s.Float()),
                    s.UniqueConstraint("owner_id", "context", "request_key"))
    op.create_index("ix_speech_jobs_state", "speech_jobs", ["state"])


def downgrade():
    for table in ("speech_jobs", "speech_enrollments", "speech_workers", "admin_audit", "installation_config"):
        op.drop_table(table)
    op.drop_column("users", "is_demo")
