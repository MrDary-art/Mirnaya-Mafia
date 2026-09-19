import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import SessionPreparation from "../components/SessionPreparation.jsx";

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
  return <SetupForm key={`${params.get("mode") === "online" ? "online" : "scenario"}:${params.get("preset") || ""}`} />;
}

function SetupForm() {
  const [params] = useSearchParams();
  const preset = params.get("preset") || "hr_firing_01";
  const online = params.get("mode") === "online";
  const nav = useNavigate();
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("arena_presets") || "[]");
    } catch {
      return [];
    }
  });
  const base = PRESET_MAP[preset] || PRESET_MAP.hr_firing_01;
  const [form, setForm] = useState({
    mode: online ? "online" : "scenario",
    practice_kind: null,
    target_company: "",
    target_position: "",
    job_context: "",
    job_focus: "",
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
  const [fieldErrors, setFieldErrors] = useState({});

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((current) => current[k] ? { ...current, [k]: "" } : current);
  }

  async function start() {
    if (starting) return;
    setError("");
    const selectedMode = online ? "online" : "scenario";
    const job = selectedMode === "online" && form.practice_kind === "job_interview";
    const company = (form.target_company || "").trim();
    const position = (form.target_position || "").trim();
    const problem = job ? `Собеседование на позицию «${position}» в компании «${company}»${form.job_context.trim() ? `. Контекст: ${form.job_context.trim()}` : ""}` : form.problem.trim();
    const goal = job ? `Показать, что я подхожу на позицию «${position}» в компании «${company}»${form.job_focus.trim() ? `. Дополнительно хочу отработать: ${form.job_focus.trim()}` : ""}` : form.goal.trim();
    const errors = {};
    if (selectedMode === "online") {
      if (!form.display_name.trim()) errors.display_name = "Укажите, как к вам обращаться.";
      if (job) {
        if (!company) errors.target_company = "Укажите компанию.";
        if (!position) errors.target_position = "Укажите вакансию.";
      } else {
        if (!problem) errors.problem = "Опишите ситуацию для разговора.";
        if (!goal) errors.goal = "Укажите желаемый результат.";
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      return;
    }
    setStarting(true);
    try {
      const { job_context, job_focus, ...settings } = form;
      const session = await api("/api/sessions", { method: "POST", body: { ...settings, mode: selectedMode, problem, goal, role: job ? "Кандидат" : form.role, opponent_role: job ? "Интервьюер" : form.opponent_role, practice_kind: job ? "job_interview" : null, timer: form.timer ? Number(form.timer) : null } });
      nav(selectedMode === "online" ? `/practice?session=${session.id}` : `/play/${session.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  function savePreset() {
    const name = online && form.practice_kind === "job_interview" ? `Собеседование: ${form.target_position || "вакансия"} · ${form.target_company || "компания"}` : `${form.role} vs ${form.opponent_role}`;
    const next = [{ name, form: { ...form, mode: online ? "online" : "scenario" } }, ...saved].slice(0, 8);
    localStorage.setItem("arena_presets", JSON.stringify(next));
    setSaved(next);
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]" aria-busy={starting} inert={online && starting ? true : undefined}>
      <div className="glass min-w-0 rounded-3xl p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Настройка сессии</h1>
        <p className="mt-1 text-sm text-slate-400">{online ? "Выберите формат, опишите ситуацию и желаемый результат. ИИ подготовит собеседника под вашу задачу." : "Выберите роли и условия переговоров."}</p>
        {online && <div className="mt-6">
          <div className="mb-3 text-sm font-semibold text-slate-200">Формат практики</div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {[["custom", "Своя ситуация", "Вы задаёте роли, тему и желаемый результат"], ["job_interview", "Собеседование", "ИИ выступит интервьюером по вашей вакансии"]].map(([value, title, description]) => <button type="button" key={value} aria-pressed={(form.practice_kind || "custom") === value} onClick={() => { setForm((current) => ({ ...current, practice_kind: value === "job_interview" ? value : null })); setFieldErrors({}); }} className={`min-w-0 rounded-2xl border p-4 text-left transition-colors ${(form.practice_kind || "custom") === value ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><span className="block font-semibold text-white">{title}</span><span className="mt-1 block text-sm leading-snug text-slate-400">{description}</span></button>)}
          </div>
        </div>}
        <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
          {online && <Field label="Как к вам обращаться" error={fieldErrors.display_name}>
            <input className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} />
          </Field>}
          {online && form.practice_kind === "job_interview" && <>
            <Field label="Компания" error={fieldErrors.target_company}><input className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" maxLength={120} value={form.target_company || ""} onChange={(e) => set("target_company", e.target.value)} placeholder="Например, GitHub" /></Field>
            <Field label="Вакансия" error={fieldErrors.target_position}><input className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" maxLength={120} value={form.target_position || ""} onChange={(e) => set("target_position", e.target.value)} placeholder="Например, разработчик" /></Field>
            <Field label="Что важно учесть? (необязательно)" wide><textarea rows={2} className="w-full min-w-0 resize-y rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.job_context} onChange={(e) => set("job_context", e.target.value)} placeholder="Ваш опыт, требования вакансии или сложные вопросы" /></Field>
            <Field label="Что хотите отработать? (необязательно)" wide><textarea rows={2} className="w-full min-w-0 resize-y rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.job_focus} onChange={(e) => set("job_focus", e.target.value)} placeholder="Например, рассказ о проектах или вопросы о зарплате" /></Field>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] p-4 text-sm leading-relaxed text-slate-300 sm:col-span-2"><div className="font-semibold text-cyan-200">Цель этой практики</div><p className="mt-1">Показать, что вы подходите на выбранную вакансию. ИИ оценит ответы и в конце объяснит результат.</p></div>
          </>}
          {(!online || form.practice_kind !== "job_interview") && <Field label="Своя роль">
            <Select value={form.role} onChange={(v) => set("role", v)} options={ROLES} />
          </Field>}
          {(!online || form.practice_kind !== "job_interview") && <Field label="Роль оппонента">
            <Select value={form.opponent_role} onChange={(v) => set("opponent_role", v)} options={OPPONENTS} />
          </Field>}
          {(!online || form.practice_kind !== "job_interview") && <Field label={online ? "Ситуация" : "Проблематика"} wide={online} error={fieldErrors.problem}>
            {online ? <textarea rows={2} className="w-full min-w-0 resize-y rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.problem} onChange={(e) => set("problem", e.target.value)} placeholder="Опишите конкретную ситуацию" /> : <Select value={form.problem} onChange={(v) => set("problem", v)} options={PROBLEMS} />}
          </Field>}
          {(!online || form.practice_kind !== "job_interview") && <Field label="Желаемый результат" wide={online} error={fieldErrors.goal}>
            <textarea rows={2} className="w-full min-w-0 resize-y rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Какой итог хотите получить" />
          </Field>}
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
        </div>
        {!online && <p className="mt-4 text-sm text-slate-400">Это сценарная игра с готовыми вариантами ответа. Для свободного разговора <button type="button" className="font-medium text-cyan-200 underline underline-offset-2" onClick={() => nav("/setup?mode=online")}>откройте настройку беседы с ИИ</button>.</p>}
        <button type="button" aria-expanded={advanced} className="mt-4 text-sm text-cyan-300" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? "Скрыть расширенные настройки" : "Расширенные настройки"}
        </button>
        {advanced && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Отрасль">
              <Select value={form.industry} onChange={(v) => set("industry", v)} options={["", "IT", "ритейл", "финансы", "производство"]} />
            </Field>
            <Field label="Размер компании">
              <input className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.company_size} onChange={(e) => set("company_size", e.target.value)} />
            </Field>
            <Field label="Культурный контекст">
              <input className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={form.culture} onChange={(e) => set("culture", e.target.value)} />
            </Field>
          </div>
        )}
        <section className="mt-8 border-t border-white/10 pt-6" aria-labelledby="extra-modes-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="extra-modes-title" className="text-lg font-bold">Дополнительные режимы</h2><p className="mt-1 text-sm text-slate-400">Каждый меняет ход сценарной игры по-своему.</p></div>
            {online && <button type="button" className="rounded-xl border border-cyan-300/30 px-3 py-2 text-sm text-cyan-200 hover:border-cyan-300/70" onClick={() => nav("/setup")}>Открыть сценарный режим →</button>}
          </div>
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            {[
              { key: "ghost", icon: "🎭", title: "Тренер-призрак", description: "Даёт подсказку до выбора ответа и разбор после реплики. Подойдёт для обучения." },
              { key: "hidden_goal", icon: "🎯", title: "Скрытая цель", description: "У собеседника есть неочевидный интерес. Попробуйте раскрыть его вопросами до финала." },
              { key: "chaos", icon: "⚡", title: "Режим хаоса", description: "Во время переговоров возникают неожиданные события, на которые нужно реагировать." },
            ].map(({ key, icon, title, description }) => <label key={key} className={`block min-w-0 rounded-2xl border p-4 ${online ? "cursor-not-allowed border-white/10 bg-black/10 opacity-65" : form[key] ? "cursor-pointer border-cyan-300/60 bg-cyan-300/10" : "cursor-pointer border-white/10 bg-black/20 hover:border-white/30"}`}>
              <span className="flex items-center justify-between gap-3"><span className="font-semibold text-white">{icon} {title}</span><input type="checkbox" className="h-5 w-5 shrink-0 accent-cyan-300" checked={!online && form[key]} disabled={online} onChange={(event) => set(key, event.target.checked)} /></span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-300">{description}</span>
              {online && <span className="mt-2 block text-xs text-cyan-200">Доступно в сценарном режиме</span>}
            </label>)}
            <div className={`min-w-0 rounded-2xl border p-4 ${online ? "border-white/10 bg-black/10 opacity-65" : form.timer ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20"}`}>
              <div className="font-semibold text-white">⏱️ Таймер давления</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">Ограничивает время на ответ. Если не успеть, игра выберет вариант и снизит контроль.</p>
              {online ? <p className="mt-3 text-xs text-cyan-200">Доступно в сценарном режиме</p> : <select aria-label="Время на ответ" className="mt-3 w-full min-w-0 rounded-xl border border-white/10 bg-slate-900 p-2 text-sm" value={form.timer ?? ""} onChange={(e) => set("timer", e.target.value || null)}><option value="">Без таймера</option><option value="60">60 секунд</option><option value="30">30 секунд</option></select>}
            </div>
          </div>
        </section>
        {error && <div className="mt-4 text-rose-300">{error}</div>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={start} disabled={starting} className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 disabled:opacity-60">
            {starting ? online ? "ИИ анализирует цель…" : "Создаём сессию…" : online ? "Начать разговор с ИИ" : "Начать переговоры"}
          </button>
          <button onClick={savePreset} className="rounded-2xl border border-white/15 px-6 py-3">
            Сохранить пресет
          </button>
        </div>
      </div>
      <aside className="min-w-0 space-y-4">
        <div className="glass rounded-3xl p-5 text-sm text-slate-300">
          <div className="font-semibold text-white">Как это считается</div>
          <p className="mt-2">{online ? "ИИ сформулирует критерии успеха и провала по вашей цели до начала беседы. После каждой реплики сервер обновит доверие, цель, контроль и EQ. Итог учитывает весь разговор и эти критерии." : "В сценарном режиме LLM не вызывается. Каждая реплика предразмечена: TKI, техники, ΔTrust/Goal/Control/EQ. Confidence = 0.5·Goal + 0.3·Trust + 0.2·Control."}</p>
        </div>
        {saved.some((p) => p.form?.mode === (online ? "online" : "scenario")) && (
          <div className="glass rounded-3xl p-5">
            <div className="font-semibold">Мои пресеты</div>
            {saved.filter((p) => p.form?.mode === (online ? "online" : "scenario")).map((p, i) => (
              <button key={i} className="mt-2 block text-left text-sm text-cyan-300" onClick={() => { setForm((f) => ({ ...f, ...p.form, mode: online ? "online" : "scenario" })); setFieldErrors({}); }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </aside>
      {online && starting && <SessionPreparation job={form.practice_kind === "job_interview"} topic={form.practice_kind === "job_interview" ? `Собеседование: ${form.target_position.trim()} · ${form.target_company.trim()}` : form.problem.trim()} />}
    </div>
  );
}

function Field({ label, children, wide = false, error }) {
  return (
    <label className={`block min-w-0 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

function Select({ value, onChange, options }) {
  const items = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  return (
    <select className="w-full min-w-0 rounded-xl bg-black/30 p-3 ring-1 ring-white/10" value={value} onChange={(e) => onChange(e.target.value)}>
      {items.map(([v, l]) => (
        <option key={v} value={v}>
          {l || "—"}
        </option>
      ))}
    </select>
  );
}
