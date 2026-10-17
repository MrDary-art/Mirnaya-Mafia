"""Reproduce the dododo company via the running API, without copying a private DB.

Run from any directory: python backend/scripts/seed_business_demo.py
Only Python's standard library is needed. Run explicitly on a test installation.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

PASSWORD = "1234"
COMPANY_NAME = "Додо · тестовая команда"
PEOPLE = [
    ("dododo_admin", "Мария Соколова", "COMPANY_ADMIN", "Администратор компании"),
    ("dododo_hr", "Анна Смирнова", "LND_MANAGER", "Менеджер обучения"),
    ("dododo_1", "Алексей Иванов", "EMPLOYEE", "Специалист"),
    ("dododo_2", "Елена Петрова", "EMPLOYEE", "Специалист"),
    ("dododo_3", "Дмитрий Орлов", "EMPLOYEE", "Специалист"),
]
TITLES = ["Тест: согласовать скидку", "Тест: повторные переговоры", "Тест: следующий шаг"]


class ApiError(RuntimeError):
    def __init__(self, status, path, detail):
        self.status = status
        super().__init__(f"{path}: HTTP {status}: {detail}")


class DemoApi:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")

    def call(self, path, token=None, body=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(self.base_url + path, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        for retry in range(3):
            try:
                with urlopen(request, timeout=90) as response:
                    return json.load(response)
            except HTTPError as exc:
                if exc.code == 429 and retry < 2:
                    # Respect the API's regular throttling; do not disable it.
                    delay = max(1, min(60, int(exc.headers.get("Retry-After", "60"))))
                    print(f"API rate limit: waiting {delay}s", flush=True)
                    time.sleep(delay)
                    continue
                raise ApiError(exc.code, path, exc.read().decode()) from None

    def account(self, username, name, **registration):
        try:
            result = self.call("/api/auth/login", body={"username": username, "password": PASSWORD})
        except ApiError as exc:
            if exc.status != 401:
                raise
            result = self.call("/api/auth/register", body={"username": username,
                               "password": PASSWORD, "full_name": name, **registration})
        return result["access_token"]


def seed(api):
    owner = api.account("dododo", "Организатор Тестовый", registration_kind="company",
                        email="dododo@arena.test", company_details={
                            "name": COMPANY_NAME, "industry": "Обучение переговорам"})
    context = api.call("/api/company/context", owner)
    owned = [item for item in context["companies"]
             if item["name"] == COMPANY_NAME and item["role"] == "COMPANY_OWNER"]
    if len(owned) != 1:
        raise RuntimeError("dododo exists but does not own the expected demo company; nothing overwritten")
    company_id = owned[0]["company_id"]
    context = api.call(f"/api/company/context?company_id={company_id}", owner)
    code = context["company"]["join_code"]
    base = f"/api/company/{company_id}"
    tokens = {}
    for username, name, role, job_title in PEOPLE:
        token = api.account(username, name, registration_kind="participant", company_code=code)
        applications = api.call(base + "/applications", owner)
        pending = next((row for row in applications if row["username"] == username and row["status"] == "PENDING"), None)
        if pending:
            api.call(base + f"/applications/{pending['id']}/review", owner,
                     {"action": "accept", "corporate_role": role, "job_title": job_title})
        member = api.call(f"/api/company/context?company_id={company_id}", token)
        if member["membership"]["role"] != role:
            raise RuntimeError(f"{username}: unexpected existing role; nothing overwritten")
        tokens[username] = token

    people = api.call(base + "/employees", owner)
    member_ids = [row["membership_id"] for row in people if row["username"] in tokens]
    if len(member_ids) != 5:
        raise RuntimeError("Expected five active demo participants")
    existing = api.call(base + "/assignments", owner)
    assignment_ids = []
    for index, title in enumerate(TITLES):
        assignment = next((row for row in existing if row["title"] == title), None)
        if assignment is None:
            assignment = api.call(base + "/assignments", owner, {
                "title": title, "scenario_id": "sales_discount_01", "membership_ids": member_ids,
                "passing_score": 60, "attempts_allowed": 3, "issue_certificate": True,
                "arena_weight": 100, "company_weight": 0,
                "deadline": (datetime.now(timezone.utc) + timedelta(days=3 + index)).isoformat(),
            })
        assignment_ids.append(assignment["id"])

    # Six actual scenario completions: one per member, plus Elena's repeat.
    # Options are selected by ID order because their display order is shuffled.
    for index, (username, token) in enumerate(tokens.items()):
        membership_id = api.call(f"/api/company/context?company_id={company_id}", token)["membership"]["id"]
        for number, assignment_id in enumerate(assignment_ids[:2 if username == "dododo_2" else 1]):
            assignments = api.call(base + "/assignments", token)
            target = next(row for row in assignments if row["id"] == assignment_id and row["membership_id"] == membership_id)
            if target["status"] in {"PASSED", "COMPLETED", "FAILED"}:
                continue
            launch = api.call(base + f"/assignments/{assignment_id}/start", token, {})
            sid = launch["session_id"]
            for _ in range(40):
                session = api.call(f"/api/sessions/{sid}", token)
                if session["status"] != "active":
                    break
                options = sorted((session.get("step") or {}).get("options", []), key=lambda row: row["id"])
                if not options:
                    raise RuntimeError(f"Session {sid}: active scenario has no answer options")
                api.call(f"/api/sessions/{sid}/choice", token, {"option_id": options[(index + number) % len(options)]["id"]})
            for _ in range(30):
                session = api.call(f"/api/sessions/{sid}", token)
                if session["status"] != "processing":
                    break
                time.sleep(1)
            if session["status"] != "finished":
                raise RuntimeError(f"Session {sid} did not finish: {session['status']}")
            api.call(f"/api/sessions/{sid}/report", token)
            print(f"Completed report: {username}, session {sid}", flush=True)

    attempts = api.call(base + "/attempts?limit=500", owner)
    completed = [row for row in attempts if row["status"] == "COMPLETED"]
    for row in completed:
        api.call(base + f"/attempts/{row['id']}/report", owner)
    if len(completed) < 6:
        raise RuntimeError(f"Expected at least six completed reports, got {len(completed)}")
    for username in ("dododo_1", "dododo_2", "dododo_3"):
        personal_attempts = api.call(base + "/attempts?limit=500", tokens[username])
        me = api.call(f"/api/company/context?company_id={company_id}", tokens[username])["membership"]
        if any(row["membership_id"] != me["id"] for row in personal_attempts):
            raise RuntimeError(f"{username}: unexpected access to another participant's report")
        try:
            api.call(base + "/analytics", tokens[username])
        except ApiError as exc:
            if exc.status != 403:
                raise
        else:
            raise RuntimeError(f"{username}: unexpected access to company analytics")
    return {
        "company_id": company_id, "company_name": COMPANY_NAME, "join_code": code,
        "accounts": [{"username": "dododo", "password": PASSWORD, "role": "COMPANY_OWNER"}]
                    + [{"username": u, "password": PASSWORD, "role": r} for u, _, r, _ in PEOPLE],
        "completed_reports": len(completed), "assignments": assignment_ids,
        "analytics": api.call(base + "/analytics", owner),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Running API origin (without /api)")
    parser.add_argument("--output", type=Path, help="Optional JSON summary; never contains access tokens")
    parser.add_argument("--allow-remote", action="store_true", help="Explicitly seed a remote TEST installation")
    args = parser.parse_args()
    target = urlparse(args.base_url)
    if target.scheme not in {"http", "https"} or not target.hostname:
        parser.error("--base-url must be an HTTP(S) origin")
    if target.hostname not in {"localhost", "127.0.0.1", "::1"} and not args.allow_remote:
        parser.error("Use localhost, or explicitly pass --allow-remote for a test installation")
    result = seed(DemoApi(args.base_url))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
