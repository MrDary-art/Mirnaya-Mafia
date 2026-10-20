import Icon from "./Icon.jsx";
import MetricsBar, { MetricsExplanation } from "../MetricsBar.jsx";

function savedSituation(settings) {
  const labels = {
    "Факты исходной ситуации": "context",
    "Описание ситуации": "description",
    "Интерес собеседника": "opponentGoal",
    "Исходная позиция собеседника": "opening",
  };
  const facts = { restrictions: [] };
  for (const line of String(settings.constraints || "").split("\n").map(value => value.trim()).filter(Boolean)) {
    const label = Object.keys(labels).find(value => line.startsWith(`${value}:`));
    if (label) facts[labels[label]] = line.slice(label.length + 1).trim();
    else if (line !== "Не вводить новые бюджет, сроки и ограничения сверх исходной ситуации.") facts.restrictions.push(line);
  }
  return facts;
}

export function TwinDuelBrief({ session }) {
  const settings = session.settings || {};
  const brief = settings.practice_plan?.brief || {};
  const facts = savedSituation(settings);
  const description = [...new Set([facts.context, facts.description].filter(Boolean))].join(" ");
  return <section className="twin-situation" aria-labelledby="twin-situation-title">
    <h2 id="twin-situation-title" tabIndex={-1}>{settings.problem || "Ситуация для переговоров"}</h2>
    <p className="twin-situation-description">{description || brief.situation || "Обсудите условия сотрудничества и найдите решение, приемлемое для обеих сторон."}</p>
    <dl className="twin-roles">
      <div><dt>Ваша роль</dt><dd>{session.role}</dd></div>
      <div><dt>Роль собеседника</dt><dd>{settings.practice_plan?.opponent_role || session.opponent_role}</dd></div>
    </dl>
    <div className="twin-goal"><Icon name="target" size={20}/><div><h3>Ваша цель</h3><p>{brief.player_task || session.goal}</p></div></div>
    {facts.opening && <div className="twin-opening"><h3>Исходное требование собеседника</h3><p>«{facts.opening}»</p></div>}
    {facts.restrictions.length > 0 && <div className="twin-restrictions"><h3>Условия, которые нужно учесть</h3>{facts.restrictions.map((text, index) => <p key={index}>{text}</p>)}</div>}
  </section>;
}

export function TwinDuelSidebar({ session, answered }) {
  const duel = session.settings.twin_duel;
  const measured = session.metrics_coverage ? session.metrics_coverage.measured > 0 : answered > 0;
  return <>
    <section className="twin-performance" aria-labelledby="twin-performance-title">
      <div className="twin-panel-heading"><h2 id="twin-performance-title">Показатели дуэли</h2><MetricsExplanation mode={session.mode} scoring={session.scoring} inline/></div>
      <p className="twin-panel-note">{measured ? "Ваши текущие показатели и ориентир двойника." : "Ваши показатели появятся после первого ответа."}</p>
      <MetricsBar metrics={session.metrics} mode={session.mode} scoring={session.scoring} coverage={session.metrics_coverage} comparison={duel.target} showExplanation={false}/>
      <p className="twin-metric-note">Игровые баллы от 0 до 100, а не процент достижения цели.</p>
    </section>
    <section className="twin-rules" aria-labelledby="twin-rules-title">
      <h2 id="twin-rules-title">Как пройти дуэль</h2>
      <p className="twin-turn-count"><span>Ваши ходы</span><strong>{answered} <span>/ минимум {duel.minimum_turns}</span></strong></p>
      <ul>
        <li>Не менее {duel.minimum_turns} содержательных ходов.</li>
        <li>Договорённость по вашей цели подтверждена в разборе.</li>
        <li>Средний результат — не ниже {duel.target_score} баллов.</li>
        <li>Хотя бы 3 из 4 показателей — на уровне двойника.</li>
      </ul>
      <p className="twin-panel-note">Итог — в разборе после завершения разговора.</p>
    </section>
    <details className="twin-about">
      <summary>Как устроен двойник<Icon name="plus" size={16}/></summary>
      <p>ИИ ведёт переговоры от лица другой стороны и использует стратегию, основанную на ваших лучших результатах.</p>
      <p>{duel.topic_is_fallback ? "Тема прошлых разговоров не сохранена, поэтому выбрана нейтральная деловая ситуация." : "Для дуэли выбрана частая тема из ваших прошлых практик."} Условия сравнения фиксируются перед началом.</p>
      <p>Это учебная модель навыков, а не копия вашей личности. Лучшие показатели могли быть достигнуты в разных разговорах.</p>
      <dl><dt>Отчётов в основе</dt><dd>{duel.source_count}</dd></dl>
    </details>
  </>;
}
