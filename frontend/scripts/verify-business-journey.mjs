import assert from "node:assert/strict";
import { chromium } from "playwright-core";

assert(process.argv.includes("--mutate-demo"), "Pass --mutate-demo to create a completed journey in the local demo company");

const base = process.env.ARENA_BASE_URL || "http://127.0.0.1:5173";
const browserPath = process.env.ARENA_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const password = process.env.ARENA_DEMO_PASSWORD || "company-demo";
const viewportWidth = process.argv.includes("--mobile") ? 390 : 1280;
const withConsent = process.argv.includes("--with-consent");
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "");
const episodeTitle = `Проверка рабочего цикла ${runId}`;
const meetingTitle = `Встреча по рабочему циклу ${runId}`;
const actionTitle = `Подготовить решение ${runId}`;

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
let createdEpisodeId = null;

async function actor(username) {
  const context = await browser.newContext({ viewport: { width: viewportWidth, height: 900 } });
  const response = await context.request.post(`${base}/api/auth/login`, { data: { username, password } });
  assert.equal(response.status(), 200, `${username} can sign in`);
  const { access_token: token } = await response.json();
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
  const owner = await actor("hierarchy_owner");
  const employee = await actor("northstar_13");
  const { company } = await owner.get("/api/company/context");
  assert.equal(company?.slug, "northstar-hierarchy-demo", "the seeded Northstar company is active");
  const companyId = company.id;
  const employeeContext = await employee.get(`/api/company/context?company_id=${companyId}`);
  const employeeId = employeeContext.membership.id;
  const directory = await owner.get(`/api/company/${companyId}/directory`);
  const employeeName = directory.find(person => person.membership_id === employeeId)?.name;
  assert(employeeName, "employee is visible in the owner's directory");

  await owner.page.goto(`${base}/business/${companyId}/episodes?create=1`);
  const createEpisode = owner.page.locator(".business-episode-create");
  await createEpisode.getByLabel("Название").fill(episodeTitle);
  await createEpisode.getByLabel("Ожидаемый результат").fill("Согласовать ответственного и следующий шаг.");
  await createEpisode.getByLabel("Видимость").selectOption("PARTICIPANTS");
  await createEpisode.getByRole("checkbox", { name: new RegExp(employeeName) }).check();
  await createEpisode.getByRole("button", { name: /^Создать$/ }).click();
  await owner.page.waitForURL(/episode=\d+/);
  createdEpisodeId = Number(new URL(owner.page.url()).searchParams.get("episode"));
  assert(createdEpisodeId, "the UI opened the created episode");

  const episodePath = `/api/company/${companyId}/episodes/${createdEpisodeId}`;
  await employee.page.goto(`${base}/business/${companyId}/episodes?episode=${createdEpisodeId}`);
  await employee.page.getByText("Приглашение в эпизод").waitFor();
  await employee.page.getByRole("button", { name: "Принять" }).click();
  await until(() => employee.get(episodePath), value => value.participation?.status === "ACCEPTED", "accepted invitation");
  assert.equal(await employee.page.getByText("Подготовка владельца скрыта.").count(), 1);

  const preparation = owner.page.locator(".business-episode-preparation");
  await preparation.getByLabel("Цель").fill("Выбрать один проверяемый шаг.");
  await preparation.getByLabel("Факты").fill("Клиент ждёт согласованного решения.");
  await preparation.getByRole("button", { name: "Сохранить" }).click();
  await until(() => owner.get(episodePath), value => value.preparation?.facts === "Клиент ждёт согласованного решения.", "saved private preparation");
  await preparation.getByRole("button", { name: /Готово к встрече/ }).click();
  await until(() => owner.get(episodePath), value => value.status === "READY", "ready episode");
  await preparation.getByRole("button", { name: /Создать встречу/ }).click();

  const createMeeting = owner.page.locator(".meeting-create");
  await createMeeting.waitFor();
  await createMeeting.getByLabel("Название").fill(meetingTitle);
  await createMeeting.getByRole("checkbox", { name: new RegExp(employeeName) }).check();
  if (!withConsent) await createMeeting.locator(".meeting-consent input").uncheck();
  await createMeeting.getByRole("button", { name: "Создать встречу" }).click();
  const meeting = await until(
    () => owner.get(`/api/company/${companyId}/meetings`),
    values => values.find(item => item.title === meetingTitle),
    "created meeting",
  );
  const meetingId = meeting.find(item => item.title === meetingTitle).id;
  if (withConsent) {
    await owner.page.getByRole("button", { name: "Согласиться" }).click();
    await employee.page.goto(`${base}/business/${companyId}/meetings?meeting=${meetingId}`);
    await employee.page.getByRole("heading", { name: meetingTitle }).waitFor();
    await employee.page.getByRole("button", { name: "Согласиться" }).click();
    await until(
      () => owner.get(`/api/company/${companyId}/meetings/${meetingId}`),
      value => value.participants.every(person => person.consent_status === "ACCEPTED"),
      "all meeting consents",
    );
    await owner.page.goto(`${base}/business/${companyId}/meetings?meeting=${meetingId}`);
  }
  await owner.page.getByRole("button", { name: "Завершить встречу" }).click();
  await until(() => owner.get(episodePath), value => value.status === "PROTOCOL_REVIEW", "meeting completion");
  await owner.page.getByRole("button", { name: "Подготовить итог" }).click();
  const action = owner.page.locator(".meeting-add-action");
  await action.getByLabel("Что нужно сделать").fill(actionTitle);
  await action.getByLabel("Исполнитель").selectOption(String(employeeId));
  await action.getByLabel("Как понять, что готово").fill("Решение согласовано с командой.");
  await action.getByRole("button", { name: "Добавить в черновик" }).click();
  await owner.page.getByText(actionTitle).waitFor();
  await owner.page.getByRole("button", { name: "Подтвердить версию" }).click();

  await employee.page.goto(`${base}/business/${companyId}/meetings?meeting=${meetingId}`);
  await employee.page.getByRole("heading", { name: meetingTitle }).waitFor();
  await employee.page.getByRole("button", { name: "Подтвердить версию" }).click();
  await owner.page.goto(`${base}/business/${companyId}/meetings?meeting=${meetingId}`);
  await owner.page.getByRole("button", { name: "Опубликовать итог" }).click();
  await until(() => employee.get(episodePath), value => value.commitments?.some(item => item.title === actionTitle), "published commitment");

  await employee.page.goto(`${base}/business/${companyId}/episodes?episode=${createdEpisodeId}`);
  const employeeCommitment = employee.page.locator(".business-episode-commitment").filter({ hasText: actionTitle });
  await employeeCommitment.getByRole("button", { name: "Принять" }).click();
  await employeeCommitment.getByRole("button", { name: "Готово" }).click();
  await until(() => employee.get(episodePath), value => value.commitments?.some(item => item.title === actionTitle && item.status === "COMPLETED"), "completed commitment");

  await owner.page.goto(`${base}/business/${companyId}/episodes?episode=${createdEpisodeId}`);
  const ownerCommitment = owner.page.locator(".business-episode-commitment").filter({ hasText: actionTitle });
  await ownerCommitment.getByRole("button", { name: "Подтвердить" }).click();
  const retrospective = owner.page.locator(".business-episode-retrospective");
  await retrospective.getByLabel("Что получилось").fill("Ответственный и следующий шаг согласованы.");
  await retrospective.getByLabel("Следующий шаг", { exact: true }).fill("Проверить исполнение через неделю.");
  await retrospective.getByRole("button", { name: "Завершить" }).click();

  const finished = await until(() => owner.get(episodePath), value => value.status === "COMPLETED", "completed episode");
  assert(finished.commitments.some(item => item.title === actionTitle && item.status === "VERIFIED"));
  assert.equal(finished.retrospective.outcome, "Ответственный и следующий шаг согласованы.");
  assert.deepEqual(owner.errors, []);
  assert.deepEqual(employee.errors, []);
  console.log(JSON.stringify({ viewportWidth, withConsent, companyId, episodeId: createdEpisodeId, meetingId, employeeId, status: finished.status, commitments: finished.commitments.length }));
} catch (error) {
  if (createdEpisodeId) console.error(`Journey stopped at episode ${createdEpisodeId}`);
  throw error;
} finally {
  await browser.close();
}
