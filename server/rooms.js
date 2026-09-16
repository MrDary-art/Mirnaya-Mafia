const { randomBytes } = require("crypto");

function code() {
  return randomBytes(3).toString("hex").slice(0, 5).toUpperCase();
}

class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  create({ scenarioId, hostName }) {
    let id = code();
    while (this.rooms.has(id)) id = code();
    const room = {
      id,
      scenarioId,
      createdAt: Date.now(),
      status: "lobby",
      clients: new Map(),
      assignments: {},
      transcript: [],
    };
    this.rooms.set(id, room);
    return room;
  }

  get(id) {
    return this.rooms.get(String(id || "").toUpperCase()) || null;
  }

  join(room, { clientId, name, ws }) {
    if (room.clients.size >= 2 && !room.clients.has(clientId)) {
      throw new Error("Комната уже заполнена");
    }
    room.clients.set(clientId, { name, ws, ready: false });
  }

  leave(room, clientId) {
    if (!room) return;
    room.clients.delete(clientId);
    if (room.clients.size === 0) this.rooms.delete(room.id);
  }

  peers(room, exceptId) {
    const list = [];
    for (const [id, c] of room.clients) {
      if (id !== exceptId) list.push({ id, name: c.name, ws: c.ws });
    }
    return list;
  }

  send(ws, payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  broadcast(room, payload, exceptId) {
    for (const [id, c] of room.clients) {
      if (id !== exceptId) this.send(c.ws, payload);
    }
  }
}

module.exports = { RoomStore };
