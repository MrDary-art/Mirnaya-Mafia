import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import context
from sqlalchemy import engine_from_config, inspect, pool

from app.config import settings
from app.db import Base
from app import models  # noqa: F401
from app import company_models  # noqa: F401
from app import business_models  # noqa: F401
from app import deployment_models  # noqa: F401
from app import story_models  # noqa: F401
from app import social_models  # noqa: F401
from app import serial_models  # noqa: F401
from app import lab_models  # noqa: F401
from app import company_advanced_models  # noqa: F401
from app import company_completion_models  # noqa: F401
from app import company_meeting_models  # noqa: F401
from app import company_episode_models  # noqa: F401
from app import council_models  # noqa: F401
from app import support_models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", f"sqlite:///{Path(settings.db_path).as_posix()}")
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        # The social feature branch used numeric 0033 before business migrations
        # received the same revision. Identify that schema before Alembic chooses
        # a branch; existing business databases retain their numeric revision.
        with connection.begin():
            schema = inspect(connection)
            if schema.has_table("alembic_version"):
                revisions = connection.exec_driver_sql("SELECT version_num FROM alembic_version").fetchall()
                if (revisions == [("0033",)] and schema.has_table("stories")
                        and schema.has_table("social_posts") and not schema.has_table("business_leads")
                        and not schema.has_table("company_invitations")):
                    connection.exec_driver_sql(
                        "UPDATE alembic_version SET version_num = '0033_social_feed' WHERE version_num = '0033'"
                    )
                # An earlier local build published the meeting-protocol migration
                # under this revision before council configuration was inserted
                # into the canonical chain. Rewind only its stamp; the protocol
                # migration is idempotent and preserves the existing tables.
                if revisions == [("0049_company_meeting_protocols",)]:
                    council_columns = ({column["name"] for column in schema.get_columns("council_meetings")}
                                       if schema.has_table("council_meetings") else set())
                    compatible_revision = ("0049_council_configuration"
                                           if "configuration" in council_columns else "0048_enterprise_completion")
                    connection.exec_driver_sql(
                        "UPDATE alembic_version SET version_num = ? WHERE version_num = '0049_company_meeting_protocols'",
                        (compatible_revision,),
                    )
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
