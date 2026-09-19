import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const ROLES = ["Участник переговоров", "Кандидат", "HR-специалист", "Менеджер по продажам", "Закупщик", "PM", "Руководитель", "Финансист", "IT", "Маркетолог", "Юрист", "Предприниматель", "Студент"];
const OPPONENTS = ["Собеседник", "Интервьюер", "Клиент", "Кандидат", "Поставщик", "Подчинённый", "Партнёр", "Инвестор", "Коллега", "Руководитель"];
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
    practice_kind: null,
    target_company: "",
    target_position: "",
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
  const [starting, setStarting] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function start() {
    if (starting) return;
    setError("");
    const selectedMode = online ? "online" : form.mode;
    const job = selectedMode === "online" && form.practice_kind === "job_interview";
    const company = (form.target_company || "").trim();
    const position = (form.target_position || "").trim();
    const problem = job && !form.problem.trim() ? `Собеседование на позицию «${position}» в компании «${company}»` : form.problem.trim();
    const goal = job && !form.goal.trim() ? `Убедить интервьюера, что я подхожу на позицию «${position}»` : form.goal.trim();
    if (job && (!company || !position)) {
      setError("Укажите компанию и вакансию для практики трудоустройства.");
      return;
    }
    if (selectedMode === "online" && (!form.display_name.trim() || !problem || !goal)) {
      setError("Укажите имя, ситуацию и желаемый результат до начала беседы.");
      return;
    }
    setStarting(true);
    try {
      const session = await api("/api/sessions", { method: "POST", body: { ...form, mode: selectedMode, problem, goal, practice_kind: job ? "job_interview" : null, timer: form.timer ? Number(form.timer) : null } });
      nav(selectedMode === "online" ? `/practice?session=${session.id}` : `/play/${session.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
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
          {online && <Field label="Фильтр практики">
            <Select value={form.practice_kind || "custom"} onChange={(value) => setForm((current) => value === "job_interview" ? { ...current, practice_kind: value, role: "Кандидат", opponent_role: "Интервьюер" } : { ...current, practice_kind: null })} options={[["custom", "Пользовательский"], ["job_interview", "Трудоустройство"]]} />
          </Field>}
          {form.mode === "online" && <Field label="Как к вам обращаться">
            <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} />
          </Field>}
          {online && form.practice_kind === "job_interview" && <>
            <Field label="Компания"><input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" maxLength={120} value={form.target_company || ""} onChange={(e) => set("target_company", e.target.value)} placeholder="Например, GitHub" /></Field>
            <Field label="Вакансия"><input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" maxLength={120} value={form.target_position || ""} onChange={(e) => set("target_position", e.target.value)} placeholder="Например, разработчик" /></Field>
          </>}
          <Field label="Своя роль">
            <Select value={form.role} onChange={(v) => set("role", v)} options={ROLES} />
          </Field>
          <Field label="Роль оппонента">
            <Select value={form.opponent_role} onChange={(v) => set("opponent_role", v)} options={OPPONENTS} />
          </Field>
          <Field label="Проблематика">
            {form.mode === "online" ? <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.problem} onChange={(e) => set("problem", e.target.value)} placeholder={form.practice_kind === "job_interview" ? "Необязательно: особый контекст собеседования" : "Опишите конкретную ситуацию"} /> : <Select value={form.problem} onChange={(v) => set("problem", v)} options={PROBLEMS} />}
          </Field>
          <Field label="Цель">
            <input className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder={form.practice_kind === "job_interview" ? "Необязательно: что хотите отработать" : "Какой итог хотите получить"} />
          </Field>
          <Field label="Сложность оппонента">
            <Select
              value={form.difficulty}
              onChange={(v) => set("difficulty", v)}
              options={[
                ["easy", "Лёгкий"],
                ["medium", "Средний"],
                ["hard", "Сложный"],
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
          <button onClick={start} disabled={starting} className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 disabled:opacity-60">
            {starting ? online ? "ИИ анализирует цель…" : "Создаём сессию…" : online ? "Начать разговор с ИИ" : "Начать переговоры"}
          </button>
          <button onClick={savePreset} className="rounded-2xl border border-white/15 px-6 py-3">
            Сохранить пресет
          </button>
        </div>
      </div>
      <aside className="space-y-4">
        <div className="glass rounded-3xl p-5 text-sm text-slate-300">
          <div className="font-semibold text-white">Как это считается</div>
          <p className="mt-2">{online ? "ИИ сформулирует критерии успеха и провала по вашей цели до начала беседы. После каждой реплики сервер обновит доверие, цель, контроль и EQ. Итог учитывает весь разговор и эти критерии." : "В сценарном режиме LLM не вызывается. Каждая реплика предразмечена: TKI, техники, ΔTrust/Goal/Control/EQ. Confidence = 0.5·Goal + 0.3·Trust + 0.2·Control."}</p>
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
  return (
    <select className="w-full rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={value} onChange={(e) => onChange(e.target.value)}>
      {items.map(([v, l]) => (
        <option key={v} value={v}>
          {l || "—"}
        </option>
      ))}
    </select>
  );
}
