"""One paginated, read-only activity index across persisted game modes."""
from sqlalchemy import select, union_all, literal, cast, String, case, func
from app.models import User, Session, ArenaRoom, LearningAttempt
from app.story_models import StoryAttempt
from app.serial_models import SerialRun
from app.lab_models import LabRun
from app.council_models import CouncilMeeting

MODE_LABELS = {"scenario": "Готовые сценарии", "online": "Разговор с ИИ", "job_interview": "Собеседование с ИИ", "human": "Встречи 1×1 — люди",
               "duel": "Встречи 1×1 — интервью с ИИ", "council": "Совет решений", "learning": "Учебные тесты",
               "story": "Пользовательские истории", "serial": "Интерактивные истории",
               "lab:echo": "Эхо: неделя спустя", "lab:red-zone": "Красная зона"}


def activity_index():
    queries = []
    def add(model, kind, mode, owner, started=True, finished=None, extra=()):
        queries.append(select(literal(kind).label("kind"), cast(model.id, String).label("id"), mode.label("mode"),
            owner.label("user_id"), User.username.label("username"), func.coalesce(func.nullif(User.display_name, ""), User.username).label("name"),
            model.created_at.label("created_at"), model.status.label("status"),
            case((started, 1), else_=0).label("started"), case((finished, 1), else_=0).label("finished"))
            .join(User, User.id == owner).where(User.is_admin == 0, User.is_demo == 0, *extra))
    settings = case((func.json_valid(Session.settings), Session.settings), else_="{}")
    session_mode = case((func.json_extract(settings, "$.practice_kind") == "job_interview", "job_interview"), else_=Session.mode)
    add(Session, "session", session_mode, Session.user_id, finished=Session.finished_at.is_not(None),
        extra=(func.json_extract(settings, "$.room_id").is_(None),))
    add(ArenaRoom, "room", ArenaRoom.mode, ArenaRoom.host_id,
        started=(ArenaRoom.started_at.is_not(None) | ArenaRoom.status.in_(["active", "finished"])),
        finished=ArenaRoom.finished_at.is_not(None))
    add(LearningAttempt, "learning", literal("learning"), LearningAttempt.user_id, finished=LearningAttempt.completed_at.is_not(None))
    add(StoryAttempt, "story", literal("story"), StoryAttempt.user_id, finished=StoryAttempt.finished_at.is_not(None))
    add(SerialRun, "serial", literal("serial"), SerialRun.user_id, finished=SerialRun.status == "completed")
    add(LabRun, "lab", literal("lab:") + LabRun.trainer_id, LabRun.user_id, finished=LabRun.status == "completed")
    add(CouncilMeeting, "council", literal("council"), CouncilMeeting.organizer_id,
        started=CouncilMeeting.status.in_(["active", "finished"]), finished=CouncilMeeting.status == "finished")
    return union_all(*queries).subquery()
