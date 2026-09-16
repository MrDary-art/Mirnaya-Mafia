import { api } from "./api.js";

export async function renderTrainer(root, { go, state }) {
  const scenarios = state.scenarios || [];
  if (!state.trainer) {
    state.trainer = {
      scenarioId: scenarios[0]?.id,
      roleId: scenarios[0]?.roles[0]?.id,
      history: [],
      started: false,
    };
  }
  const t = state.trainer;
  const scenario = scenarios.find((s) => s.id === t.scenarioId) || scenarios[0];
  const role = scenario?.roles.find((r) => r.id === t.roleId) || scenario?.roles[0];

  if (!t.started) {
    root.innerHTML = `
      <section class="grid-2">
        <article class="card glass">
          <p class="kicker">ИИ-тренажёр · Ешка</p>
          <h1>Соло-спарринг</h1>
          <p class="lede">Выберите кейс и роль. Ешка играет оппонента голосом и текстом, затем разберёт партию по Гарварду, SPIN и BATNA.</p>
          ${scenarios
            .map(
              (s) => `
            <button class="scenario ${s.id === t.scenarioId ? "active" : ""}" data-sc="${s.id}" type="button">
              <strong>${s.title}</strong>
              <div class="muted">${s.category} · ~${s.durationMin} мин</div>
              <div>${s.description}</div>
              <div class="tags">${s.techniques.map((x) => `<span class="tag">${x}</span>`).join("")}</div>
            </button>`
            )
            .join("")}
        </article>
        <article class="card glass">
          <h2>Ваша роль</h2>
          <div class="field">
            <span>Кого играете</span>
            <select id="role">
              ${(scenario?.roles || [])
                .map((r) => `<option value="${r.id}" ${r.id === t.roleId ? "selected" : ""}>${r.name}</option>`)
                .join("")}
            </select>
          </div>
          <p>${role?.publicBrief || ""}</p>
          <div class="hidden-goals">
            Полные скрытые цели и BATNA откроются на площадке. В соло Ешка их знает за оппонента и не сдаётся сразу.
          </div>
          <div class="row" style="margin-top:16px">
            <button class="btn" id="start" type="button">Начать диалог</button>
            <button class="ghost" data-nav="menu" type="button">Назад</button>
          </div>
        </article>
      </section>`;

    root.querySelectorAll("[data-sc]").forEach((btn) => {
      btn.onclick = () => {
        t.scenarioId = btn.dataset.sc;
        const sc = scenarios.find((s) => s.id === t.scenarioId);
        t.roleId = sc.roles[0].id;
        renderTrainer(root, { go, state });
      };
    });
    root.querySelector("#role").onchange = (e) => {
      t.roleId = e.target.value;
      renderTrainer(root, { go, state });
    };
    root.querySelector("#start").onclick = () => {
      t.started = true;
      t.history = [];
      renderTrainer(root, { go, state });
    };
    root.querySelector("[data-nav]").onclick = () => go("menu");
    return;
  }

  root.innerHTML = `
    <section class="stage">
      <aside class="card glass">
        <p class="kicker">${scenario.category}</p>
        <h2>${scenario.title}</h2>
        <p class="muted">${role.name}</p>
        <p>${role.publicBrief}</p>
        <div class="hidden-goals">
          Держите инициативу. Фиксируйте цифры. Не отдавайте уступку без встречного условия.
        </div>
      </aside>
      <section class="card glass chat">
        <div class="log" id="log"></div>
        <div class="composer">
          <input id="text" placeholder="Скажите реплику или введите текст…" />
          <button class="ghost" id="mic" type="button">🎤</button>
          <button class="btn" id="send" type="button">Сказать</button>
        </div>
        <p class="muted" id="status"></p>
      </section>
      <aside class="card glass">
        <h3>Ешка</h3>
        <p class="muted">Спарринг-партнёр и тренер. После сессии получите «файлик» разбора.</p>
        <div class="row">
          <button class="btn pink" id="end" type="button">Завершить и разобрать</button>
          <button class="ghost" id="abort" type="button">Выйти</button>
        </div>
      </aside>
    </section>`;

  const logEl = root.querySelector("#log");
  const status = root.querySelector("#status");

  function paint() {
    logEl.innerHTML = t.history
      .map((m) => `<div class="bubble ${m.role === "user" ? "user" : "ai"}">${escapeHtml(m.text)}</div>`)
      .join("");
    logEl.scrollTop = logEl.scrollHeight;
  }
  paint();
  if (!t.history.length) {
    logEl.innerHTML = `<div class="bubble sys">Сессия открыта. Представьтесь и сделайте первый ход.</div>`;
  }

  async function send(text) {
    const userText = text.trim();
    if (!userText) return;
    t.history.push({ role: "user", text: userText });
    paint();
    status.textContent = "Ешка думает…";
    try {
      const res = await api("/api/trainer/reply", {
        method: "POST",
        body: {
          scenarioId: t.scenarioId,
          roleId: t.roleId,
          history: t.history.slice(0, -1),
          userText,
        },
      });
      t.history.push({ role: "assistant", text: res.text });
      paint();
      state.voice?.speak(res.text);
      status.textContent = "";
    } catch (err) {
      status.innerHTML = `<span class="error">${err.message}${err.detail ? " — " + err.detail : ""}</span>`;
    }
  }

  root.querySelector("#send").onclick = () => {
    const input = root.querySelector("#text");
    send(input.value);
    input.value = "";
  };
  root.querySelector("#text").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      send(e.target.value);
      e.target.value = "";
    }
  });
  root.querySelector("#mic").onclick = async () => {
    status.textContent = "Слушаю…";
    try {
      const said = await state.voice.listenOnce();
      root.querySelector("#text").value = said;
      await send(said);
    } catch (err) {
      status.innerHTML = `<span class="error">${err.message}</span>`;
    }
  };
  root.querySelector("#abort").onclick = () => {
    t.started = false;
    t.history = [];
    go("menu");
  };
  root.querySelector("#end").onclick = async () => {
    status.textContent = "Судья пишет отчёт…";
    const opponent = scenario.roles.find((r) => r.id !== t.roleId);
    try {
      const judged = await api("/api/session/judge", {
        method: "POST",
        body: {
          scenarioId: t.scenarioId,
          players: [
            { roleId: t.roleId, roleName: role.name, displayName: "Вы" },
            { roleId: opponent.id, roleName: opponent.name, displayName: "Ешка" },
          ],
          transcript: t.history.map((m) => ({
            speaker: m.role === "user" ? "Вы" : "Ешка",
            text: m.text,
          })),
        },
      });
      state.report = judged;
      t.started = false;
      go("report");
    } catch (err) {
      status.innerHTML = `<span class="error">${err.message}</span>`;
    }
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
