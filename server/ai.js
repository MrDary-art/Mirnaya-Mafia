const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

async function ollamaChat(messages, { json = false, temperature = 0.7 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      format: json ? "json" : undefined,
      options: { temperature },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  return (data.message && data.message.content) || "";
}

function parseJsonLoose(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Модель вернула не-JSON");
  }
}

function trainerSystemPrompt(scenario, playerRole, opponent) {
  return `Ты — «Ешка», голосовой спарринг-партнёр тренажёра «Арена Переговоров».
Говори по-русски, коротко (2–5 предложений), как живой человек в деловой встрече. Без markdown, без списков, без «как ИИ».

Сценарий: ${scenario.title}. ${scenario.description}
Твоя роль: ${opponent.name}. Бриф: ${opponent.publicBrief}
Скрытые цели (не раскрывай прямо): ${opponent.hiddenGoals.join("; ")}.
BATNA: ${opponent.batna}. Точка отказа: ${opponent.walkaway}.

Игрок играет: ${playerRole.name}. ${playerRole.publicBrief}

Правила:
- Реагируй на аргументы, задавай уточняющие вопросы (элементы SPIN уместны).
- Можно уступать пакетно, но не сдавайся с первого запроса.
- Если игрок давит, блефует или перебивает — реагируй по-человечески.
- Если стороны близки к сделке, сам предложи конкретные условия и спроси подтверждение.
- Если зашли в тупик больше трёх кругов — мягко обозначь развилку.`;
}

function judgeSystemPrompt() {
  return `Ты — независимый судья и аналитик «Арены Переговоров».
Оцени переговоры строго, по делу, на русском.
Верни ТОЛЬКО JSON без markdown со схемой:
{
  "summary": "2-4 предложения",
  "dealReached": true,
  "successPercent": 0,
  "players": [
    {
      "roleId": "",
      "roleName": "",
      "score": 0,
      "initiative": "высокая|средняя|низкая",
      "techniquesUsed": ["BATNA"],
      "techniquesMissed": ["SPIN"],
      "errors": ["..."],
      "betterMoves": ["..."],
      "violations": ["перебивание / давление / манипуляция или пусто"]
    }
  ],
  "keyMoments": [{"when": "ход N или цитата", "comment": "..."}],
  "methodologyNotes": "как сработали Гарвардский метод, SPIN, BATNA"
}`;
}

async function trainerReply({ scenario, playerRole, opponent, history, userText }) {
  const messages = [
    { role: "system", content: trainerSystemPrompt(scenario, playerRole, opponent) },
    ...history.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    })),
    { role: "user", content: userText },
  ];
  const text = await ollamaChat(messages, { temperature: 0.75 });
  return text.trim();
}

async function judgeSession({ scenario, players, transcript }) {
  const playerBlock = players
    .map(
      (p) =>
        `Роль ${p.roleName} (id=${p.roleId}, участник=${p.displayName || "игрок"}): цели ${
          p.hiddenGoals ? p.hiddenGoals.join("; ") : "скрыты"
        }; BATNA: ${p.batna || "—"}; отказ: ${p.walkaway || "—"}`
    )
    .join("\n");

  const lines = transcript
    .map((t, i) => `${i + 1}. [${t.speaker}] ${t.text}`)
    .join("\n");

  const content = `Сценарий: ${scenario.title}\n${scenario.description}\n\nУчастники:\n${playerBlock}\n\nТранскрипт:\n${lines || "(пусто)"}`;

  const raw = await ollamaChat(
    [
      { role: "system", content: judgeSystemPrompt() },
      { role: "user", content },
    ],
    { json: true, temperature: 0.2 }
  );

  return parseJsonLoose(raw);
}

async function health() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { ok: false, model: OLLAMA_MODEL, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const hasModel = models.some((n) => n.startsWith(OLLAMA_MODEL.split(":")[0]));
    return { ok: true, model: OLLAMA_MODEL, models, hasModel, url: OLLAMA_URL };
  } catch (err) {
    return { ok: false, model: OLLAMA_MODEL, error: err.message, url: OLLAMA_URL };
  }
}

module.exports = {
  OLLAMA_MODEL,
  trainerReply,
  judgeSession,
  health,
};
