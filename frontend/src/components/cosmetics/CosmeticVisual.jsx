import { useEffect, useState } from "react";
import "./cosmetics.css";
import { StarAmount } from "../Icon.jsx";
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
  const index = ["frame_classic", "frame_minimal", "frame_violet", "frame_cyber", "frame_emerald", "frame_electric", "frame_executive", "frame_neon", "frame_ice", "frame_gold", "frame_diplomat", "frame_grandmaster", "frame_prism"].indexOf(code);
  const palette = ["#a9c4b5", "#9baeb0", "#b9a3dc", "#79cbd0", "#8ed9ae", "#b0d6ff", "#d4c4a0", "#9ee7d7", "#c6e6ee", "#e9ca83", "#b9d2bd", "#e3c38c", "#bea9e0"];
  const color = palette[Math.max(0, index)];
  return <svg className="cosmetic-frame" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="94" height="94" rx="22" fill="none" stroke={color} strokeWidth={index === 6 ? "5" : "3.5"} />
    {index === 0 && <rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".48" strokeWidth="1.8" />}
    {index === 1 && <path d="M20 7H80M20 93H80M7 20V80M93 20V80" fill="none" stroke={color} strokeOpacity=".68" strokeWidth="2" strokeLinecap="round" />}
    {index === 2 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="2" /><path d="M16 12h16M68 12h16M16 88h16M68 88h16" stroke={color} strokeWidth="3" strokeLinecap="round" /></>}
    {index === 3 && <path d="M19 4v12l-8 8M81 4v12l8 8M19 96V84l-8-8M81 96V84l8-8M4 19h12M84 19h12M4 81h12M84 81h12" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 4 && <path d="M28 8c-8 2-11 8-14 16M72 8c8 2 11 8 14 16M28 92c-8-2-11-8-14-16M72 92c8-2 11-8 14-16M8 31v38M92 31v38" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />}
    {index === 5 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="8 5" /><path d="M50 1 54 9 50 17 46 9ZM50 83l4 8-4 8-4-8ZM1 50l8-4 8 4-8 4ZM83 50l8-4 8 4-8 4Z" fill={color} /></>}
    {index === 6 && <path d="M24 3h52M24 97h52M3 24v52M97 24v52M13 13h15M72 13h15M13 87h15M72 87h15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="square" />}
    {index === 7 && <><rect x="7" y="7" width="86" height="86" rx="19" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="2" /><rect x="12" y="12" width="76" height="76" rx="15" fill="none" stroke={color} strokeWidth="2" strokeDasharray="14 6" /></>}
    {index === 8 && <path d="m16 5 9 11-13 4M84 5 75 16l13 4M16 95l9-11-13-4M84 95l-9-11 13-4M8 30h7M85 30h7M8 70h7M85 70h7" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 9 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="1.5" /><path d="m13 23 9-12 8 7M87 23 78 11l-8 7M13 77l9 12 8-7M87 77 78 89l-8-7" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" /></>}
    {index === 10 && <path d="M4 42h10l5 8-5 8H4M96 42H86l-5 8 5 8h10M29 7v8M71 7v8M29 93v-8M71 93v-8" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 11 && <path d="m23 7 7 10 8-8 12 9 12-9 8 8 7-10M23 93l7-10 8 8 12-9 12 9 8-8 7 10M8 31v38M92 31v38" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 12 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".45" strokeWidth="1.5" /><path d="m23 4 8 15-15 7M77 4 69 19l15 7M23 96l8-15-15-7M77 96l-8-15 15-7" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" /></>}
  </svg>;
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

export function ProfilePreview({ equipment = {}, username = "Игрок", displayName, level = 1, showLevel = true, stars = null, userId, isPreview = false, compact = false, details, children, className = "" }) {

  return <div className={`cosmetic-profile-preview cosmetic-background-${equipment.profile_theme || "theme_arena"}${compact ? " cosmetic-profile-preview--compact" : ""}${className ? ` ${className}` : ""}`}>
    <div className="cosmetic-profile-content">
      <UserAvatar avatarCode={equipment.avatar_code} frameCode={equipment.frame_code} userId={userId} size={compact ? "md" : "xl"} name={`Аватар ${username}`} />
      <div className="cosmetic-profile-copy">{isPreview && <span className="cosmetic-preview-label">Предпросмотр</span>}<strong>{displayName || username}</strong><div className="cosmetic-profile-meta">{displayName && displayName !== username && <span>@{username}</span>}{showLevel && <span>Уровень {level}</span>}{stars != null && <StarAmount className="cosmetic-star-balance" value={stars} />}</div>{details}{equipment.status_code && <span className="cosmetic-profile-status">{statusLabel(equipment.status_code)}</span>}{equipment.badge_code && <span className="cosmetic-profile-badge"><BadgeArt code={equipment.badge_code} size={18} /> {badgeLabel(equipment.badge_code)}</span>}</div>
    </div>
    {children}
  </div>;
}

const badgeNames = { badge_spark: "Искра", badge_focus: "Фокус", badge_pulse: "Импульс", badge_dialogue: "Диалог", badge_vector: "Вектор", badge_tact: "Такт", badge_balance: "Баланс", badge_rhythm: "Ритм" };
export const badgeLabel = (code) => badgeNames[code] || "Значок";
