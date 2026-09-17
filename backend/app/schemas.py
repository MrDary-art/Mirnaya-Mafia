from typing import Any

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=4, max_length=100)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool
    level: int
    stars: int


class SessionSettings(BaseModel):
    mode: str = "scenario"
    role: str = "HR-специалист"
    opponent_role: str = "Подчинённый"
    problem: str = "Увольнение сотрудника"
    difficulty: str = "medium"
    skill: str = "практик"
    tone: str = "нейтральный"
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
