import PageHeader from "../design/PageHeader.jsx";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import AdminMonthlyOverview from "../components/AdminMonthlyOverview.jsx";

export default function Admin({ settingsOnly = false }) {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [settings, recent] = await Promise.all([api("/api/admin/settings"), api("/api/admin/sessions")]);
      setCfg(settings);
      setSessions(recent);
    } catch (failure) { setError(failure.message); }
  }, []);
  useEffect(() => { if (user?.is_admin) load(); }, [user?.is_admin, load]);

  if (!user?.is_admin) return <section className="admin-denied"><div className="eyebrow">СИСТЕМА / ДОСТУП</div><h1>Раздел администратора</h1><p>Этот раздел доступен только администраторам. Ваши переговоры и результаты находятся в личном профиле.</p><Link className="primary-button" to="/profile">Перейти в профиль →</Link></section>;
  if (!cfg) return <section className="admin-denied"><div className="eyebrow">СИСТЕМА / УПРАВЛЕНИЕ</div><h1>Настройки Арены</h1>{error ? <div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={load}>Повторить загрузку</button></div> : <p className="product-loading" role="status">Загружаем настройки…</p>}</section>;

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { scenarios, ...rest } = cfg;
      await api("/api/admin/settings", { method: "PUT", body: rest });
      setMessage("Контекст сохранён. Новые сессии получат обновлённые настройки.");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function setOverride(id, text) {
    setCfg((current) => ({ ...current, context_overrides: { ...current.context_overrides, [id]: text } }));
  }

  return <section className="admin-page">
    {!settingsOnly && <AdminMonthlyOverview />}
    <PageHeader eyebrow="Управление" title="Контекст Арены" description="Настройки демонстрационного окружения и сценариев. Изменения повлияют только на новые сессии." />
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    {message && <p className="admin-success" role="status">{message}</p>}
    <div className="admin-grid"><form className="admin-settings" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="eyebrow">ОСНОВНОЕ</div><h2>Параметры контекста</h2>
      <label>Название компании<input value={cfg.company_name || ""} onChange={(event) => setCfg({ ...cfg, company_name: event.target.value })} /></label>
      <label>Брифинг для жюри<textarea rows={4} value={cfg.briefing || ""} onChange={(event) => setCfg({ ...cfg, briefing: event.target.value })} /></label>
      <label>Сложность по умолчанию<input value={cfg.default_difficulty || ""} onChange={(event) => setCfg({ ...cfg, default_difficulty: event.target.value })} /></label>
      <div className="admin-scenarios"><div className="eyebrow">СЦЕНАРИИ</div><h2>Контекст кейсов</h2>{(cfg.scenarios || []).map((scenario) => <label key={scenario.id}><span>{scenario.title} <small>{scenario.id} · {scenario.steps} шагов</small></span><textarea rows={4} value={cfg.context_overrides?.[scenario.id] ?? scenario.context} onChange={(event) => setOverride(scenario.id, event.target.value)} /></label>)}</div>
      <button type="submit" className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить настройки"}</button>
    </form>
    <aside className="admin-sessions"><div className="eyebrow">МОНИТОРИНГ</div><h2>Последние сессии</h2>{sessions.length ? <ol>{sessions.map((session) => <li key={session.id}><span>#{session.id} · {session.status}</span><b>{session.title}</b><small>{session.verdict || "Вердикт ещё не готов"}</small></li>)}</ol> : <p className="product-empty">Сессий пока нет.</p>}</aside></div>
  </section>;
}
