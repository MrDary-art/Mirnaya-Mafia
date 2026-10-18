// Run against an isolated local QA server with two test accounts and deterministic AI.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5188";
const output = resolve("../.cache/hiring-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, args: ["--use-angle=swiftshader"] });
const errors = [];
async function candidate(username, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  const response = await context.request.post(`${base}/api/auth/login`, { data: { username, password: process.env.ARENA_QA_PASSWORD || "qa-password" } });
  assert.equal(response.status(), 200, await response.text());
  const { access_token } = await response.json();
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  return { context, page, token: access_token };
}
async function overflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");
}
try {
  const host = await candidate("hiring_host", 1440);
  const guest = await candidate("hiring_guest", 390);
  await host.page.goto(`${base}/rooms`);
  await host.page.getByRole("button", { name: "Готовый сценарий", exact: true }).click();
  const scenario = host.page.getByText("Сценарий", { exact: true }).locator("..").locator("select");
  const option = await scenario.locator("option").nth(1).getAttribute("value");
  await scenario.selectOption(option);
  await host.page.getByRole("button", { name: /Трудоустройство с ИИ · 1×1/ }).click();
  assert.equal(await host.page.getByRole("button", { name: "Готовый сценарий", exact: true }).count(), 0);
  await host.page.getByLabel("Компания", { exact: true }).fill("Арена");
  await host.page.getByLabel("Должность", { exact: true }).fill("Python-разработчик");
  await host.page.getByLabel("Требования вакансии · необязательно").fill("Разработка API и проверка решений тестами");
  await host.page.getByRole("button", { name: "Сейчас", exact: true }).click();
  await host.page.screenshot({ path: resolve(output, "setup-desktop.png"), fullPage: true });
  const createResponse = host.page.waitForResponse(r => r.url().endsWith("/api/rooms") && r.request().method() === "POST");
  await host.page.getByRole("button", { name: "Проверить встречу →", exact: true }).click();
  await host.page.getByRole("button", { name: "Изменить", exact: true }).click();
  await host.page.getByRole("button", { name: "Проверить встречу →", exact: true }).click();
  await host.page.getByRole("button", { name: "Создать встречу", exact: true }).click();
  const response = await createResponse;
  assert.equal(response.status(), 200, await response.text());
  const room = await response.json();
  assert.equal(room.your_role, "Кандидат");
  assert.equal(room.target_company, "Арена");
  assert.equal(room.scenario.source, "custom");
  assert(!room.problem.includes("Конфликт приоритетов"));
  await host.page.getByRole("button", { name: "Перейти в комнату →", exact: true }).click();
  await host.page.getByRole("heading", { name: room.scenario.title }).first().waitFor();
  await host.page.screenshot({ path: resolve(output, "lobby-desktop.png"), fullPage: true });
  await guest.page.goto(`${base}/rooms?code=${room.code}`);
  await guest.page.getByRole("button", { name: "Проверить приглашение", exact: true }).click();
  await guest.page.getByLabel("Как к вам обращаться").fill("Борис");
  await guest.page.getByRole("button", { name: "Подтвердить и войти →", exact: true }).click();
  await guest.page.waitForURL(`${base}/room/${room.id}`);
  for (const { page } of [host, guest]) {
    await page.getByRole("button", { name: "Начать моё собеседование", exact: true }).click();
    await page.getByLabel("Реплика в комнате").waitFor();
    assert.equal(await page.getByText("Ход интервью", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Как меняются показатели", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Озвучка ответа", { exact: true }).count(), 0);
    await overflow(page);
  }
  await guest.page.screenshot({ path: resolve(output, "interview-mobile.png"), fullPage: true });
  for (const [index, person] of [host, guest].entries()) {
    for (let answer = 1; answer <= 4; answer++) {
      await person.page.getByLabel("Реплика в комнате").fill(`Мой ответ ${answer}: ${index ? "участвовал в учебном проекте и написал тесты API" : "разработала API и уменьшила число запросов на 30%, проверила результат тестами"}.`);
      await person.page.getByRole("button", { name: "Отправить реплику", exact: true }).click();
      await person.page.waitForFunction(() => !document.querySelector('.live-chat-composer textarea')?.value);
    }
    if (!index) {
      await person.page.getByRole("heading", { name: "Ваша попытка завершена", exact: true }).waitFor();
      await person.page.screenshot({ path: resolve(output, "waiting-desktop.png"), fullPage: true });
      assert.equal(await person.page.getByLabel("Реплика в комнате").count(), 0);
    }
  }
  for (const [index, person] of [host, guest].entries()) {
    await person.page.getByRole("heading", { name: "Оффер получает Анна", exact: true }).waitFor({ timeout: 45000 });
    const own = person.page.getByText(index ? "Личная рекомендация B: добавьте измерения" : "Личная рекомендация A: добавьте измерения", { exact: true });
    await own.waitFor();
    assert.equal(await person.page.getByText(index ? "Личная рекомендация A: добавьте измерения" : "Личная рекомендация B: добавьте измерения", { exact: true }).count(), 0);
    assert.equal(await person.page.locator(".report-document-section").count(), 4);
    await person.page.getByRole("button", { name: "Показать в разговоре", exact: true }).last().click();
    assert(await person.page.locator(".report-transcript").evaluate(el => el.open));
    const download = person.page.waitForEvent("download");
    await person.page.getByRole("button", { name: "Скачать отчет в PDF", exact: true }).click();
    await (await download).saveAs(resolve(output, index ? "guest-report.pdf" : "host-report.pdf"));
    await overflow(person.page);
    await person.page.screenshot({ path: resolve(output, index ? "report-mobile.png" : "report-desktop.png"), fullPage: true });
  }
  await host.page.getByRole("button", { name: "Повторить условия встречи", exact: true }).click();
  await host.page.getByLabel("Компания", { exact: true }).waitFor();
  assert.equal(await host.page.getByLabel("Компания", { exact: true }).inputValue(), "Арена");
  assert.equal(await host.page.getByLabel("Должность", { exact: true }).inputValue(), "Python-разработчик");
  assert.equal(await host.page.getByLabel("Требования вакансии · необязательно").inputValue(), "Разработка API и проверка решений тестами");
  const finished = await (await host.context.request.get(`${base}/api/rooms/${room.id}`, { headers: { Authorization: `Bearer ${host.token}` } })).json();
  let fixture = structuredClone(finished);
  await host.page.route(`**/api/rooms/${room.id}`, route => route.fulfill({ json: fixture }));
  fixture.competition = { ...fixture.competition, tie: true, winner_id: null };
  fixture.your_report.hiring_result = { ...fixture.your_report.hiring_result, outcome: "tie", label: "Равный результат" };
  await host.page.goto(`${base}/room/${room.id}`);
  await host.page.getByRole("heading", { name: "Равный результат — победитель не определён", exact: true }).waitFor();
  fixture.competition = { status: "unavailable", winner_id: null, summary: "ИИ недоступен. Повторите сравнение." };
  let retries = 0;
  await host.page.route(`**/api/rooms/${room.id}/processing/retry`, route => { retries++; fixture = structuredClone(finished); return route.fulfill({ json: fixture }); });
  await host.page.getByRole("button", { name: "Повторить сравнение", exact: true }).click();
  await host.page.getByRole("heading", { name: "Оффер получает Анна", exact: true }).waitFor();
  assert.equal(retries, 1);
  await host.page.route(`**/api/rooms/${room.id}/report/pdf`, route => route.fulfill({ status: 503, json: { detail: "Тест: PDF временно недоступен" } }));
  await host.page.getByRole("button", { name: "Скачать отчет в PDF", exact: true }).click();
  await host.page.getByRole("alert").filter({ hasText: "Тест: PDF временно недоступен" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, roomId: room.id, desktop: 1440, mobile: 390, creation: true, invitation: true, independentInterviews: true, detailedReports: true, pdfDownloads: true, repeat: true, tie: true, comparisonRetry: true, pdfFailure: true, errors }));
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    console.error(JSON.stringify({ url: page?.url(), text: await page?.locator("body").innerText() }));
    await page?.screenshot({ path: resolve(output, `failure-${index}.png`), fullPage: true });
  }
  throw error;
} finally {
  await browser.close();
}
