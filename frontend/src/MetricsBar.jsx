import "./MetricsBar.css";

const BAND = {
  trust: [
    [30, "Закрыт"],
    [60, "Насторожен"],
    [85, "Открыт"],
    [100, "Полное доверие"],
  ],
  goal: [
    [30, "Далеко"],
    [60, "На полпути"],
    [85, "Близко"],
    [100, "Достигнута"],
  ],
  control: [
    [30, "Ведёт оппонент"],
    [60, "Равный диалог"],
    [85, "Ведёте вы"],
    [100, "Полный контроль"],
  ],
  eq: [
    [30, "Эмоции управляют вами"],
    [60, "Замечаете"],
    [85, "Управляете"],
    [100, "Мастер эмоций"],
  ],
};

const META = [
  { key: "trust", label: "Доверие", icon: "handshake" },
  { key: "goal", label: "Цель", icon: "target" },
  { key: "control", label: "Контроль", icon: "shield" },
  { key: "eq", label: "EQ", icon: "brain" },
];

function band(key, v) {
  for (const [lim, name] of BAND[key]) if (v <= lim) return name;
  return BAND[key].at(-1)[1];
}

export default function MetricsBar({ metrics = {}, mode, scoring = [], coverage }) {
  const measured = coverage ? coverage.measured > 0 : Object.keys(metrics).length > 0;
  return (
    <><div className="session-metrics" role="group" aria-label="Показатели переговоров">
      {META.map((m) => {
        const v = measured && Number.isFinite(metrics[m.key]) ? metrics[m.key] : null;
        return (
          <div key={m.key} className="session-metric-card">
            <div className="mb-1 flex justify-between text-sm">
              <span>
                <span className="ui-icon-label"><Icon name={m.icon} size={17} /> {m.key === "goal" && mode === "online" ? "Продвижение" : m.label}</span>
              </span>
              <span className="text-lime-300">{v ?? "—"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-400 to-lime-400"
                style={{ width: `${v ?? 0}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-400">{v == null ? "Нет подтверждённой оценки" : mode === "online" ? "Учебный индекс действий" : band(m.key, v)}</div>
          </div>
        );
      })}
    </div>
    <details className="scoring-details"><summary>Как меняются показатели</summary>
      <p>{mode === "online" ? "Это индексы действий, а не проценты достижения цели. Правила применяются только к буквальным признакам в вашей реплике; вывод ИИ не может сам изменить результат. Соглашение проверяется отдельно по предложениям и подтверждениям обеих сторон. Ранние ходы после пяти следующих учитываются с весом 0,5." : "Изменения заданы автором сценария для выбранного решения. Техники не начисляются повторно."}</p>
      {scoring.length ? scoring.map((item, index) => <p key={index}><b>{item.label}: {item.actual_delta > 0 ? "+" : ""}{item.actual_delta}</b> · {item.reason}{item.evidence?.map((e, i) => <span key={i}> · {e.tag}: «{e.quote}»</span>)}</p>) : <p>Для последнего хода нет подтверждённых изменений.</p>}
    </details></>
  );
}
import Icon from "./components/Icon.jsx";
