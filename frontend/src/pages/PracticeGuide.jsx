import { Link, useLocation, useParams } from "react-router-dom";

export default function PracticeGuide() {
  const location = useLocation();
  const { companyId } = useParams();
  if (companyId) {
    const base = `/business/${encodeURIComponent(companyId)}`;
    const requestedReturn = location.state?.returnTo;
    const returnTo = typeof requestedReturn === "string" && requestedReturn.startsWith(`${base}/`) ? requestedReturn : `${base}/assignments`;
    return <div className="practice-page practice-guide">
      <header className="practice-intro"><h1>Практика по задаче компании</h1><p>Цель, роли и условия тренировки задаются в назначении.</p></header>
      <section className="practice-guide-section"><div><h2>Откройте назначенное задание</h2><p>Проверьте цель, срок и доступные попытки. Если тренировка уже начата, продолжите её из списка заданий.</p><Link to={`${base}/assignments`}>Мои задания →</Link></div></section>
      <section className="practice-guide-section"><div><h2>Проведите разговор</h2><p>Отвечайте в выбранной роли. Во время практики с ИИ можно писать или отправлять голосовые сообщения, если голос доступен. Подсказки и ментор работают, когда они разрешены условиями задания.</p></div></section>
      <section className="practice-guide-section"><div><h2>Посмотрите результат</h2><p>Разбор и прогресс сохранятся в компании. Если публикация отложена, результат откроется после срока задания или решения руководителя.</p><Link to={`${base}/results`}>Результаты компании →</Link></div></section>
      <section className="practice-status-panel"><h2>Продолжить практику</h2><p>Возвращайтесь к текущему разговору со своим черновиком ответа.</p><div className="practice-actions"><Link className="primary-button" to={returnTo} state={location.state?.returnState}>Вернуться к практике</Link><Link className="subtle-button" to={`${base}/assignments`}>Открыть задания</Link></div></section>
    </div>;
  }
  const setupReturn = { returnTo: "/ai/guide", returnState: location.state };
  return <div className="practice-page practice-guide"><header className="practice-intro"><h1>Репетиция, из которой понятно, что взять в жизнь</h1></header>
    <section className="practice-guide-section"><div><h2>Сформулируйте желаемый результат</h2><p>Укажите роли, цель и ограничения разговора.</p><Link to="/ai/prepare" state={setupReturn}>Настроить свою ситуацию →</Link></div><article className="practice-example-card"><h3>Перенести срок проекта</h3><dl><dt>Вы</dt><dd>Руководитель проекта</dd><dt>Собеседник</dt><dd>Заказчик</dd><dt>Результат</dt><dd>Дополнительная неделя на запуск</dd><dt>Ограничение</dt><dd>Без увеличения бюджета</dd></dl></article></section>
    <section className="practice-guide-section"><div><h2>Проверьте подход в диалоге</h2><p>Отвечайте текстом или голосом. Ментор поможет подобрать аргумент или улучшить реплику.</p></div><article className="practice-example-card practice-example-dialogue"><blockquote><b>Заказчик</b>Нам важно запуститься в пятницу. Почему нужно переносить всё?</blockquote><blockquote className="own"><b>Вы</b>Для вас важнее дата или полный объём функций?</blockquote><blockquote><b>Заказчик</b>Дата. Основные функции должны работать к показу.</blockquote></article></section>
    <section className="practice-guide-section"><div><h2>Посмотрите разбор</h2><p>Отчёт покажет важные реплики и следующий шаг. Разговор останется в истории.</p><Link to="/report/example">Открыть пример разбора →</Link></div><article className="practice-example-card"><h3>Вы выяснили интерес за требованием</h3><p>Вопрос о дате и объёме помог увидеть вариант: запустить основные функции в пятницу, остальные — через неделю.</p></article></section>
    <section className="practice-status-panel"><h2>Хотите потренировать собеседование?</h2><p>Укажите должность и уровень. ИИ задаст вопросы, а разбор покажет ваши аргументы и примеры.</p><div className="practice-actions"><Link className="primary-button" to="/ai/prepare" state={setupReturn}>Настроить переговоры</Link><Link className="subtle-button" to="/ai/prepare?kind=job" state={setupReturn}>Потренировать интервью</Link></div></section>
  </div>;
}
