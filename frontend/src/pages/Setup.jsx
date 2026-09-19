import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const ROLES = ["Участник переговоров", "HR-специалист", "Менеджер по продажам", "Закупщик", "PM", "Руководитель", "Финансист", "IT", "Маркетолог", "Юрист", "Предприниматель", "Студент"];
const OPPONENTS = ["Собеседник", "Клиент", "Кандидат", "Поставщик", "Подчинённый", "Партнёр", "Инвестор", "Коллега", "Руководитель"];
const PROBLEMS = [["", "Выберу во время разговора"], "Увольнение сотрудника", "Отказ в повышении", "Торг за цену", "Срыв сроков", "Конфликт в команде", "Возврат товара", "Согласование бюджета", "Переговоры о зарплате", "Сложный клиент"];
const PRESET_MAP = {
  hr_firing_01: {
    role: "HR-специалист",
    opponent_role: "Подчинённый",
    problem: "Увольнение сотрудника",
    goal: "Уволить без конфликта, сохранить отношения",
  },
  sales_discount_01: {
    role: "Менеджер по продажам",
    opponent_role: "Клиент",
    problem: "Торг за цену",
    goal: "Закрыть сделку и удержать маржу",
  },
  salary_talk_01: {
    role: "IT",
    opponent_role: "Руководитель",
    problem: "Переговоры о зарплате",
    goal: "Получить повышение или письменный план",
  },
};

export default function Setup() {
  const [params] = useSearchParams();
  const preset = params.get("preset") || "hr_firing_01";
  const online = params.get("mode") === "online";
  const nav = useNavigate();
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("arena_presets") || "[]");
    } catch {
      return [];
    }
  }, []);
  const base = PRESET_MAP[preset] || PRESET_MAP.hr_firing_01;
  const [form, setForm] = useState({
    mode: online ? "online" : "scenario",
    scenario_id: preset,
    preset,
    skill: "практик",
    difficulty: "medium",
    tone: "нейтральный",
    ghost: false,
    timer: null,
    hidden_goal: false,
    chaos: false,
    industry: "",
    company_size: "",
    culture: "",
    display_name: "",
    ...base,
    ...(online ? { role: "Участник переговоров", opponent_role: "Собеседник", problem: "", goal: "" } : {}),
  });
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (online) return;
    api("/api/scenarios").then((items) => {
      const scenario = items.find((item) => item.id === preset);
      if (!scenario) return;
      setForm((current) => ({
        ...current,
        scenario_id: preset,
        preset,
        role: scenario.roles?.player || current.role,
        opponent_role: scenario.roles?.opponent || current.opponent_role,
        problem: scenario.problem || current.problem,
        goal: scenario.goal || current.goal,
        difficulty: scenario.difficulty || current.difficulty,
      }));
    }).catch(() => {});
  }, [preset, online]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function start() {
    setError("");
    const selectedMode = online ? "online" : form.mode;
    if (selectedMode === "online" && (!form.display_name.trim() || !form.problem.trim() || !form.goal.trim())) {
      setError("Укажите имя, ситуацию и желаемый результат до начала беседы.");
      return;
    }
    try {
      const session = await api("/api/sessions", { method: "POST", body: { ...form, mode: selectedMode, timer: form.timer ? Number(form.timer) : null } });
      nav(selectedMode === "online" ? `/practice?session=${session.id}` : `/play/${session.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  function savePreset() {
    const next = [{ name: `${form.role} vs ${form.opponent_role}`, form }, ...saved].slice(0, 8);
    localStorage.setItem("arena_presets", JSON.stringify(next));
    alert("Пресет сохранён в браузере.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-bold">Настройка сессии</h1>
        <p className="mt-1 text-sm text-slate-400">Базовые поля сразу. Остальное — под капотом, чтобы новичок не тонул в 15 параметрах.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {form.mode === "online" && <Field label="Как к вам обращаться">
            <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} />
          </Field>}
          <Field label="Своя роль">
            <Select value={form.role} onChange={(v) => set("role", v)} options={ROLES} />
          </Field>
          <Field label="Роль оппонента">
            <Select value={form.opponent_role} onChange={(v) => set("opponent_role", v)} options={OPPONENTS} />
          </Field>
          <Field label="Проблематика">
            {form.mode === "online" ? <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.problem} onChange={(e) => set("problem", e.target.value)} placeholder="Опишите конкретную ситуацию" /> : <Select value={form.problem} onChange={(v) => set("problem", v)} options={PROBLEMS} />}
          </Field>
          <Field label="Цель">
            <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.goal} onChange={(e) => set("goal", e.target.value)} />
          </Field>
          <Field label="Сложность оппонента">
            <Select
              value={form.difficulty}
              onChange={(v) => set("difficulty", v)}
              options={[
                ["easy", "Лёгкий"],
                ["medium", "Средний"],
                ["hard", "Сложный"],
                ["expert", "Эксперт"],
                ["brutal", "Жёсткий"],
              ]}
            />
          </Field>
          <Field label="Ваш уровень">
            <Select value={form.skill} onChange={(v) => set("skill", v)} options={["новичок", "практик", "опытный"]} />
          </Field>
          <Field label="Тон оппонента">
            <Select value={form.tone} onChange={(v) => set("tone", v)} options={["дружелюбный", "нейтральный", "агрессивный", "манипулятивный"]} />
          </Field>
          <Field label="Режим">
            {online ? <div className="rounded-xl bg-cyan-300/10 p-3 text-cyan-100 ring-1 ring-cyan-300/20">Диалог с ИИ</div> : <Select value={form.mode} onChange={(v) => set("mode", v)} options={[["scenario", "Сценарный (MVP, офлайн)"], ["online", "Онлайн (LLM + fallback)"]]} />}
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ghost} onChange={(e) => set("ghost", e.target.checked)} /> 🎭 Тренер-призрак
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.hidden_goal} onChange={(e) => set("hidden_goal", e.target.checked)} /> 🎯 Скрытая цель
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.chaos} onChange={(e) => set("chaos", e.target.checked)} /> ⚡ Режим хаоса
          </label>
        </div>
        <button className="mt-4 text-sm text-cyan-300" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? "Скрыть расширенные настройки" : "Расширенные настройки"}
        </button>
        {advanced && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Отрасль">
              <Select value={form.industry} onChange={(v) => set("industry", v)} options={["", "IT", "ритейл", "финансы", "производство"]} />
            </Field>
            <Field label="Размер компании">
              <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.company_size} onChange={(e) => set("company_size", e.target.value)} />
            </Field>
            <Field label="Культурный контекст">
              <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.culture} onChange={(e) => set("culture", e.target.value)} />
            </Field>
            <Field label="Таймер давления">
              <Select
                value={form.timer ?? ""}
                onChange={(v) => set("timer", v === "" ? null : v)}
                options={[
                  ["", "Без таймера"],
                  ["60", "60 сек"],
                  ["30", "30 сек"],
                ]}
              />
            </Field>
          </div>
        )}
        {error && <div className="mt-4 text-rose-300">{error}</div>}
        <div className="mt-6 flex gap-3">
          <button onClick={start} className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950">
            Начать переговоры
          </button>
          <button onClick={savePreset} className="rounded-2xl border border-white/15 px-6 py-3">
            Сохранить пресет
          </button>
        </div>
      </div>
      <aside className="space-y-4">
        <div className="glass rounded-3xl p-5 text-sm text-slate-300">
          <div className="font-semibold text-white">Как это считается</div>
          <p className="mt-2">В сценарном режиме LLM не вызывается. Каждая реплика предразмечена: TKI, техники, ΔTrust/Goal/Control/EQ. Confidence = 0.5·Goal + 0.3·Trust + 0.2·Control.</p>
        </div>
        {saved.length > 0 && (
          <div className="glass rounded-3xl p-5">
            <div className="font-semibold">Мои пресеты</div>
            {saved.map((p, i) => (
              <button key={i} className="mt-2 block text-left text-sm text-cyan-300" onClick={() => setForm((f) => ({ ...f, ...p.form, mode: online ? "online" : p.form.mode || f.mode }))}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  const items = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  const [open, setOpen] = useState(false);
  const selected = items.find(([itemValue]) => itemValue === value) || items[0];
  return (
    <div className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-xl border border-cyan-300/30 bg-cyan-950/35 p-3 text-left text-slate-100 shadow-inner shadow-cyan-950/30 transition hover:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/40">
        <span>{selected?.[1] || "—"}</span><span className="ml-3 text-cyan-200">⌄</span>
      </button>
      {open && <div role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-cyan-300/30 bg-slate-950 p-1 shadow-xl shadow-cyan-950/30">
        {items.map(([itemValue, label]) => <button type="button" role="option" aria-selected={itemValue === value} key={itemValue} onClick={() => { onChange(itemValue); setOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-slate-100 hover:bg-sky-400 hover:text-slate-950 ${itemValue === value ? "bg-cyan-400/20 text-cyan-100" : ""}`}>{label || "—"}</button>)}
      </div>}
    </div>
  );
}
