import { api, apiBase, setApiBase } from "./api.js";
import { createVoice } from "./voice.js";
import { renderTrainer } from "./trainer.js";
import { renderArena } from "./arena.js";

const app = document.querySelector("#app");
const healthPill = document.querySelector("#health-pill");
const state = {
  view: "menu",
  scenarios: [],
  voice: createVoice(),
  report: null,
};

const views = {
  menu: renderMenu,
  trainer: (root) => renderTrainer(root, { go, state }),
  arena: (root) => renderArena(root, { go, state }),
  report: renderReport,
  settings: renderSettings,
};

function go(view) {
  if (view !== "trainer" && state.trainer) state.trainer.started = false;
  if (view !== "arena" && state.arena?.ws) {
    try {
      state.arena.ws.close();
    } catch {
      /* ignore */
    }
    state.arena.phase = "lobby";
  }
  state.view = view;
  views[view](app);
}

document.body.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) go(nav.dataset.nav);
});

function renderMenu(root) {
  root.innerHTML = `
    <section class="hero">
      <p class="kicker">безопасная практика сделок</p>
      <h1>Тренируйте переговоры,<br>пока ставки ещё учебные.</h1>
      <p class="lede">Два режима: живая арена с людьми и соло со голосовым ИИ. После каждой сессии — разбор техник, ошибок и процента успеха.</p>
    </section>
    <section class="modes">
      <article class="card glass magenta">
        <span class="badge hot">онлайн</span>
        <h2>Сетевая Арена</h2>
        <p>Видеозвонок, роли и скрытые цели. ИИ — судья: техники, нарушения, оценка каждому.</p>
        <button class="btn pink" data-nav="arena" type="button">Выйти на арену</button>
      </article>
      <article class="card glass">
        <span class="badge">соло</span>
        <h2>ИИ-Тренажёр</h2>
        <p>Голосовой спарринг с Ешкой. Она играет клиента, банкира или закупщика и потом разбирает партию.</p>
        <button class="btn" data-nav="trainer" type="button">Начать тренировку</button>
      </article>
    </section>
    <section class="features">
      <article class="mini glass"><h3>Голос</h3><p>Speech-to-Text в браузере сейчас, Whisper на ноутбуке — следующим слоем.</p></article>
      <article class="mini glass"><h3>Файлик разбора</h3><p>Роли, ходы, потеря инициативы, BATNA / SPIN / Гарвард.</p></article>
      <article class="mini glass"><h3>Гибрид</h3><p>Лёгкий фронт в облаке, LLM крутится у вас на RTX — без чужих API.</p></article>
    </section>`;
}

function renderReport(root) {
  const pack = state.report;
  if (!pack?.report) {
    root.innerHTML = `<article class="card glass"><h2>Отчёта ещё нет</h2><button class="btn" data-nav="menu">В меню</button></article>`;
    return;
  }
  const r = pack.report;
  root.innerHTML = `
    <section class="hero">
      <p class="kicker">пост-анализ</p>
      <h1>${pack.meta?.scenario?.title || "Сессия"}</h1>
      <p class="lede">${r.summary || ""}</p>
    </section>
    <section class="report-grid">
      <article class="card glass">
        <div class="muted">Успех</div>
        <div class="score">${r.successPercent ?? "—"}%</div>
        <p>Сделка: ${r.dealReached ? "да" : "нет / неясно"}</p>
      </article>
      <article class="card glass">
        <h3>Методики</h3>
        <p>${r.methodologyNotes || "—"}</p>
      </article>
    </section>
    <div style="height:14px"></div>
    ${(r.players || [])
      .map(
        (p) => `
      <article class="card glass" style="margin-bottom:12px">
        <h3>${p.roleName || p.roleId} · ${p.score ?? "—"} / 100</h3>
        <p>Инициатива: ${p.initiative || "—"}</p>
        <p>Техники: ${(p.techniquesUsed || []).join(", ") || "—"}</p>
        <p>Не использовано: ${(p.techniquesMissed || []).join(", ") || "—"}</p>
        <p>Ошибки: ${(p.errors || []).join("; ") || "—"}</p>
        <p>Как лучше: ${(p.betterMoves || []).join("; ") || "—"}</p>
      </article>`
      )
      .join("")}
    <article class="card glass">
      <h3>Ключевые моменты</h3>
      ${(r.keyMoments || []).map((m) => `<p><strong>${m.when}</strong> — ${m.comment}</p>`).join("") || "<p class='muted'>—</p>"}
      <div class="row" style="margin-top:12px">
        <button class="btn" id="dl" type="button">Скачать файлик JSON</button>
        <button class="ghost" data-nav="menu" type="button">В меню</button>
      </div>
    </article>`;
  root.querySelector("#dl").onclick = () => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `arena-report-${Date.now()}.json`;
    a.click();
  };
}

function renderSettings(root) {
  root.innerHTML = `
    <article class="card glass">
      <p class="kicker">гибридная схема</p>
      <h1>Подключение ядра</h1>
      <p class="lede">Фронт можно выложить на Vercel. Тяжёлая модель остаётся на ноутбуке: укажите URL Cloudflare Tunnel к локальному серверу.</p>
      <div class="field">
        <span>Базовый URL API (пусто = этот же хост)</span>
        <input id="base" value="${escapeAttr(apiBase())}" placeholder="https://xxxx.trycloudflare.com" />
      </div>
      <div class="row">
        <button class="btn" id="save" type="button">Сохранить</button>
        <button class="ghost" data-nav="menu" type="button">Назад</button>
      </div>
      <p class="muted" id="smsg"></p>
    </article>`;
  root.querySelector("#save").onclick = async () => {
    setApiBase(root.querySelector("#base").value);
    root.querySelector("#smsg").textContent = "Сохранено. Проверяю ядро…";
    await ping();
  };
}

function escapeAttr(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function ping() {
  try {
    const h = await api("/api/health");
    if (h.ollama?.ok && h.ollama.hasModel) {
      healthPill.textContent = `Ollama · ${h.ollama.model}`;
      healthPill.className = "pill ok";
    } else if (h.ollama?.ok) {
      healthPill.textContent = `Ollama без ${h.ollama.model}`;
      healthPill.className = "pill";
    } else {
      healthPill.textContent = "сервер ок, Ollama выкл";
      healthPill.className = "pill";
    }
  } catch {
    healthPill.textContent = "ядро недоступно";
    healthPill.className = "pill bad";
  }
}

async function boot() {
  await ping();
  try {
    const data = await api("/api/scenarios");
    state.scenarios = data.scenarios;
  } catch {
    state.scenarios = [];
  }
  go("menu");
}

boot();
