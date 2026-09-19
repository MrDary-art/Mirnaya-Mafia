import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import MetricsBar from "../MetricsBar.jsx";

const TKI_LABELS = {
  конкуренция: "Конкуренция",
  сотрудничество: "Сотрудничество",
  компромисс: "Компромисс",
  избегание: "Избегание",
  приспособление: "Приспособление",
};

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    Promise.all([api(`/api/sessions/${id}/report`), api(`/api/sessions/${id}`)])
      .then(([r, s]) => {
        setReport(r);
        setSession(s);
        refresh();
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function retry() {
    if (!session?.settings || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await api("/api/sessions", { method: "POST", body: { ...session.settings, mode: session.mode } });
      nav(session.mode === "online" ? `/practice?session=${created.id}` : `/play/${created.id}`, { state: { returnTo: location.state?.returnTo } });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (error && !report) return <div role="alert" className="text-rose-300">Не удалось открыть отчёт: {error}</div>;
  if (!report) return <div className="text-slate-400">Собираем отчёт по формулам…</div>;
  const values = report.metrics?.values || {};
  const interview = session?.settings?.practice_kind === "job_interview";
  const playerMessages = session?.messages?.filter((message) => message.sender === "player") || [];
  const turnSummary = report.turn_summary || {
    progress: playerMessages.filter((message) => message.analysis?.goal_signal === "progress").length,
    setback: playerMessages.filter((message) => message.analysis?.goal_signal === "setback").length,
    neutral: playerMessages.filter((message) => message.analysis?.goal_signal === "none").length,
  };
  const hasHarvardTags = Object.values(report.harvard || {}).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6">
        <div className="text-xs uppercase tracking-widest text-cyan-300">{report.scenario_title}</div>
        <h1 className={`mt-1 text-3xl font-extrabold ${report.ending_id === "online_failed" ? "text-rose-300" : ""}`}>{report.verdict}</h1>
        {report.summary && <p className="mt-3 text-slate-200">{report.summary}</p>}
        {report.goal_evidence && <p className="mt-2 text-sm text-cyan-200">Решающий момент: «{report.goal_evidence}»</p>}
        <p className="mt-2 text-slate-400">{report.ending_id?.startsWith("online_") ? "Метрики рассчитаны сервером по репликам и проверенным поведенческим признакам." : "Дельты предразмечены в сценарии."} Confidence = 0.5·цель + 0.3·доверие + 0.2·контроль → {report.metrics?.confidence}</p>
        {report.goal_assessment_delta != null && <p className="mt-2 text-sm text-cyan-200">Итоговая оценка цели скорректирована по подтверждённому результату беседы: {report.goal_assessment_delta > 0 ? "+" : ""}{report.goal_assessment_delta}.</p>}
        {report.stars_earned != null && <div className="mt-3 text-cyan-200">★ +{report.stars_earned}</div>}
      </div>
      <MetricsBar metrics={values} />
      {report.goal_criteria && <div className="glass grid gap-4 rounded-3xl p-5 md:grid-cols-2"><div><h2 className="font-semibold text-emerald-200">Что считалось успехом</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{report.goal_criteria.success?.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h2 className="font-semibold text-rose-200">Что считалось провалом</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{report.goal_criteria.failure?.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>}
      <div className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-semibold">График метрик</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.metrics_chart}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="turn" stroke="#94a3b8" />
              <YAxis domain={[0, 100]} stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Legend />
              <Line type="monotone" dataKey="trust" name="Доверие" stroke="#22d3ee" dot={false} />
              <Line type="monotone" dataKey="goal" name="Цель" stroke="#a78bfa" dot={false} />
              <Line type="monotone" dataKey="control" name="Контроль" stroke="#34d399" dot={false} />
              <Line type="monotone" dataKey="eq" name="EQ" stroke="#fbbf24" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-5">
          <h2 className="font-semibold">3 ошибки с альтернативами</h2>
          {(report.mistakes || []).length === 0 && <p className="mt-2 text-sm text-slate-400">Критических просадок нет — сильный проход.</p>}
          {(report.mistakes || []).map((m, i) => (
            <div key={i} className="mt-3 border-t border-white/10 pt-3 text-sm">
              <div className="text-rose-200">{m.what}</div>
              <div className="text-slate-500">Вы: {m.chosen}</div>
              <div className="text-emerald-200">Иначе: {m.alternative}</div>
            </div>
          ))}
        </div>
        <div className="glass rounded-3xl p-5">
          <h2 className="font-semibold">2 рекомендации</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
            {(report.recommendations || []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
      <button className="text-cyan-300" onClick={() => setMore((v) => !v)}>
        {more ? "Скрыть детали" : "Как рассчитан результат и какие материалы использованы"}
      </button>
      {more && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass rounded-3xl p-5 text-sm text-slate-300">
            <h3 className="font-semibold text-white">Что изменилось в беседе</h3>
            <p className="mt-2">Ответов, которые продвинули к цели: <b className="text-emerald-200">{turnSummary.progress}</b></p>
            <p className="mt-1">Нейтральных: <b className="text-slate-100">{turnSummary.neutral}</b> · Снизили прогресс: <b className="text-rose-200">{turnSummary.setback}</b></p>
            <p className="mt-3 text-slate-400">Эти метки определяют направление изменений; числовые метрики рассчитывает сервер.</p>
            {interview && <p className="mt-3 text-slate-400">Карта стилей переговоров и BATNA здесь скрыты: они не помогают разбирать профессиональные ответы на собеседовании.</p>}
          </div>
          {report.ending_id?.startsWith("online_") && <div className="glass rounded-3xl p-5 text-sm text-slate-300">
            <h3 className="font-semibold text-white">Материалы подготовки</h3>
            {report.knowledge_sources?.length ? <ul className="mt-3 space-y-2">{report.knowledge_sources.map((source) => <li key={source.path}><span className="text-cyan-100">{source.title}</span><span className="block break-all text-xs text-slate-500">{source.path}</span></li>)}</ul> : <p className="mt-3 text-slate-400">В этой попытке локальная база материалов ещё не использовалась.</p>}
          </div>}
          {!interview && Object.keys(report.tki_map || {}).length > 0 && <div className="glass rounded-3xl p-5">
            <h3 className="font-semibold">Стили переговоров в этой сессии</h3>
            {Object.entries(report.tki_map || {}).map(([key, value]) => <div key={key} className="mt-3"><div className="flex justify-between text-sm"><span>{TKI_LABELS[key] || key}</span><span>{value}%</span></div><div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400" style={{ width: `${value}%` }} /></div></div>)}
            <p className="mt-3 text-sm text-slate-400">Это описание поведения в конкретной беседе, а не характеристика личности.</p>
          </div>}
          {!interview && <div className="glass rounded-3xl p-5 text-sm text-slate-300">
            <h3 className="font-semibold text-white">Приёмы переговоров</h3>
            {hasHarvardTags ? <ul className="mt-3 list-disc space-y-1 pl-5">{report.harvard?.batna && <li>Обозначен запасной вариант (BATNA)</li>}{report.harvard?.objective_criteria && <li>Использованы объективные критерии</li>}{report.harvard?.interests && <li>Исследованы интересы сторон</li>}</ul> : <p className="mt-2">Эти приёмы в репликах не отмечены. Они не обязательны для каждой темы.</p>}
            {report.hidden_goal && <p className="mt-3">Скрытая цель: {report.hidden_goal.ok ? "угадана" : "не угадана"}. Верно: {report.hidden_goal.correct_text}</p>}
          </div>}
        </div>
      )}
      <div className="flex gap-3">
        <button className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={busy || !session} onClick={retry}>
          {busy ? "Создаём новую попытку…" : "Попробовать ещё раз"}
        </button>
        <button className="rounded-2xl border border-white/15 px-5 py-3" onClick={() => nav(location.state?.returnTo || "/")}>
          {location.state?.returnTo ? "Вернуться к карте" : "На главную"}
        </button>
      </div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>
  );
}
