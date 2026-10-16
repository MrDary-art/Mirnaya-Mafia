import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./decision-council.css";
import CouncilTable from "../components/CouncilTable.jsx";

const roles = { client: "Представитель клиента", production: "Руководитель производства", finance: "Финансист" };
const fields = { first_batch_percent: "Первая партия, %", first_batch_days: "Первая поставка, дней", balance_days: "Остаток, дней", extra_cost: "Расходы, ₽", prepayment_percent: "Предоплата, %" };

function DemoRole({ roleKey }) {
  const [role, setRole] = useState(null), [error, setError] = useState("");
  useEffect(() => { api(`/api/council/demo/role/${roleKey}`, { auth: false }).then(setRole).catch(reason => setError(reason.message)); }, [roleKey]);
  if (!role) return <p role="status">{error || "Открываем вашу роль…"}</p>;
  return <section className="council-panel"><span className="council-kicker">ДЕМОНСТРАЦИЯ · ЛИЧНАЯ КАРТОЧКА</span><h1>{role.name}</h1><p>{role.goal}</p><h2>Ваша информация</h2><ul>{role.private_facts.map(fact => <li key={fact}>{fact}</li>)}</ul><h2>Ограничения</h2><ul>{role.limits.map(fact => <li key={fact}>{fact}</li>)}</ul><p><b>Можно предложить: </b>{role.can_offer}</p><p><b>Выясните: </b>{role.ask}</p><p>Обсудите условия с двумя другими участниками. Передавайте факты своими словами; общий документ заполняет ведущий демонстрации.</p></section>;
}

export default function CouncilDemo() {
  const [params] = useSearchParams();
  const selected = params.get("role");
  const { user } = useAuth();
  const [origin, setOrigin] = useState(window.location.origin);
  const [codes, setCodes] = useState({}), [error, setError] = useState("");
  const [roleKey, setRoleKey] = useState("client"), [message, setMessage] = useState("");
  const [replies, setReplies] = useState([]), [busy, setBusy] = useState(false);
  const [agreement, setAgreement] = useState({ first_batch_percent: 0, first_batch_days: 0, balance_days: 0, extra_cost: 0, prepayment_percent: 0, decision: "", owner: "", open_issues: "", version: 0 });
  const [report, setReport] = useState(null);
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all(Object.keys(roles).map(async key => [key, await api(`/api/council/demo/qr?role=${key}&origin=${encodeURIComponent(origin)}`, { auth: false })]))
        .then(items => { if (!cancelled) { setCodes(Object.fromEntries(items)); setError(""); } })
        .catch(reason => { if (!cancelled) setError(reason.message); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [origin, selected]);
  async function ask(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const answer = await api("/api/council/demo/reply", { method: "POST", body: { role: roleKey, message } });
      setReplies(value => [...value, { role: roles[roleKey], question: message, ...answer }]); setMessage("");
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function check(event) {
    event.preventDefault(); setError(""); setChecking(true);
    try { setReport(await api("/api/council/demo/check", { method: "POST", body: agreement, auth: false })); }
    catch (reason) { setError(reason.message); }
    finally { setChecking(false); }
  }
  return <div className="council-page council-public council-demo"><nav className="council-demo-nav"><Link to="/council">← Совет решений</Link><span>АРЕНА / ОТКРЫТЫЙ КЕЙС</span><span>5–10 минут</span></nav>
    {selected ? <DemoRole key={selected} roleKey={selected} /> : <>
      <header className="council-demo-hero"><div><span className="council-kicker">ДЕЛОВАЯ ИГРА В ТРЁХ ДЕЙСТВИЯХ</span><h1>Контракт на кону.<br /><em>Что решите вы?</em></h1><p>Сроки горят. Клиент ждёт. Бюджет ограничен. У каждой стороны есть факт, который меняет всё.</p><div className="council-tags"><span>3 роли</span><span>1 общий документ</span><span>Без записи на игру</span></div><a className="council-button" href="#demo-workbench">Сесть за стол ↘</a></div><CouncilTable compact /></header>
      <div className="council-demo-brief"><span>ДЕЛО № 01</span><p>Крупный заказ под угрозой. Вы — команда, которой предстоит сохранить контракт и договориться о выполнимых условиях.</p><details><summary>Полномочия ведущего</summary><p>Ведущий утверждает расходы до 25 000 ₽ и письменный график двух поставок. Он объединяет роль руководителя проекта и заполняет общий документ.</p></details></div>
      <nav id="demo-workbench" className="council-demo-steps" aria-label="Этапы демонстрации">{["Раздать роли", "Обсудить условия", "Собрать решение"].map((title, index) => <button key={title} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>0{index + 1}</span><b>{title}</b><small>{["Каждому — своя информация", "Найдите недостающие факты", "Проверьте общий план"][index]}</small></button>)}</nav>
      {error && <div className="council-note council-note--error" role="alert">{error}</div>}
      {step === 0 && <section className="council-panel council-demo-stage"><div className="council-panel-heading"><div><span className="council-kicker">01 / ВАШИ МЕСТА ЗА СТОЛОМ</span><h2>Кто вы в этой истории?</h2></div><span>Передайте каждому его карточку</span></div><p>Откройте роль или отсканируйте QR-код. Свою информацию передавайте команде словами — так начинается настоящий разговор.</p><div className="council-demo-codes">{Object.entries(roles).map(([key, title], index) => <article className={`council-demo-role role-${key}`} key={key}><span className="council-kicker">ЗАКРЫТОЕ ДОСЬЕ / 0{index + 1}</span><div className="council-role-symbol">{["К", "П", "₽"][index]}</div><h3>{title}</h3><p>{["Защитить интересы клиента и не сорвать его планы.", "Найти график, который команда сможет выполнить.", "Понять, откуда взять деньги на решение."][index]}</p><div className="council-qr-row">{codes[key] ? <img width="104" height="104" alt={`QR-код: ${title}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(codes[key].svg)}`} /> : <span className="council-qr-placeholder">Готовим QR…</span>}<Link to={`/demo/council?role=${key}`} target="_blank" rel="noreferrer">Открыть<br />досье ↗</Link></div></article>)}</div><details className="council-connection"><summary>Открываете роли с телефонов?</summary><label>Адрес сайта<input type="url" value={origin} onChange={e => setOrigin(e.target.value)} /></label><p>Укажите адрес, доступный всем устройствам в вашей сети. localhost на телефоне открывает сам телефон.</p></details><div className="council-stage-footer"><span>Все получили свои роли?</span><button className="council-button" onClick={() => setStep(1)}>Начать обсуждение →</button></div></section>}
      {step === 1 && <section className="council-panel council-demo-stage"><span className="council-kicker">02 / ПЕРЕГОВОРЫ</span><h2>Хорошее решение начинается с вопроса</h2><div className="council-discussion-prompts">{["Что вам нужно на самом деле?", "Какое ограничение нельзя нарушить?", "При каком условии вы согласитесь?"].map((prompt, index) => <div key={prompt}><span>0{index + 1}</span><h3>{prompt}</h3></div>)}</div><p>Обсуждайте вслух. Эта демонстрация проходит за одним столом; общий документ заполняет ведущий на своём экране.</p><details className="council-ai-assistant"><summary>Одна роль свободна? Подключить ИИ-персонажа</summary><p>Персонаж знает только свои вводные. Если модель недоступна, вы увидите отмеченную сценарную реплику.</p>{!user ? <Link to="/login">Войдите для разговора с ИИ →</Link> : <form onSubmit={ask} className="council-message-form"><label>Собеседник<select value={roleKey} onChange={e => setRoleKey(e.target.value)}>{Object.entries(roles).map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label><label>Ваш вопрос<textarea required maxLength={1500} value={message} placeholder="Какие условия вы готовы принять?" onChange={e => setMessage(e.target.value)} /></label><button className="council-button" disabled={busy}>{busy ? "Персонаж отвечает…" : "Спросить персонажа"}</button></form>}{replies.map((reply, index) => <article className="council-report-episode" key={index}><b>{reply.role} · {reply.source === "script" ? "Сценарная реплика" : "ИИ-персонаж"}</b><p>Вы: {reply.question}</p><blockquote>{reply.text}</blockquote></article>)}</details><div className="council-stage-footer"><button onClick={() => setStep(0)}>← К ролям</button><button className="council-button" onClick={() => setStep(2)}>Зафиксировать условия →</button></div></section>}
      {step === 2 && <section className="council-panel council-demo-stage"><div className="council-panel-heading"><div><span className="council-kicker">03 / ИТОГОВЫЙ ДОКУМЕНТ</span><h2>От слов — к обязательствам</h2></div><span className="council-document-stamp">ПРОЕКТ СОГЛАШЕНИЯ</span></div><p>Внесите условия, на которые согласились все три стороны. Система проверит их по исходным ограничениям кейса.</p><form className="council-agreement-form" onSubmit={check}><div className="council-agreement-fields"><label>Общее решение<textarea required placeholder="Как вы сохраните контракт?" value={agreement.decision} onChange={e => { setReport(null); setAgreement({ ...agreement, decision: e.target.value }); }} /></label>{Object.entries(fields).map(([key, title]) => <label key={key}>{title}<input type="number" min="0" max={key.includes("percent") ? 100 : key.includes("days") ? 180 : 1000000} required value={agreement[key]} onChange={e => { setReport(null); setAgreement({ ...agreement, [key]: Number(e.target.value) }); }} /></label>)}<label>Ответственный<input required placeholder="Кто проследит за исполнением?" value={agreement.owner} onChange={e => { setReport(null); setAgreement({ ...agreement, owner: e.target.value }); }} /></label></div><button className="council-button" disabled={checking}>{checking ? "Проверяем…" : "Проверить наш план ↗"}</button></form>{report && <div className={`council-demo-result ${report.feasible ? "is-success" : ""}`} role="status"><span>{report.feasible ? "✓ СОГЛАШЕНИЕ РАБОТАЕТ" : "ЕСТЬ ЧТО ОБСУДИТЬ"}</span><h3>{report.summary}</h3><ul>{report.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><button onClick={() => setStep(1)}>{report.feasible ? "Вернуться к обсуждению" : "Пересмотреть условия вместе →"}</button></div>}<div className="council-stage-footer"><button onClick={() => setStep(1)}>← К обсуждению</button><Link to="/council">К расписанию полных игр ↗</Link></div></section>}
    </>}
  </div>;
}
