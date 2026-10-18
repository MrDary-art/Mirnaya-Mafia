import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { Loader, Notice, roleLabels } from "./shared.jsx";

export function ProfileIdentity({ data }) {
  const { user } = useAuth();
  return <section className="profile-identity"><h2 className="text-2xl font-bold">{user?.display_name || user?.username}</h2><p>Личные сведения и ваше место в компании. Задания находятся в обучении, встречи — в календаре.</p><dl>{[["Компания", data.company.name], ["Должность", data.membership.job_title || "Не назначена"], ["Роль", data.membership.role_label || roleLabels[data.membership.role]], ["Подразделение", data.membership.department || "Не назначено"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="profile-results-actions mt-6"><Link className="subtle-button" to="/profile">Изменить личные данные</Link><Link className="subtle-button" to={`/business/${data.company.id}/profile?view=path`}>Профессия и развитие</Link></div></section>;
}

export function ConsentCenter({ data }) {
  const base = `/api/company/${data.company.id}`;
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function load() {
    try { const [twin, recommendations, profession] = await Promise.all([api(`${base}/twin/me`), api(`${base}/personalization/insights`), api(`${base}/me/professional-profile`)]); setState({ twin, recommendations, profession }); }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setState(null); load(); }, [base]);
  async function toggle(kind) {
    setBusy(true); setError(""); setMessage("");
    try {
      if (kind === "behavior") await api(`${base}/twin/me`, { method: "PUT", body: { opt_in: !state.twin.opt_in, source_types: !state.twin.opt_in ? ["TRAINING_RESULTS"] : [] } });
      if (kind === "recommendations") await api(`${base}/personalization`, { method: "PUT", body: { enabled: !state.recommendations.enabled } });
      if (kind === "profession") await api(`${base}/me/professional-profile`, { method: "PUT", body: { profession_id: state.profession.profession?.id || null, specialty_id: state.profession.specialty?.id || null, professional_level: state.profession.professional_level || 1, share_results: !state.profession.share_results } });
      await load(); setMessage("Согласие обновлено. Остальные разрешения не изменились.");
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <section className="profile-results"><header><h2 className="text-2xl font-bold">Согласия и доступ к данным</h2><p>Разрешения независимы. Их можно включать и отзывать отдельно. Личная практика за пределами компании не используется.</p></header>{error && <Notice tone="red">{error}<button onClick={load} className="subtle-button">Повторить</button></Notice>}{message && <Notice>{message}</Notice>}{!state ? !error && <Loader/> : <>{[
    ["behavior", "Профиль поведения", state.twin.opt_in, "Расчёт личной сводки по показателям корпоративной практики. После включения пересчитайте профиль в разделе результатов."],
    ["recommendations", "Персональные рекомендации по практике", state.recommendations.enabled, "Подбор следующих действий по вашим завершённым корпоративным заданиям."],
    ["profession", "Рекомендации профессионального развития", state.profession.share_results, "Использование корпоративных результатов для рекомендаций по выбранной профессии."],
  ].map(([kind, title, enabled, description]) => <article className="consent-card" key={kind}><header><h3 className="font-bold">{title}</h3><button className="subtle-button" disabled={busy} onClick={() => toggle(kind)}>{enabled ? "Отозвать согласие" : "Дать согласие"}</button></header><p>{description}</p><b>{enabled ? "Разрешено" : "Выключено"}</b></article>)}<article className="consent-card"><h3 className="font-bold">Передача отдельных записей коллегам</h3><p>Согласия выше не открывают ваш архив. Получатель, состав данных и срок настраиваются для каждой записи отдельно.</p><Link className="subtle-button" to={`/business/${data.company.id}/profile?view=tools`}>Управлять доступом в архиве</Link></article></>}</section>;
}

export function ProfessionEmptyHelp({ data }) {
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  return <div className="workspace-navigation-note"><p>Профессию, специальности и целевые компетенции настраивает компания. Если списка ещё нет, обратитесь к руководителю.</p>{data.permissions.manage_company ? <Link className="subtle-button" to={`/business/${data.company.id}/settings?setting=catalog`}>Настроить каталог профессий</Link> : <button className="subtle-button" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/company/${data.company.id}/me/profession-request`, { method: "POST" }); setMessage("Запрос отправлен руководителям компании."); } catch (cause) { setMessage(cause.message); } finally { setBusy(false); } }}>Запросить настройку профессии</button>}{message && <p role="status">{message}</p>}</div>;
}
