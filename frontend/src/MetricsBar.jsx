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

export default function MetricsBar({ metrics = {} }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {META.map((m) => {
        const v = metrics[m.key] ?? 50;
        return (
          <div key={m.key} className="glass rounded-2xl p-3">
            <div className="mb-1 flex justify-between text-sm">
              <span>
                <span className="ui-icon-label"><Icon name={m.icon} size={17} /> {m.label}</span>
              </span>
              <span className="text-cyan-300">{v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                style={{ width: `${v}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-400">{band(m.key, v)}</div>
          </div>
        );
      })}
    </div>
  );
}
import Icon from "./components/Icon.jsx";
