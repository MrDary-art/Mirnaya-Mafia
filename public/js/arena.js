import { wsUrl } from "./api.js";
import { api } from "./api.js";
import { startLocal, createPeer } from "./webrtc.js";

export async function renderArena(root, { go, state }) {
  if (!state.arena) {
    state.arena = {
      phase: "lobby",
      name: localStorage.getItem("arena.name") || "",
      roomId: "",
      scenarioId: state.scenarios[0]?.id,
      clientId: crypto.randomUUID(),
    };
  }
  const a = state.arena;
  const scenarios = state.scenarios || [];

  if (a.phase === "lobby") {
    root.innerHTML = `
      <section class="grid-2">
        <article class="card glass magenta">
          <p class="kicker">Сетевая арена</p>
          <h1>Переговоры вживую</h1>
          <p class="lede">Два игрока, скрытые цели, видео и голос. ИИ не участвует в разговоре — он судья после финального свистка.</p>
          <div class="field">
            <span>Ваше имя за столом</span>
            <input id="name" value="${escapeAttr(a.name)}" placeholder="Анна Ковалева" />
          </div>
          <div class="field">
            <span>Сценарий комнаты</span>
            <select id="sc">
              ${scenarios.map((s) => `<option value="${s.id}" ${s.id === a.scenarioId ? "selected" : ""}>${s.title}</option>`).join("")}
            </select>
          </div>
          <div class="row">
            <button class="btn pink" id="create" type="button">Создать комнату</button>
          </div>
        </article>
        <article class="card glass">
          <h2>Войти по коду</h2>
          <div class="field">
            <span>Код комнаты</span>
            <input id="code" value="${escapeAttr(a.roomId)}" placeholder="A1B2C" style="text-transform:uppercase" />
          </div>
          <div class="row">
            <button class="btn" id="join" type="button">Подключиться</button>
            <button class="ghost" data-nav="menu" type="button">Назад</button>
          </div>
          <p class="muted" id="err"></p>
        </article>
      </section>`;

    root.querySelector("[data-nav]").onclick = () => go("menu");
    root.querySelector("#create").onclick = () => connect(root, { go, state }, "create");
    root.querySelector("#join").onclick = () => connect(root, { go, state }, "join");
    return;
  }

  if (a.phase === "waiting") {
    root.innerHTML = `
      <article class="card glass">
        <p class="kicker">Лобби</p>
        <h1>Комната ${a.roomId}</h1>
        <p class="lede">Передайте код второму участнику. Когда оба нажмут «Готов», роли раздадутся автоматически.</p>
        <p>Игроки: ${(a.peers || []).map((p) => p.name + (p.ready ? " ✓" : "")).join(" · ") || "ожидание"}</p>
        <div class="row">
          <button class="btn" id="ready" type="button">Готов</button>
          <button class="ghost" id="leave" type="button">Выйти</button>
        </div>
      </article>`;
    root.querySelector("#ready").onclick = () => a.ws?.send(JSON.stringify({ type: "ready" }));
    root.querySelector("#leave").onclick = () => {
      a.ws?.close();
      a.phase = "lobby";
      renderArena(root, { go, state });
    };
    return;
  }

  const role = a.role;
  root.innerHTML = `
    <section class="stage">
      <aside class="card glass">
        <p class="kicker">Скрытое ТЗ</p>
        <h2>${role?.name || "Роль"}</h2>
        <p>${role?.publicBrief || ""}</p>
        <div class="hidden-goals">
          <strong>Цели (только вам)</strong>
          <ul>${(role?.hiddenGoals || []).map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>
          <div>BATNA: ${escapeHtml(role?.batna || "—")}</div>
          <div>Отказ: ${escapeHtml(role?.walkaway || "—")}</div>
        </div>
      </aside>
      <section class="card glass">
        <div class="videos">
          <video id="remote" autoplay playsinline></video>
          <video id="local" autoplay playsinline muted></video>
        </div>
        <div class="composer">
          <input id="cap" placeholder="Зафиксировать фразу в протокол для судьи…" />
          <button class="ghost" id="mic" type="button">🎤 в протокол</button>
          <button class="btn" id="sendcap" type="button">В протокол</button>
        </div>
      </section>
      <aside class="card glass">
        <h3>${a.scenarioTitle || "Сессия"}</h3>
        <p class="muted">ИИ слушает протокол, не вмешивается в эфир.</p>
        <div class="log" id="caps" style="max-height:240px"></div>
        <button class="btn pink" id="end" type="button">Завершить и отдать судье</button>
      </aside>
    </section>`;

  const localV = root.querySelector("#local");
  const remoteV = root.querySelector("#remote");
  const caps = root.querySelector("#caps");

  function paintCaps() {
    caps.innerHTML = (a.transcript || [])
      .map((e) => `<div class="bubble ${e.clientId === a.clientId ? "user" : "ai"}"><strong>${escapeHtml(e.speaker)}</strong><br>${escapeHtml(e.text)}</div>`)
      .join("");
    caps.scrollTop = caps.scrollHeight;
  }
  paintCaps();

  if (!a.stream) {
    try {
      a.stream = await startLocal(localV);
    } catch {
      localV.insertAdjacentHTML("afterend", `<p class="error">Камера недоступна — можно продолжить текстом в протокол.</p>`);
    }
  } else {
    localV.srcObject = a.stream;
    localV.play().catch(() => {});
  }

  if (!a.peer && a.stream) {
    a.peer = createPeer({
      stream: a.stream,
      onRemote: (s) => {
        remoteV.srcObject = s;
        remoteV.play().catch(() => {});
      },
      onSignal: (data) => a.ws?.send(JSON.stringify({ type: "signal", data })),
    });
    if (a.isOfferer) a.peer.offer();
  }

  a.onRemoteStream = (s) => {
    remoteV.srcObject = s;
    remoteV.play().catch(() => {});
  };
  a.onCaps = paintCaps;

  function pushCap(text) {
    const entry = { speaker: a.name, clientId: a.clientId, text: text.trim() };
    if (!entry.text) return;
    a.transcript = a.transcript || [];
    a.transcript.push(entry);
    paintCaps();
    a.ws?.send(JSON.stringify({ type: "transcript", speaker: a.name, text: entry.text }));
  }

  root.querySelector("#sendcap").onclick = () => {
    const el = root.querySelector("#cap");
    pushCap(el.value);
    el.value = "";
  };
  root.querySelector("#mic").onclick = async () => {
    try {
      const said = await state.voice.listenOnce();
      pushCap(said);
    } catch (err) {
      caps.insertAdjacentHTML("beforeend", `<div class="error">${err.message}</div>`);
    }
  };
  root.querySelector("#end").onclick = () => {
    a.ws?.send(JSON.stringify({ type: "end-session" }));
  };
}

async function connect(root, ctx, mode) {
  const { state, go } = ctx;
  const a = state.arena;
  a.name = root.querySelector("#name")?.value.trim() || a.name;
  a.scenarioId = root.querySelector("#sc")?.value || a.scenarioId;
  a.roomId = (root.querySelector("#code")?.value || a.roomId).trim().toUpperCase();
  localStorage.setItem("arena.name", a.name);
  const err = root.querySelector("#err");
  if (!a.name) {
    if (err) err.textContent = "Укажите имя";
    return;
  }

  cleanupRtc(a);
  const ws = new WebSocket(wsUrl());
  a.ws = ws;
  a.transcript = [];
  a.peers = [];

  ws.onopen = () => {
    if (mode === "create") {
      ws.send(
        JSON.stringify({
          type: "create-room",
          scenarioId: a.scenarioId,
          name: a.name,
          clientId: a.clientId,
        })
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "join-room",
          roomId: a.roomId,
          name: a.name,
          clientId: a.clientId,
        })
      );
    }
  };

  ws.onerror = () => {
    if (err) err.textContent = "Нет связи с локальным сервером";
  };

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "error") {
      if (err) err.textContent = msg.error;
      return;
    }
    if (msg.type === "created" || msg.type === "joined" || msg.type === "lobby") {
      a.roomId = msg.roomId;
      a.peers = msg.peers;
      a.phase = "waiting";
      a.isOfferer = mode === "create";
      await renderArena(root, ctx);
    }
    if (msg.type === "peer-joined") {
      a.peers = msg.peers;
      if (a.phase === "waiting") await renderArena(root, ctx);
    }
    if (msg.type === "session-start") {
      a.phase = "live";
      a.role = msg.role;
      a.scenarioId = msg.scenarioId;
      a.scenarioTitle = msg.scenarioTitle;
      await renderArena(root, ctx);
    }
    if (msg.type === "signal" && a.peer) {
      a.peer.handle(msg.data);
    }
    if (msg.type === "caption") {
      a.transcript = a.transcript || [];
      if (msg.entry.clientId !== a.clientId) a.transcript.push(msg.entry);
      a.onCaps?.();
    }
    if (msg.type === "session-ended") {
      try {
        const judged = await api("/api/session/judge", {
          method: "POST",
          body: {
            scenarioId: msg.scenarioId,
            players: Object.entries(msg.assignments || {}).map(([clientId, roleId]) => ({
              roleId,
              displayName: (a.peers || []).find((p) => p.id === clientId)?.name || clientId,
            })),
            transcript: (msg.transcript || []).map((t) => ({
              speaker: t.speaker,
              text: t.text,
            })),
          },
        });
        state.report = judged;
        cleanupRtc(a);
        a.phase = "lobby";
        go("report");
      } catch (e) {
        alert(e.message);
      }
    }
  };
}

function cleanupRtc(a) {
  a.peer?.close();
  a.peer = null;
  a.stream?.getTracks().forEach((t) => t.stop());
  a.stream = null;
  a.ws?.close();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
