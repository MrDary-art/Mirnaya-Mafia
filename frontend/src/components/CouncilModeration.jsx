import { useState } from "react";

const roles = { project: "Проект", client: "Клиент", production: "Производство", finance: "Финансы" };

function RoleEditor({ person, action, busy, onClose }) {
  const [draft, setDraft] = useState({ ...person.packet, role: person.packet.key || "project", private_facts: person.packet.private_facts.join("\n"), limits: person.packet.limits.join("\n") });
  async function save(event) {
    event.preventDefault();
    const body = { ...draft, private_facts: draft.private_facts.split("\n").filter(Boolean), limits: draft.limits.split("\n").filter(Boolean) };
    if (await action(`/members/${person.user_id}/role`, body, "PUT")) onClose();
  }
  return <form className="council-role-editor" onSubmit={save}><div className="council-panel-heading"><h3>Задание · {person.name}</h3><button type="button" onClick={onClose}>Закрыть</button></div><p>Если роль занята, участники обменяются ролями. Новые вводные сбросят готовность и голоса. Числовая проверка соглашения по-прежнему использует исходные условия кейса.</p><label>Роль<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>{Object.entries(roles).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>{[["name", "Название роли"], ["goal", "Цель и ТЗ"], ["private_facts", "Закрытые факты · каждый с новой строки"], ["limits", "Ограничения · каждое с новой строки"], ["can_offer", "Что можно предложить"], ["ask", "Что нужно выяснить"]].map(([key, title]) => <label key={key}>{title}<textarea required={key === "name" || key === "goal"} maxLength={key === "name" ? 150 : key === "private_facts" || key === "limits" ? 10000 : 2000} rows={key === "name" ? 1 : 3} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<button className="council-button" disabled={busy}>Сохранить и уведомить участника</button></form>;
}

export default function CouncilModeration({ data, action, busy }) {
  const [editing, setEditing] = useState(null), [confirm, setConfirm] = useState(null);
  async function perform() { if (await action(confirm.path)) setConfirm(null); }
  return <section className="council-moderation"><div className="council-panel-heading"><div><span className="council-kicker">♛ ПУЛЬТ ОРГАНИЗАТОРА</span><h2>Вы ведёте встречу</h2></div><button className="council-danger" disabled={busy} onClick={() => setConfirm({ path: "/finish", title: "Завершить встречу для всех?", text: "Обсуждение и звонок закроются. Сохранённый документ останется в разборе без утверждения командой." })}>Завершить игру</button></div>
    <div className="council-moderation-list">{data.managed_members.map(person => <article key={person.user_id}><div className="council-person-heading"><span className="council-avatar">{person.name.slice(0, 1)}</span><div><b>{person.name}</b><small>{person.packet.name}</small></div></div><div className="council-control-actions"><button disabled={busy} aria-pressed={person.muted} onClick={() => action(`/members/${person.user_id}/controls`, { muted: !person.muted }, "PATCH")}>{person.muted ? "Разрешить микрофон" : "Замутить"}</button><button disabled={busy} aria-pressed={person.camera_blocked} onClick={() => action(`/members/${person.user_id}/controls`, { camera_blocked: !person.camera_blocked }, "PATCH")}>{person.camera_blocked ? "Разрешить камеру" : "Выключить камеру"}</button><button disabled={busy} onClick={() => setEditing(person)}>Роль и задание</button><button disabled={busy || person.user_id === data.organizer_id} className="council-danger" onClick={() => setConfirm({ path: `/members/${person.user_id}/kick`, title: `Исключить ${person.name}?`, text: "Участник потеряет доступ к встрече и звонку. Повторно записаться на эту встречу он не сможет." })}>Исключить</button></div></article>)}</div>
    {!data.managed_members.length && <p>Пригласите участников — здесь появятся управление связью и редактор личных заданий.</p>}
    {editing && <RoleEditor key={editing.user_id} person={editing} action={action} busy={busy} onClose={() => setEditing(null)} />}
    {confirm && <div className="council-confirm" role="alertdialog" aria-label={confirm.title}><h3>{confirm.title}</h3><p>{confirm.text}</p><div className="council-action-row"><button className="council-danger" disabled={busy} onClick={perform}>Подтвердить</button><button disabled={busy} onClick={() => setConfirm(null)}>Отмена</button></div></div>}
  </section>;
}
