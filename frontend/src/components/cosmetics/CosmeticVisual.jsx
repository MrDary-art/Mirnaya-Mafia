import { useEffect, useState } from "react";
import "./cosmetics.css";
import { StarAmount } from "../Icon.jsx";
import { frameImageForCode } from "./frameAssets.js";
import { owlImageForCode } from "./owlAvatars.js";

export const cosmeticCategories = [
  ["avatar", "Аватары"], ["frame", "Рамки"], ["status", "Статусы"], ["theme", "Фоны"], ["badge", "Значки"],
];

const statusNames = {
  status_online: "На связи", status_listening: "Слушаю внимательно", status_dialogue: "Открыт к диалогу",
  status_questions: "Задаю вопросы", status_balance: "Ищу баланс", status_calm: "Спокойный тон",
  status_solution: "В поиске решения", status_negotiating: "За столом переговоров",
};
export const statusLabel = (code) => statusNames[code] || "";

function FrameArt({ code }) {
  const frameImage = `${import.meta.env.BASE_URL || "/"}${frameImageForCode(code)}`;
  return <img className="cosmetic-frame" src={frameImage} alt="" loading="lazy" decoding="async" />;
}

export function BadgeArt({ code, size = 24 }) {
  const paths = {
    badge_spark: "M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9Z",
    badge_focus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    badge_pulse: "M2 12h5l3-6 4 12 3-6h5",
    badge_dialogue: "M4 5h16v12H9l-5 4V5Z",
    badge_vector: "M12 2 21 20 12 16 3 20Z",
    badge_tact: "M12 2 21 7v6c0 5-4 8-9 9-5-1-9-4-9-9V7Z",
    badge_balance: "M12 3v17M4 7h16M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM7 21h10",
    badge_rhythm: "M3 14c3-8 6 8 9 0s6 8 9 0",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[code] || paths.badge_spark} /></svg>;
}

export function CosmeticItemArt({ item, equipment = {}, userId }) {
  if (item.category === "avatar") return <UserAvatar avatarCode={item.code} frameCode={equipment.frame_code} userId={userId} size="lg" name={item.name} />;
  if (item.category === "frame") return <UserAvatar avatarCode={equipment.avatar_code} frameCode={item.code} userId={userId} size="lg" name={item.name} />;
  if (item.category === "theme") return <div className={`cosmetic-theme-swatch cosmetic-background-${item.code}`} aria-label={item.name}><span>ПРОФИЛЬ</span><i /></div>;
  if (item.category === "status") return <span className="cosmetic-status-swatch">{statusLabel(item.code)}</span>;
  return <span className="cosmetic-badge-swatch" aria-label={item.name}><BadgeArt code={item.code} size={52} /></span>;
}

export function UserAvatar({ avatarCode = "avatar_analyst", frameCode = "frame_classic", userId, size = "md", name = "Аватар", className = "" }) {
  const [failed, setFailed] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const imageBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  useEffect(() => {
    if (avatarCode !== "avatar_custom" || !userId) return undefined;
    const onChanged = () => { setFailed(false); setImageVersion(Date.now()); };
    window.addEventListener("arena:cosmetics-changed", onChanged);
    return () => window.removeEventListener("arena:cosmetics-changed", onChanged);
  }, [avatarCode, userId]);
  const custom = avatarCode === "avatar_custom" && userId && !failed;
  const owlImage = `${import.meta.env.BASE_URL || "/"}${owlImageForCode(avatarCode)}`;
  return <span className={`user-avatar user-avatar--${size} ${className}`} role="img" aria-label={name}>
    {custom ? <img className="user-avatar-image" src={`${imageBase}/api/avatars/${userId}?v=${imageVersion}`} alt="" loading="lazy" onError={() => setFailed(true)} /> : <img className="user-avatar-owl" src={owlImage} alt="" loading={size === "xs" ? "eager" : "lazy"} decoding="async" />}
    <FrameArt code={frameCode} />
  </span>;
}

export function ProfilePreview({ equipment = {}, username = "Игрок", level = 1, stars = null, userId, isPreview = false, compact = false, details, children }) {

  return <div className={`cosmetic-profile-preview cosmetic-background-${equipment.profile_theme || "theme_arena"}${compact ? " cosmetic-profile-preview--compact" : ""}`}>
    <div className="cosmetic-profile-content">
      <UserAvatar avatarCode={equipment.avatar_code} frameCode={equipment.frame_code} userId={userId} size={compact ? "md" : "xl"} name={`Аватар ${username}`} />
      <div className="cosmetic-profile-copy">{isPreview && <span className="cosmetic-preview-label">Предпросмотр</span>}<strong>{username}</strong><div className="cosmetic-profile-meta"><span>Уровень {level}</span>{stars != null && <StarAmount className="cosmetic-star-balance" value={stars} />}</div>{details}{equipment.status_code && <span className="cosmetic-profile-status">{statusLabel(equipment.status_code)}</span>}{equipment.badge_code && <span className="cosmetic-profile-badge"><BadgeArt code={equipment.badge_code} size={18} /> {badgeLabel(equipment.badge_code)}</span>}</div>
    </div>
    {children}
  </div>;
}

const badgeNames = { badge_spark: "Искра", badge_focus: "Фокус", badge_pulse: "Импульс", badge_dialogue: "Диалог", badge_vector: "Вектор", badge_tact: "Такт", badge_balance: "Баланс", badge_rhythm: "Ритм" };
export const badgeLabel = (code) => badgeNames[code] || "Значок";
