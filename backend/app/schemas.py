from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class LoginIn(BaseModel):
    username: str
    password: str
    portal: Literal["personal", "company"] | None = None


class RegistrationCompanyIn(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    industry: str = Field(default="", max_length=120)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Название компании должно содержать минимум 2 символа")
        return value


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    login: str | None = Field(default=None, min_length=2, max_length=80)
    password: str = Field(min_length=4, max_length=100)
    last_name: str | None = Field(default=None, max_length=80)
    first_name: str | None = Field(default=None, max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    avatar_code: str = "avatar_analyst"
    email: str | None = Field(default=None, max_length=254)
    registration_kind: Literal["personal", "participant", "company"] = "personal"
    company_code: str | None = Field(default=None, min_length=10, max_length=10, pattern=r"^[A-Za-z0-9-]{10}$")
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    company_details: RegistrationCompanyIn | None = None

    @field_validator("username", "login", mode="before")
    @classmethod
    def clean_identifier(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def default_login_to_username(self):
        if self.login is None:
            self.login = self.username
        return self

    @field_validator("full_name")
    @classmethod
    def valid_full_name(cls, value):
        if value is None:
            return None
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Укажите, как к вам обращаться")
        return value


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool
    level: int
    stars: int
    xp: int
    company_id: int | None = None


class SessionSettings(BaseModel):
    mode: str = "scenario"
    practice_kind: Literal["job_interview"] | None = None
    display_name: str = Field(default="", max_length=60)
    target_company: str | None = Field(default=None, max_length=120)
    target_position: str | None = Field(default=None, max_length=120)
    preparation_level: str = Field(default="начальный", max_length=60)
    vacancy_description: str = Field(default="", max_length=4000)
    constraints: str = Field(default="", max_length=1500)
    role: str = "HR-специалист"
    opponent_role: str = "Подчинённый"
    problem: str = "Увольнение сотрудника"
    difficulty: str = "medium"
    skill: str = "практик"
    tone: str = "деловой"
    goal: str = "Уволить без конфликта"
    industry: str | None = None
    company_size: str | None = None
    culture: str | None = None
    ghost: bool = False
    timer: int | None = None
    hidden_goal: bool = False
    chaos: bool = False
    preset: str | None = None
    scenario_id: str | None = None
    training_node_id: str | None = None


class ChoiceIn(BaseModel):
    option_id: str
    used_hint: bool = False
    timeout: bool = False


class MessageIn(BaseModel):
    text: str
    timeout: bool = False


class GuessIn(BaseModel):
    index: int


class AdminSettingsIn(BaseModel):
    context_overrides: dict[str, Any] = Field(default_factory=dict)
    default_difficulty: str = "medium"
    company_name: str = "Арена Переговоров"
    briefing: str = ""


class WeeklyGoalIn(BaseModel):
    sessions: int = Field(ge=1, le=14)


class CorporateAssignmentIn(BaseModel):
    scenario_id: str = Field(min_length=2, max_length=80)
    user_ids: list[int] = Field(min_length=1, max_length=100)
    deadline: str


class LearningSubmitIn(BaseModel):
    answer: str | None = Field(default=None, max_length=2000)
    option_id: str | None = None


class TheoryStepIn(BaseModel):
    current_step: int = Field(ge=0, le=20)


class TrainingSubmitIn(LearningSubmitIn):
    round_index: int = Field(default=0, ge=0, le=9)


class LearningPathAnswerIn(BaseModel):
    exercise_id: str
    option_id: str


class EquipmentIn(BaseModel):
    item_code: str = Field(min_length=2, max_length=80)


class PersonalProfileIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    first_name: str = Field(default="", max_length=80)
    last_name: str = Field(default="", max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, max_length=120)
    specialization: str | None = Field(default=None, max_length=160)
    organization: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=100)
    about: str | None = Field(default=None, max_length=800)
    profile_visibility: str = "public"
    search_visibility: str = "all"
    messages_visibility: str = "friends"


class DirectMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ChatInvitationIn(BaseModel):
    kind: Literal["negotiation", "challenge"]
    display_name: str = Field(min_length=1, max_length=60)
    problem: str = Field(min_length=3, max_length=1000)
    goal: str = Field(min_length=3, max_length=500)
    team_name: str | None = Field(default=None, max_length=80)
    scenario_id: str | None = Field(default=None, max_length=80)
    scheduled_at: str | None = None
    timezone: str = Field(default="Europe/Moscow", max_length=80)
    duration_minutes: int = Field(default=15, ge=2, le=30)
    ranked: bool = False


class OnlineRoomIn(BaseModel):
    guest_id: int | None = None
    scenario_id: str = Field(min_length=2, max_length=80)
    creator_role: str = Field(default="Переговорщик", max_length=80)
    guest_role: str = Field(default="Оппонент", max_length=80)
    difficulty: str = Field(default="medium", max_length=20)


class ChallengeIn(BaseModel):
    receiver_id: int
    scenario_id: str = Field(min_length=2, max_length=80)
