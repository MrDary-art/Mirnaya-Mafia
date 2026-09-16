const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { listScenarios, getScenario, getRole, opponentRole } = require("./scenarios");
const ai = require("./ai");
const { RoomStore } = require("./rooms");

const PORT = Number(process.env.PORT || 8787);
const app = express();
const rooms = new RoomStore();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", async (_req, res) => {
  const ollama = await ai.health();
  res.json({
    ok: true,
    service: "negotiation-arena",
    ollama,
  });
});

app.get("/api/scenarios", (_req, res) => {
  res.json({ scenarios: listScenarios() });
});

app.post("/api/trainer/reply", async (req, res) => {
  try {
    const { scenarioId, roleId, history = [], userText } = req.body || {};
    const scenario = getScenario(scenarioId);
    const playerRole = getRole(scenarioId, roleId);
    if (!scenario || !playerRole || !userText) {
      return res.status(400).json({ error: "Нужны scenarioId, roleId и userText" });
    }
    const opponent = opponentRole(scenario, roleId);
    const text = await ai.trainerReply({
      scenario,
      playerRole,
      opponent,
      history,
      userText,
    });
    res.json({ text, speaker: opponent.name });
  } catch (err) {
    res.status(503).json({
      error: "ИИ-ядро недоступно. Запустите Ollama локально.",
      detail: err.message,
    });
  }
});

app.post("/api/session/judge", async (req, res) => {
  try {
    const { scenarioId, players = [], transcript = [] } = req.body || {};
    const scenario = getScenario(scenarioId);
    if (!scenario) return res.status(400).json({ error: "Неизвестный сценарий" });

    const enriched = players.map((p) => {
      const role = getRole(scenarioId, p.roleId) || {};
      return {
        ...p,
        roleName: p.roleName || role.name,
        hiddenGoals: role.hiddenGoals,
        batna: role.batna,
        walkaway: role.walkaway,
      };
    });

    const report = await ai.judgeSession({
      scenario,
      players: enriched,
      transcript,
    });
    res.json({
      report,
      meta: {
        scenario: {
          id: scenario.id,
          title: scenario.title,
          category: scenario.category,
        },
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(503).json({
      error: "Не удалось получить судейский отчёт от локальной модели.",
      detail: err.message,
    });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.meta = { clientId: null, roomId: null };

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    try {
      handleWs(ws, msg);
    } catch (err) {
      rooms.send(ws, { type: "error", error: err.message });
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.meta.roomId);
    if (!room) return;
    rooms.leave(room, ws.meta.clientId);
    rooms.broadcast(room, {
      type: "peer-left",
      clientId: ws.meta.clientId,
    });
  });
});

function handleWs(ws, msg) {
  switch (msg.type) {
    case "create-room": {
      const scenario = getScenario(msg.scenarioId);
      if (!scenario) throw new Error("Неизвестный сценарий");
      const room = rooms.create({ scenarioId: msg.scenarioId, hostName: msg.name });
      attach(ws, room, msg);
      rooms.send(ws, lobbyPayload(room, "created"));
      break;
    }
    case "join-room": {
      const room = rooms.get(msg.roomId);
      if (!room) throw new Error("Комната не найдена");
      attach(ws, room, msg);
      rooms.send(ws, lobbyPayload(room, "joined"));
      rooms.broadcast(
        room,
        { type: "peer-joined", peers: peerList(room) },
        ws.meta.clientId
      );
      break;
    }
    case "ready": {
      const room = rooms.get(ws.meta.roomId);
      if (!room) throw new Error("Нет комнаты");
      const me = room.clients.get(ws.meta.clientId);
      if (me) me.ready = true;
      maybeStart(room);
      if (room.status === "lobby") {
        rooms.broadcast(room, lobbyPayload(room, "lobby"));
      }
      break;
    }
    case "signal": {
      const room = rooms.get(ws.meta.roomId);
      if (!room) return;
      rooms.broadcast(
        room,
        { type: "signal", from: ws.meta.clientId, data: msg.data },
        ws.meta.clientId
      );
      break;
    }
    case "transcript": {
      const room = rooms.get(ws.meta.roomId);
      if (!room) return;
      const entry = {
        at: Date.now(),
        speaker: msg.speaker,
        clientId: ws.meta.clientId,
        text: String(msg.text || "").trim(),
      };
      if (entry.text) room.transcript.push(entry);
      rooms.broadcast(room, { type: "caption", entry }, ws.meta.clientId);
      break;
    }
    case "end-session": {
      const room = rooms.get(ws.meta.roomId);
      if (!room) return;
      room.status = "ended";
      rooms.broadcast(room, {
        type: "session-ended",
        transcript: room.transcript,
        assignments: room.assignments,
        scenarioId: room.scenarioId,
      });
      break;
    }
    default:
      break;
  }
}

function attach(ws, room, msg) {
  const clientId = msg.clientId || `c_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  rooms.join(room, { clientId, name: msg.name || "Игрок", ws });
  ws.meta.clientId = clientId;
  ws.meta.roomId = room.id;
}

function peerList(room) {
  return [...room.clients.entries()].map(([id, c]) => ({
    id,
    name: c.name,
    ready: c.ready,
  }));
}

function lobbyPayload(room, event) {
  return {
    type: event || "lobby",
    roomId: room.id,
    scenarioId: room.scenarioId,
    status: room.status,
    peers: peerList(room),
    assignments: room.assignments,
    you: null,
  };
}

function maybeStart(room) {
  if (room.status !== "lobby") return;
  if (room.clients.size < 2) return;
  if (![...room.clients.values()].every((c) => c.ready)) return;

  const scenario = getScenario(room.scenarioId);
  const ids = [...room.clients.keys()];
  room.assignments = {
    [ids[0]]: scenario.roles[0].id,
    [ids[1]]: scenario.roles[1].id,
  };
  room.status = "live";
  room.startedAt = Date.now();

  for (const [clientId, c] of room.clients) {
    const roleId = room.assignments[clientId];
    const role = getRole(room.scenarioId, roleId);
    rooms.send(c.ws, {
      type: "session-start",
      roomId: room.id,
      scenarioId: room.scenarioId,
      scenarioTitle: scenario.title,
      role,
      peers: peerList(room),
      durationMin: scenario.durationMin,
    });
  }
}

server.listen(PORT, () => {
  console.log(`Арена Переговоров: http://localhost:${PORT}`);
  console.log(`Ollama: ${process.env.OLLAMA_URL || "http://127.0.0.1:11434"} (${ai.OLLAMA_MODEL})`);
});
