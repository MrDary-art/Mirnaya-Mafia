import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PracticeSetup from "./PracticeSetup.jsx";

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
  return params.get("mode") === "online" ? <PracticeSetup /> : <ScenarioSetup />;
}

function ScenarioSetup() {
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
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [step, setStep] = useState(0);
  const [highestStep, setHighestStep] = useState(0);
  const steps = online
    ? ["Формат", "Роли", "Ситуация", "Дополнительно", "Проверка"]
    : ["Роли", "Ситуация", "Дополнительно", "Проверка"];
  const activeStep = online ? step : step + 1;
  const isLastStep = step === steps.length - 1;

  useEffect(() => {
    if (online) return;
    api("/api/scenarios").then((items) => {
      const scenario = items.find((item) => item.id === preset);
      if (!scenario) return;
      setSelectedScenario(scenario);
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
    if (busy) return;
    setError("");
    const selectedMode = online ? "online" : "scenario";
    if (selectedMode === "online" && (!form.display_name.trim() || !form.problem.trim() || !form.goal.trim())) {
      setError("Укажите имя, ситуацию и желаемый результат до начала беседы.");
      return;
    }
    setBusy(true);
    try {
      const session = await api("/api/sessions", { method: "POST", body: { ...form, mode: selectedMode, timer: form.timer ? Number(form.timer) : null } });
      nav(selectedMode === "online" ? `/practice?session=${session.id}` : `/play/${session.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function savePreset() {
    const next = [{ name: `${form.role} vs ${form.opponent_role}`, form }, ...saved].slice(0, 8);
    localStorage.setItem("arena_presets", JSON.stringify(next));
    setSaved(next);
    setNotice("Пресет сохранён в этом браузере.");
  }

  function nextStep() {
    setError("");
    if (step === 0 && form.mode === "online" && !form.display_name.trim()) { setError("Укажите имя, чтобы продолжить."); return; }
    if (step === 2 && form.mode === "online" && (!form.problem.trim() || !form.goal.trim())) { setError("Укажите ситуацию и желаемый результат."); return; }
    const next = Math.min(steps.length - 1, step + 1);
    setStep(next);
    setHighestStep((current) => Math.max(current, next));
  }

  if (!online) {
    return <ScenarioSessionSetup scenario={selectedScenario} error={error} busy={busy} onBack={() => nav("/scenarios")} onStart={start} />;
  }

  return (
    <div className="setup-layout">
      <div className="glass setup-panel">
        <div className="eyebrow">ПОДГОТОВКА · {online ? "ИИ-ДИАЛОГ" : "СЦЕНАРИЙ"}</div>
        <h1>Настройка сессии</h1>
        <p>Соберите контекст разговора по шагам. Все значения можно изменить перед началом.</p>
        <nav className="setup-steps" aria-label="Шаги настройки">{steps.map((label, index) => <button key={label} type="button" aria-label={`${index + 1}. ${label}`} aria-current={step === index ? "step" : undefined} disabled={index > highestStep} onClick={() => { setStep(index); setError(""); }}><span>{String(index + 1).padStart(2, "0")}</span><span className="setup-step-label">{label}</span></button>)}</nav>
        <p className="setup-mobile-step-name">Шаг {step + 1} из {steps.length} · {steps[step]}</p>
        <div className="setup-step-body" key={step}>
          {activeStep === 0 && <div className="setup-fields"><Field label="Режим">{online ? <div className="setup-fixed-value">Диалог с ИИ</div> : <Select value={form.mode} onChange={(v) => v === "online" ? nav("/ai/prepare") : set("mode", v)} options={[["scenario", "Сценарный · офлайн"], ["online", "Диалог с ИИ"]]} />}</Field>{form.mode === "online" && <Field label="Как к вам обращаться"><input value={form.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} /></Field>}</div>}
          {activeStep === 1 && <div className="setup-fields"><Field label="Своя роль"><Select value={form.role} onChange={(v) => set("role", v)} options={ROLES} /></Field><Field label="Роль оппонента"><Select value={form.opponent_role} onChange={(v) => set("opponent_role", v)} options={OPPONENTS} /></Field><Field label="Сложность оппонента"><Select value={form.difficulty} onChange={(v) => set("difficulty", v)} options={[["easy", "Лёгкий"], ["medium", "Средний"], ["hard", "Сложный"], ["expert", "Эксперт"], ["brutal", "Жёсткий"]]} /></Field><Field label="Ваш уровень"><Select value={form.skill} onChange={(v) => set("skill", v)} options={["новичок", "практик", "опытный"]} /></Field><Field label="Тон оппонента"><Select value={form.tone} onChange={(v) => set("tone", v)} options={["дружелюбный", "нейтральный", "агрессивный", "манипулятивный"]} /></Field></div>}
          {activeStep === 2 && <div className="setup-fields"><Field label="Проблематика">{online ? <input value={form.problem} onChange={(e) => set("problem", e.target.value)} placeholder="Опишите конкретную ситуацию" /> : <Select value={form.problem} onChange={(v) => set("problem", v)} options={PROBLEMS} />}</Field><Field label="Цель"><input value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Какой результат хотите получить?" /></Field></div>}
          {activeStep === 3 && <><div className="setup-options"><label><input type="checkbox" checked={form.ghost} onChange={(e) => set("ghost", e.target.checked)} /> Тренер-призрак</label><label><input type="checkbox" checked={form.hidden_goal} onChange={(e) => set("hidden_goal", e.target.checked)} /> Скрытая цель</label><label><input type="checkbox" checked={form.chaos} onChange={(e) => set("chaos", e.target.checked)} /> Режим хаоса</label></div><button className="setup-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)}>{advanced ? "Скрыть расширенные настройки" : "Расширенные настройки"}</button>{advanced && <div className="setup-fields"><Field label="Отрасль"><Select value={form.industry} onChange={(v) => set("industry", v)} options={["", "IT", "ритейл", "финансы", "производство"]} /></Field><Field label="Размер компании"><input value={form.company_size} onChange={(e) => set("company_size", e.target.value)} /></Field><Field label="Культурный контекст"><input value={form.culture} onChange={(e) => set("culture", e.target.value)} /></Field><Field label="Таймер давления"><Select value={form.timer ?? ""} onChange={(v) => set("timer", v === "" ? null : v)} options={[["", "Без таймера"], ["60", "60 сек"], ["30", "30 сек"]]} /></Field></div>}</>}
          {activeStep === 4 && <div className="setup-review"><h2>Проверьте контекст</h2><dl>{online && <div><dt>Формат</dt><dd>Диалог с ИИ</dd></div>}<div><dt>Стороны</dt><dd>{form.role} / {form.opponent_role}</dd></div><div><dt>Ситуация</dt><dd>{form.problem || "Не указана"}</dd></div><div><dt>Цель</dt><dd>{form.goal || "Не указана"}</dd></div><div><dt>Условия</dt><dd>{form.difficulty} · {form.tone}</dd></div></dl><button className="subtle-button" onClick={savePreset}>Сохранить пресет</button>{notice && <p role="status" className="setup-notice">{notice}</p>}</div>}
        </div>
        {error && <div role="alert" className="setup-error">{error}</div>}
        <div className="setup-actions"><button className="subtle-button" disabled={step === 0 || busy} onClick={() => { setStep((current) => current - 1); setError(""); }}>Назад</button>{!isLastStep ? <button className="primary-button" onClick={nextStep}>Далее →</button> : <button className="primary-button" disabled={busy} aria-busy={busy} onClick={start}>{busy ? "Создаём сессию…" : "Начать переговоры →"}</button>}</div>
      </div>
      <aside className="space-y-4">
        <div className="setup-visual" aria-hidden="true"><span>02 / ПРИЗМА КОНТЕКСТА</span></div>
        <div className="glass rounded-3xl p-5 text-sm text-slate-300">
          <div className="font-semibold text-white">Контекст сессии</div>
          <p className="mt-2">{form.role} · {form.opponent_role}</p><p className="mt-2">{form.problem || "Ситуацию добавите на третьем шаге."}</p>
          <p className="mt-2">{form.mode === "scenario" ? "Офлайн-сценарий работает без ИИ и внешнего ключа." : "Сессия с ИИ начнётся только после подтверждения настроек."}</p>
        </div>
        {saved.length > 0 && (
          <div className="glass rounded-3xl p-5">
            <div className="font-semibold">Мои пресеты</div>
            {saved.map((p, i) => (
              <button key={i} className="mt-2 block text-left text-sm text-cyan-300" onClick={() => { setForm((f) => ({ ...f, ...p.form, mode: online ? "online" : p.form.mode || f.mode })); setNotice(`Пресет «${p.name}» загружен.`); }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function ScenarioSessionSetup({ scenario, error, busy, onBack, onStart }) {
  if (!scenario) {
    return <div className="setup-layout"><div className="glass setup-panel scenario-session-panel"><div className="eyebrow">ПОДГОТОВКА · СЦЕНАРИЙ</div><h1>Настройка сессии</h1><p>Загружаем параметры сценария…</p></div></div>;
  }

  const difficulty = { easy: "Легко", medium: "Средне", hard: "Сложно", expert: "Эксперт", brutal: "Жёстко" }[scenario.difficulty] || scenario.difficulty;
  const info = [
    ["Ситуация", scenario.context],
    ["Ваша роль", scenario.roles?.player],
    ["Оппонент", scenario.opponent || scenario.roles?.opponent],
    ["Ваша цель", scenario.goal],
    ["Диалог", `${scenario.turns || 0} ходов · ${scenario.choice_count || 0} вариантов ответа`],
    ["Что тренируем", (scenario.skills || []).join(" · ")],
    ["Сложность и длительность", `${difficulty} · ${scenario.minutes ? `≈ ${scenario.minutes} минут` : "время не указано"}`],
    ["Особенности", (scenario.features || []).join(" · ")],
  ].filter(([, value]) => value);

  return <div className="setup-layout scenario-session-layout">
    <div className="glass setup-panel scenario-session-panel">
      <div className="eyebrow">ПОДГОТОВКА · СЦЕНАРИЙ</div>
      <h1>{scenario.title}</h1>
      <p>Все условия уже заданы сценарием. Выберите начало тренировки, когда будете готовы.</p>
      <div className="scenario-session-details">{info.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {error && <div role="alert" className="setup-error">{error}</div>}
      <div className="setup-actions scenario-session-actions"><button className="subtle-button" disabled={busy} onClick={onBack}>Назад к сценариям</button><button className="primary-button" disabled={busy} aria-busy={busy} onClick={onStart}>{busy ? "Создаём сессию…" : "Начать переговоры →"}</button></div>
    </div>
  </div>;
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
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{items.map(([itemValue, label]) => <option key={itemValue} value={itemValue}>{label || "Не выбрано"}</option>)}</select>;
}
