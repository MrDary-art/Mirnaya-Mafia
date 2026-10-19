import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth.jsx";
import { api, downloadPrivate } from "../api.js";
import Icon from "../components/Icon.jsx";
import { AssignmentCard } from "./learning.jsx";
import { Empty, Loader, formatDate, metricLabels, statusLabels } from "./shared.jsx";

const finishedStatuses = new Set(["PASSED", "COMPLETED", "FAILED"]);
const activeStatuses = new Set(["ASSIGNED", "OPENED", "IN_PROGRESS"]);

function average(values) {
  const usable = values.filter(value => Number.isFinite(Number(value))).map(Number);
  return usable.length ? Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length) : null;
}

function MetricBar({ label, value }) {
  return <div className="employee-metric-row">
    <div><span>{label}</span><strong>{value == null ? "—" : `${value}%`}</strong></div>
    <div className="employee-metric-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>
  </div>;
}

export function EmployeeCabinet({ data, start, initialTab = "overview", hideTabs = false }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [attempts, setAttempts] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const id = data.company.id;
  const membershipId = data.membership.id;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api(`/api/company/${id}/attempts?membership_id=${membershipId}`),
      api(`/api/company/${id}/certificates`),
    ]).then(([attemptRows, certificateRows]) => {
      if (!active) return;
      setAttempts(attemptRows || []);
      setCertificates((certificateRows || []).filter(item => Number(item.membership_id) === Number(membershipId)));
    }).catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, membershipId]);

  const assignments = data.assignments || [];
  const activeAssignments = assignments.filter(item => activeStatuses.has(item.status));
  const completedAssignments = assignments.filter(item => finishedStatuses.has(item.status));
  const overdueAssignments = assignments.filter(item => item.status === "OVERDUE");
  const scoredAttempts = attempts.filter(item => item.score != null);
  const averageScore = average(scoredAttempts.map(item => item.score));
  const bestScore = scoredAttempts.length ? Math.max(...scoredAttempts.map(item => Number(item.score))) : null;
  const progress = assignments.length ? Math.round(completedAssignments.length * 100 / assignments.length) : 0;
  const programs = (data.programs || []).filter(item => item.enrolled);
  const nextAssignment = activeAssignments[0] || overdueAssignments[0] || null;
  const metrics = useMemo(() => {
    const keys = new Set(scoredAttempts.flatMap(item => Object.keys(item.metrics || {})));
    return [...keys].map(key => ({ key, label: metricLabels[key] || key, value: average(scoredAttempts.map(item => item.metrics?.[key])) }))
      .filter(item => item.value != null).sort((a, b) => a.value - b.value).slice(0, 4);
  }, [attempts]);
  const weakestMetric = metrics[0];
  const name = user?.display_name || user?.username || "Сотрудник";
  const tabs = [["overview", "Обзор"], ["assignments", `Задания · ${assignments.length}`], ["analytics", "Аналитика"], ["certificates", `Сертификаты · ${certificates.length}`]];

  function downloadCertificate(item) {
    downloadPrivate(`/api/company/${id}/certificates/${item.id}/pdf`, `${item.certificate_id}.pdf`).catch(cause => setError(cause.message));
  }

  return <section className="employee-cabinet">
    <article className="employee-profile-hero">
      <div className="employee-profile-identity">
        <span className="employee-profile-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <div><h2>{name}</h2><p>{data.membership.job_title || data.membership.role_label || "Должность не указана"}{data.membership.department ? ` · ${data.membership.department}` : ""}</p></div>
      </div>
      <dl className="employee-profile-facts">
        <div><dt>Роль</dt><dd>{data.membership.role_label}</dd></div>
        <div><dt>Компания</dt><dd>{data.company.name}</dd></div>
        <div><dt>Статус</dt><dd><span className="business-status business-status-positive">Активен</span></dd></div>
      </dl>
    </article>

    {!hideTabs && <nav className="employee-cabinet-tabs" aria-label="Разделы личного кабинета">
      {tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}>{label}</button>)}
    </nav>}

    {error && <p className="business-alert" role="alert">{error}</p>}
    {loading && <Loader />}

    {!loading && tab === "overview" && <div className="employee-cabinet-overview">
      <section className="employee-stat-grid" aria-label="Личная статистика">
        <article><span>Прогресс</span><strong>{progress}%</strong><small>{completedAssignments.length} из {assignments.length} заданий</small></article>
        <article><span>Средний результат</span><strong>{averageScore ?? "—"}</strong><small>{averageScore == null ? "После первой оценки" : "из 100 баллов"}</small></article>
        <article><span>В работе</span><strong>{activeAssignments.length}</strong><small>{overdueAssignments.length ? `${overdueAssignments.length} просрочено` : "Без просрочек"}</small></article>
        <article><span>Сертификаты</span><strong>{certificates.length}</strong><small>{certificates.filter(item => item.status === "ACTIVE").length} действующих</small></article>
      </section>

      <div className="employee-dashboard-grid">
        <article className="business-panel employee-next-action">
          <div className="employee-section-heading"><div><span className="business-eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h3>{nextAssignment ? nextAssignment.title : "Все текущие задания завершены"}</h3></div>{nextAssignment && <span className={`business-assignment-status is-${String(nextAssignment.status).toLowerCase()}`}>{statusLabels[nextAssignment.status] || nextAssignment.status}</span>}</div>
          {nextAssignment ? <><p>{nextAssignment.description || "Продолжите корпоративную практику и сохраните результат в профиле."}</p><div className="employee-next-meta"><span><Icon name="calendar" size={17}/>Срок: {formatDate(nextAssignment.deadline)}</span><span><Icon name="target" size={17}/>{nextAssignment.attempts_used || 0} из {nextAssignment.attempts_allowed} попыток</span></div>{activeStatuses.has(nextAssignment.status) && <button className="primary-button" onClick={() => start(nextAssignment.target_id || nextAssignment.id)}>{nextAssignment.status === "IN_PROGRESS" ? "Продолжить" : "Начать задание"}</button>}</> : <p>Новые задания появятся здесь после назначения руководителем.</p>}
        </article>

        <article className="business-panel employee-progress-card">
          <div className="employee-section-heading"><div><span className="business-eyebrow">ПРОГРЕСС</span><h3>Путь обучения</h3></div><strong>{progress}%</strong></div>
          <div className="employee-progress-track" aria-label={`Выполнено ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
          <dl><div><dt>Завершено</dt><dd>{completedAssignments.length}</dd></div><div><dt>В работе</dt><dd>{activeAssignments.length}</dd></div><div><dt>Ожидает</dt><dd>{Math.max(0, assignments.length - completedAssignments.length - activeAssignments.length)}</dd></div></dl>
        </article>

        <article className="business-panel employee-recommendations">
          <div className="employee-section-heading"><div><span className="business-eyebrow">РЕКОМЕНДАЦИИ</span><h3>На чём сфокусироваться</h3></div></div>
          <ul>
            {overdueAssignments.length > 0 && <li><Icon name="clock" size={18}/><span><b>Закройте просроченные задания</b><small>Сейчас их {overdueAssignments.length}. Начните с задания с ближайшим сроком.</small></span></li>}
            {weakestMetric && <li><Icon name="trending-up" size={18}/><span><b>Развивайте навык «{weakestMetric.label}»</b><small>Текущий средний показатель — {weakestMetric.value}%. Он ниже остальных измеряемых навыков.</small></span></li>}
            {!overdueAssignments.length && !weakestMetric && <li><Icon name="target" size={18}/><span><b>{nextAssignment ? "Продолжите назначенную практику" : "Профиль в хорошем состоянии"}</b><small>{nextAssignment ? "После завершения появится персональная аналитика по навыкам." : "Новые рекомендации появятся вместе с результатами следующих заданий."}</small></span></li>}
          </ul>
        </article>

        <article className="business-panel employee-programs-card">
          <div className="employee-section-heading"><div><span className="business-eyebrow">ОБУЧЕНИЕ</span><h3>Мои программы</h3></div><button type="button" className="employee-text-button" onClick={() => setTab("assignments")}>Все задания</button></div>
          {programs.length ? <div className="employee-program-list">{programs.slice(0, 3).map(program => { const done = (program.steps || []).filter(step => step.status === "completed").length; const total = (program.steps || []).length; return <div key={program.id}><div><b>{program.title}</b><span>{done} из {total} этапов</span></div><div className="employee-progress-track"><i style={{ width: `${total ? Math.round(done * 100 / total) : 0}%` }} /></div></div>; })}</div> : <Empty>Назначенные программы появятся здесь.</Empty>}
        </article>
      </div>
    </div>}

    {!loading && tab === "assignments" && <section className="employee-cabinet-section">
      <div className="employee-section-heading"><div><h2>Мои задания</h2><p>Практика, тесты и программы, назначенные вам компанией.</p></div><span>{completedAssignments.length} из {assignments.length} завершено</span></div>
      <div className="business-assignment-list">{assignments.map(item => <AssignmentCard data={data} key={item.target_id || item.id} item={item} start={start} demo={data.company.status === "DEMO"} />)}{!assignments.length && <Empty>У вас пока нет корпоративных заданий.</Empty>}</div>
    </section>}

    {!loading && tab === "analytics" && <section className="employee-cabinet-section">
      <div className="employee-section-heading"><div><h2>Личная аналитика</h2><p>Динамика формируется только по вашим корпоративным прохождениям.</p></div></div>
      <section className="employee-stat-grid compact"><article><span>Средний балл</span><strong>{averageScore ?? "—"}</strong><small>по оценённым попыткам</small></article><article><span>Лучший результат</span><strong>{bestScore ?? "—"}</strong><small>из 100 баллов</small></article><article><span>Попыток</span><strong>{attempts.length}</strong><small>{scoredAttempts.length} с итоговой оценкой</small></article></section>
      <div className="employee-analytics-grid">
        <article className="business-panel"><h3>Показатели навыков</h3>{metrics.length ? <div className="employee-metrics">{metrics.map(item => <MetricBar key={item.key} label={item.label} value={item.value} />)}</div> : <Empty>Показатели появятся после первой оценённой практики.</Empty>}</article>
        <article className="business-panel"><h3>Последние результаты</h3><div className="employee-attempt-list">{attempts.slice(0, 6).map(item => <div key={item.id}><span><b>{item.assignment_title}</b><small>{item.completed_at ? formatDate(item.completed_at) : "Попытка не завершена"}</small></span><strong>{item.score == null ? "—" : item.score}</strong></div>)}{!attempts.length && <Empty>История попыток пока пуста.</Empty>}</div></article>
      </div>
    </section>}

    {!loading && tab === "certificates" && <section className="employee-cabinet-section">
      <div className="employee-section-heading"><div><h2>Мои сертификаты</h2><p>Подтверждения успешно пройденных корпоративных программ и заданий.</p></div></div>
      <div className="employee-certificate-grid">{certificates.map(item => <article className="business-panel" key={item.id}><span className="business-eyebrow">СЕРТИФИКАТ</span><h3>{item.title}</h3><dl><div><dt>Результат</dt><dd>{item.final_score == null ? "—" : `${item.final_score}/100`}</dd></div><div><dt>Выдан</dt><dd>{formatDate(item.issued_at)}</dd></div><div><dt>Статус</dt><dd>{statusLabels[item.status] || item.status}</dd></div></dl><button className="subtle-button" onClick={() => downloadCertificate(item)}>Скачать PDF</button></article>)}{!certificates.length && <Empty>Сертификаты появятся после успешного прохождения задания с выдачей подтверждения.</Empty>}</div>
    </section>}

    <p className="employee-privacy-note"><Icon name="lock" size={17}/>Компания видит только результаты корпоративных заданий в пределах вашей роли доступа. Личная практика и переписка остаются приватными.</p>
  </section>;
}
