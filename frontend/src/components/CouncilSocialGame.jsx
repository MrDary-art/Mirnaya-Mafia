import "./council-social-game.css";

export function SocialRole({ role }) {
  return <article className="council-role-card social-role">
    <span className="council-kicker">ЗАКРЫТОЕ ДОСЬЕ · ТОЛЬКО ВЫ</span><h2>{role.name}</h2><p>{role.goal}</p>
    <div className="social-role-priorities"><section><span>ЛИЧНЫЙ ИНТЕРЕС</span><p>{role.personal_interest}</p></section><section><span>ВАШИ ПОЛНОМОЧИЯ</span><p>{role.authority}</p></section></div>
    <h3>Что знаете вы</h3><ul>{role.private_facts.map(text => <li key={text}>{text}</li>)}</ul>
    {role.sealed ? <div className="social-sealed"><b>Вторая часть досье закрыта</b><p>Откроется после первых предложений. Пока выясните интересы остальных.</p></div> : role.new_facts?.length > 0 && <section className="social-new-facts"><span className="council-kicker">НОВАЯ ВВОДНАЯ</span>{role.new_facts.map(text => <p key={text}>{text}</p>)}</section>}
    <h3>Границы роли</h3><ul>{role.limits.map(text => <li key={text}>{text}</li>)}</ul>
    <div className="council-role-footer"><p><b>Можете предложить</b>{role.can_offer}</p><p><b>Стоит выяснить</b>{role.ask}</p></div>
  </article>;
}

export default function CouncilSocialGame({ game, players = [], userId, advance, busy, demo = false }) {
  if (!game) return null;
  const approved = game.approvals.includes(userId);
  return <section className="council-panel social-game" aria-label="Ход игры">
    <div className="social-game-heading"><span className="council-kicker">КОНТРАКТ НА КОНУ</span><span className="social-game-duration">4 игрока · 15–20 минут</span></div>
    <ol className="social-stage-list">{game.stages.map((stage, index) => <li key={stage.title} aria-current={index === game.stage ? "step" : undefined} className={index < game.stage ? "is-complete" : ""}><span>{index < game.stage ? "✓" : `0${index + 1}`}</span><b>{stage.title}</b></li>)}</ol>
    <div className="social-current"><div><span className="council-kicker">ЭТАП {game.stage + 1} / 4 · ОКОЛО {game.current.minutes} МИНУТ</span><h2>{game.current.title}</h2><p>{game.current.prompt}</p></div><span className="social-current-number" aria-hidden="true">0{game.stage + 1}</span></div>
    {game.event && <aside className="social-event" role="status"><span className="council-kicker">СОБЫТИЕ · НОВЫЕ УСЛОВИЯ</span><h3>{game.event.title}</h3><p>{game.event.text}</p></aside>}
    {!game.finished && game.stage < 3 && advance && <div className="social-stage-action"><p>{demo ? "Для демонстрации этап переключает ведущий. На полной игре нужно согласие всех четырёх." : `Готовы продолжать: ${game.approvals.length} / ${players.filter(p => p.status === "confirmed").length}. Время этапа — ориентир, обсуждение можно продолжить.`}</p><button className="council-button" disabled={busy || approved} onClick={advance}>{busy ? "Сохраняем…" : approved ? "Ждём остальных" : `К этапу «${game.stages[game.stage + 1].title}» →`}</button></div>}
  </section>;
}

export function SocialConsequences({ report }) {
  if (!report?.consequences) return null;
  return <section className="social-consequences"><span className="council-kicker">ПОСЛЕ ПОДПИСАНИЯ</span><h2>Что произошло дальше</h2><ul>{report.consequences.map(text => <li key={text}>{text}</li>)}</ul><h3>Цена общего решения</h3><div className="social-outcomes">{Object.entries(report.role_outcomes || {}).map(([key, role]) => <article key={key}><span className={role.achieved ? "social-interest-met" : "social-interest-traded"}>{role.achieved ? "Интерес сохранён" : report.feasible ? "Личная уступка" : "План требует пересмотра"}</span><h4>{role.name}</h4><p>{role.interest}</p></article>)}</div><p>{report.replay}</p><small>Итог рассчитан по условиям соглашения. Он не оценивает личность и не описывает незаписанный разговор.</small></section>;
}
