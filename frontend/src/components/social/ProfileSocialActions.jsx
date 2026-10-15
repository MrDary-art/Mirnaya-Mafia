import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { UserPlusIcon } from "@phosphor-icons/react/dist/csr/UserPlus";
import { useAuth } from "../../auth.jsx";
import { api } from "../../api.js";
import "./profile-social-actions.css";

export function friendshipChanged(userId, action) {
  const detail = { userId, action };
  ["arena:friends-changed", "arena:feed-access-changed", "arena:notifications-changed"].forEach((name) => window.dispatchEvent(new CustomEvent(name, { detail })));
}

/** One action contract shared by a person's profile and discovery results. */
export default function ProfileSocialActions({ person, compact = false, onRefresh, onOpenChat, onChanged, onBlocked }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false), mounted = useRef(true), identity = useRef(person.id);
  identity.current = person.id;
  useEffect(() => { mounted.current = true; setError(""); setNotice(""); setBusy(""); lock.current = false; return () => { mounted.current = false; }; }, [person.id]);
  const self = String(user?.id) === String(person.id) || user?.username === person.username;
  const relationship = person.relationship || "NONE";
  const friends = relationship === "FRIENDS";
  const canMessage = friends && person.can_message !== false;
  async function act(action) {
    if (lock.current || self) return;
    if (action === "remove" && !window.confirm(`Удалить ${person.display_name || person.username} из друзей? Доступ к материалам «для друзей» изменится.`)) return;
    if (action === "block" && !window.confirm(`Заблокировать ${person.display_name || person.username}? Новые сообщения и доступ к материалам между вами будут недоступны.`)) return;
    const currentId = person.id;
    lock.current = true; setBusy(action); setError(""); setNotice("");
    try {
      await api(`/api/social/friends/${currentId}/${action}`, { method: "POST" });
      friendshipChanged(currentId, action);
      if (action === "block") {
        const blocked = await api("/api/social/blocked");
        if (!blocked.some((entry) => entry.id === currentId)) throw new Error("Блокировку пока не удалось подтвердить. Обновите страницу.");
        if (mounted.current && identity.current === currentId) onBlocked?.();
      } else if (mounted.current && identity.current === currentId) await onRefresh?.(action);
      await onChanged?.();
      if (mounted.current && identity.current === currentId) setNotice(({ request: "Заявка отправлена.", accept: "Заявка принята. Теперь вы друзья.", decline: "Заявка отклонена.", remove: "Пользователь удалён из друзей.", block: "Пользователь заблокирован." })[action]);
    } catch (failure) {
      if (mounted.current && identity.current === currentId) setError(failure.message);
    } finally {
      if (identity.current === currentId) lock.current = false;
      if (mounted.current && identity.current === currentId) setBusy("");
    }
  }
  function message() {
    if (!canMessage || lock.current) return;
    if (onOpenChat) onOpenChat(person);
    else navigate(`/feed?section=messages&chat=${encodeURIComponent(person.id)}`);
  }
  if (self) return <div className={`profile-social-actions${compact ? " is-compact" : ""}`}><Link className="subtle-button" to="/profile">Мой профиль</Link></div>;
  return <div className={`profile-social-actions${compact ? " is-compact" : ""}`} aria-busy={Boolean(busy)}>
    <div className="profile-social-actions-buttons">
      {(relationship === "NONE" || relationship === "REMOVED") && <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => act("request")}><UserPlusIcon size={18} aria-hidden="true" />{busy === "request" ? "Отправляем…" : compact ? "Добавить" : "Добавить в друзья"}</button>}
      {relationship === "REQUEST_SENT" && <span className="profile-social-relationship"><CheckIcon size={17} aria-hidden="true" />Заявка отправлена</span>}
      {relationship === "REQUEST_RECEIVED" && <><button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => act("accept")}>{busy === "accept" ? "Принимаем…" : "Принять заявку"}</button><button type="button" className="subtle-button" disabled={Boolean(busy)} onClick={() => act("decline")}>{busy === "decline" ? "Отклоняем…" : "Отклонить"}</button></>}
      {friends && <>{!compact && <span className="profile-social-relationship"><CheckIcon size={18} aria-hidden="true" />Вы друзья</span>}<button type="button" className="primary-button" disabled={Boolean(busy) || !canMessage} onClick={message} title={!canMessage ? "Личные сообщения сейчас недоступны" : undefined}><ChatCircleIcon size={18} aria-hidden="true" />{canMessage ? compact ? "Написать" : "Написать сообщение" : "Сообщения недоступны"}</button>{!compact && <><button type="button" className="subtle-button" disabled={Boolean(busy) || !canMessage} onClick={() => navigate(`/rooms?friend=${person.id}`)}>Пригласить на 1 на 1</button><button type="button" className="subtle-button" disabled={Boolean(busy)} onClick={() => act("remove")}>{busy === "remove" ? "Удаляем…" : "Удалить из друзей"}</button></>}</>}
      {relationship === "BLOCKED" && <span className="profile-social-relationship">Связь с пользователем недоступна</span>}
      {!compact && relationship !== "BLOCKED" && <button type="button" className="profile-social-block-button" disabled={Boolean(busy)} onClick={() => act("block")}>{busy === "block" ? "Блокируем…" : "Заблокировать"}</button>}
    </div>
    {error && <p className="profile-social-action-error" role="alert">{error}</p>}
    {notice && <p className="profile-social-action-notice" role="status">{notice}</p>}
  </div>;
}
