import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

assert(process.argv.includes("--mutate-demo"), "Pass --mutate-demo to complete one local demo assignment");

const base = process.env.ARENA_BASE_URL || "http://127.0.0.1:5173";
const browserPath = process.env.ARENA_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const password = process.env.ARENA_DEMO_PASSWORD || "company-demo";
const output = process.env.ARENA_QA_OUTPUT || "../.cache/business-workspace-qa";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: true });

async function actor(username, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password } });
  assert.equal(login.status(), 200, `${username} can sign in`);
  const { access_token: token } = await login.json();
  await context.addInitScript(value => localStorage.setItem("arena_token", value), token);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function get(path) {
    const result = await context.request.get(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.status(), 200, `${username}: GET ${path}`);
    return result.json();
  }
  return { context, page, get, errors };
}

async function until(read, accept, label) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const width = process.argv.includes("--mobile") ? 390 : 1280;
  const employee = await actor("northstar_13", width);
  const owner = await actor("hierarchy_owner", width);
  const data = await employee.get("/api/company/context");
  const companyId = data.company.id;
  assert.equal(data.company.slug, "northstar-hierarchy-demo");
  const assignment = data.assignments.find(item =>
    item.content_type === "ARENA_SCENARIO" && item.scenario_id && item.show_result_immediately !== false &&
    ["ASSIGNED", "OPENED", "IN_PROGRESS"].includes(item.status) && item.attempts_used < item.attempts_allowed,
  );
  assert(assignment, "employee has an unfinished offline scenario in the demo company");

  await employee.page.goto(`${base}/business/${companyId}/learning`);
  const retryable = data.assignments.find(item => item.status === "FAILED" && item.can_start);
  if (retryable) {
    const retryCard = employee.page.locator(".business-assignment-card").filter({ hasText: retryable.title }).first();
    await retryCard.getByRole("button", { name: "Повторить" }).waitFor();
  }
  const card = employee.page.locator(".business-assignment-card").filter({ hasText: assignment.title }).first();
  await card.getByRole("button", { name: /^(Начать|Продолжить)$/ }).click();
  await employee.page.waitForURL(/\/business\/\d+\/play\/\d+/);
  const sessionId = Number(new URL(employee.page.url()).pathname.split("/").pop());

  let finished = false;
  for (let turn = 0; turn < 30; turn += 1) {
    const choice = employee.page.locator(".scenario-choices button").first();
    await choice.waitFor();
    const responseReady = employee.page.waitForResponse(response =>
      response.url().includes(`/api/sessions/${sessionId}/choice`) && response.request().method() === "POST",
    );
    await choice.click();
    const response = await responseReady;
    if (response.status() !== 200) {
      throw new Error(`Scenario ${assignment.scenario_id}, session ${sessionId}, turn ${turn + 1}: ${response.status()} ${await response.text()}`);
    }
    const result = await response.json();
    if (result.finished) { finished = true; break; }
  }
  assert(finished, "the offline scenario reaches an ending");
  await employee.page.waitForURL(new RegExp(`/business/${companyId}/report/${sessionId}`));
  await employee.page.locator("#business-main").waitFor();
  assert.equal(await employee.page.getByRole("alert").count(), 0, "the personal report has no error");

  const attempt = await until(
    () => employee.get(`/api/company/${companyId}/attempts?limit=500`),
    rows => rows.find(row => row.assignment_id === assignment.id && row.session_id === sessionId && row.status === "COMPLETED"),
    "completed corporate attempt",
  );
  const completedAttempt = attempt.find(row => row.session_id === sessionId);
  const report = await employee.get(`/api/company/${companyId}/attempts/${completedAttempt.id}/report`);
  assert(report.score != null, "the server produced a canonical score");

  await employee.page.goto(`${base}/business/${companyId}/learning`);
  const finishedCard = employee.page.locator(".business-assignment-card").filter({ hasText: assignment.title }).first();
  await finishedCard.getByRole("button", { name: "Показать отчёт" }).click();
  await finishedCard.locator(".business-attempt-score-grid").waitFor();
  assert(await employee.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await finishedCard.screenshot({ path: `${output}/employee-assignment-report-${width}.png` });

  const directory = await owner.get(`/api/company/${companyId}/directory`);
  const employeeName = directory.find(person => person.membership_id === data.membership.id)?.name;
  assert(employeeName);
  await owner.page.goto(`${base}/business/${companyId}/learning?view=manage`);
  await owner.page.locator(".business-assignments-toolbar input[type=search]").fill(employeeName);
  const managerCard = owner.page.locator(".business-assignment-card").filter({ hasText: assignment.title }).filter({ hasText: employeeName }).first();
  await managerCard.getByRole("button", { name: "Показать отчёт" }).click();
  await managerCard.locator(".business-attempt-score-grid").waitFor();
  assert(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await managerCard.screenshot({ path: `${output}/owner-assignment-report-${width}.png` });
  assert.deepEqual(employee.errors, []);
  assert.deepEqual(owner.errors, []);
  console.log(JSON.stringify({ width, companyId, assignmentId: assignment.id, attemptId: completedAttempt.id, sessionId, score: report.score }));
} finally {
  await browser.close();
}
