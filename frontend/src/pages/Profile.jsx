import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import MetricsBar from "../MetricsBar.jsx";
import History from "./History.jsx";

const CTA = {
  "Пройти сценарий": "/setup", "Выбрать сценарий": "/", "Укрепить доверие": "/training/tree", "Перейти к обучению": "/training/tree", "Попробовать новую роль": "/setup", "Открыть новый сценарий": "/", "Изучить альтернативы": "/training/tree", "Повторить тренировку": "/training/tree", "Пройти сложный сценарий": "/setup", "Выбрать сложного оппонента": "/setup", "Выбрать новый тип конфликта": "/setup", "Завершить обучение": "/training/tree",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState("");
  const [shopCategory, setShopCategory] = useState(null);
  const { refresh } = useAuth();
  const nav = useNavigate();
  const load = () => api("/api/profile").then(setProfile);
  useEffect(() => { load().catch((error) => alert(error.message)); }, []);
  useEffect(() => {
    if (!profile) return;
    const hints = {
      "Короткая практика": "Испытание дня: короткий сценарий высокой сложности. Первое успешное прохождение даёт 2★.",
      "Как вы ведёте переговоры": "Этот блок показывает поведение в игровых сессиях, а не психологический диагноз.",
      "Освоение дерева навыков": "Учебные упражнения дают опыт обучения и открывают следующие узлы дерева.",
      "Достижения": "Достижения выдаются один раз за реальные результаты: техники, качество метрик и регулярную практику.",
      "Оформление и тренировочные возможности": "★ дают за качественную практику. Покупки не меняют метрики, ответы, ранг или исход переговоров.",
      "Последние операции": "Здесь показаны все начисления и траты ★ с объяснением причины.",
      "История обучения и переговоров": "Здесь хранятся все переговоры и начатые курсы. Используйте фильтры по типу и состоянию.",
    };
    document.querySelectorAll("#profile-page h2").forEach((heading) => {
      const text = heading.textContent?.trim();
      const hint = Object.entries(hints).find(([name]) => text?.startsWith(name))?.[1];
      if (!hint || heading.querySelector(".section-help")) return;
      const details = document.createElement("details"); details.className = "section-help";
      const summary = document.createElement("summary"); summary.textContent = "!";
      const panel = document.createElement("span"); panel.textContent = hint;
      Object.assign(details.style, { position: "relative", display: "inline-block", marginLeft: "8px", verticalAlign: "middle" });
      Object.assign(summary.style, { cursor: "pointer", listStyle: "none", border: "1px solid #67e8f9", borderRadius: "999px", color: "#a5f3fc", fontSize: "12px", padding: "1px 7px" });
      Object.assign(panel.style, { position: "absolute", left: "0", top: "30px", zIndex: "40", width: "260px", padding: "10px", borderRadius: "12px", background: "#0b1220", border: "1px solid rgba(255,255,255,.15)", color: "#e2e8f0", fontSize: "12px", lineHeight: "18px", fontWeight: "400" });
      details.append(summary, panel); heading.append(details);
    });
    const duplicatedHints = ["Это поведение в сессиях, а не психологический диагноз.", "Опыт обучения не тратится и не повышает ранг автоматически", "Покупки не влияют на итоговые метрики, ответы или обязательное обучение.", "Здесь сохраняются все переговоры и все начатые курсы."];
    document.querySelectorAll("#profile-page p").forEach((paragraph) => { if (duplicatedHints.some((text) => paragraph.textContent?.includes(text))) paragraph.style.display = "none"; });
    const closeHints = (event) => document.querySelectorAll("#profile-page .section-help[open]").forEach((details) => { if (!details.contains(event.target)) details.removeAttribute("open"); });
    document.addEventListener("click", closeHints);
    return () => document.removeEventListener("click", closeHints);
  }, [profile]);
  if (!profile) return <div className="text-slate-400">Загружаем кабинет…</div>;
  const last = profile.metrics_chart?.at(-1);
  const initials = profile.username.slice(0, 2).toUpperCase();
  const memberSince = profile.member_since ? new Date(`${profile.member_since}T00:00:00`).toLocaleDateString("ru-RU") : "сегодня";
  const shopCategories = [...new Set((profile.cosmetics?.catalog || []).map((item) => item.category_name))];

  async function purchase(item) { setBusy(item.code); try { await api(`/api/profile/purchases/${item.code}`, { method: "POST" }); await refresh(); await load(); } catch (error) { alert(error.message); } finally { setBusy(""); } }
  async function equip(item) { setBusy(item.code); try { await api("/api/profile/equipment", { method: "PUT", body: { item_code: item.code } }); await load(); } catch (error) { alert(error.message); } finally { setBusy(""); } }
  async function startDaily() { setBusy("daily"); try { const session = await api("/api/daily-challenge/start", { method: "POST" }); nav(`/play/${session.id}`); } catch (error) { alert(error.message); } finally { setBusy(""); } }

  return <div id="profile-page" className={`profile-theme-${profile.cosmetics?.profile_theme || "theme_arena"} mx-auto max-w-7xl space-y-6`}>
    <section className="glass overflow-hidden rounded-3xl p-6 md:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-5"><button title="Изменить аватар в магазине" onClick={() => document.getElementById("profile-shop")?.scrollIntoView({ behavior: "smooth" })} className="profile-avatar">{initials}<span>{profile.rank}</span></button><div><div className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</div><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">{profile.username}</h1><p className="mt-1 text-cyan-200">Ранг {profile.rank} · {profile.rank_name}</p><p className="mt-2 text-sm text-slate-400">Участник с {memberSince}</p><p className="text-sm text-slate-400">Серия активности: {profile.current_streak} дн.</p></div></div><div className="grid grid-cols-2 gap-3 text-center"><Stat value={`★ ${profile.stars}`} label="Валюта" /><Stat value={profile.xp} label="Опыт обучения" /></div></div></section>

    <div className="grid gap-6 lg:grid-cols-12"><section className="glass rounded-3xl p-6 lg:col-span-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">СЛЕДУЮЩАЯ ВЕХА</div><h2 className="mt-1 text-2xl font-bold">{profile.next_rank_name ? `До ранга «${profile.next_rank_name}»` : "Максимальный ранг достигнут"}</h2></div><div className="text-right"><b className="text-2xl text-cyan-200">{profile.rank_progress}%</b><div className="text-xs text-slate-400">визуальный прогресс</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${profile.rank_progress}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(profile.rank_requirements || []).map((item) => <button key={item.label} onClick={() => !item.done && nav(CTA[item.cta] || "/setup")} className={`rank-requirement ${item.done ? "done" : ""}`}><span>{item.done ? "✓" : "◐"}</span><div><b>{item.label}</b><small>{item.value}</small></div>{!item.done && <em>{item.cta} →</em>}</button>)}</div></section>
      <section className="glass rounded-3xl p-6 lg:col-span-4"><div className="eyebrow">ИСПЫТАНИЕ ДНЯ</div><h2 className="mt-1 text-xl font-bold">Короткая практика</h2><p className="mt-3 text-sm text-slate-400">Высокая сложность · ~{profile.daily_challenge?.minutes || 3} мин · награда ★ {profile.daily_challenge?.reward || 2}</p><button disabled={busy === "daily"} onClick={startDaily} className="primary-button mt-5 w-full">{profile.daily_challenge?.completed ? "Пройти ещё раз без награды" : "Начать испытание"}</button><p className="mt-3 text-xs text-slate-500">Стрик засчитывает завершённые сессии и уроки. Заморозок: {profile.streak_freezes}.</p></section>
      <section className="glass rounded-3xl p-6 lg:col-span-7"><div><div className="eyebrow">ПРОФИЛЬ НАВЫКОВ</div><h2 className="mt-1 text-xl font-bold">Как вы ведёте переговоры</h2></div><p className="mt-3 text-slate-300">Преобладающий стиль поведения: <b>{profile.profile || "пока недостаточно данных"}</b>. Это поведение в сессиях, а не психологический диагноз.</p><div className="mt-5 grid grid-cols-3 gap-3"><Mini label="Сессии" value={profile.sessions_total} /><Mini label="Роли" value={profile.unique_roles?.length || 0} /><Mini label="Сценарии" value={profile.unique_scenarios?.length || 0} /></div>{last && <div className="mt-6"><MetricsBar metrics={last} /></div>}</section>
      <section className="glass rounded-3xl p-6 lg:col-span-5"><div className="eyebrow">ОБУЧЕНИЕ</div><h2 className="mt-1 text-xl font-bold">Освоение дерева навыков</h2><div className="mt-5 flex items-end justify-between"><b className="text-4xl text-violet-200">{profile.learning_percent}%</b><span className="text-sm text-slate-400">Опыт обучения не тратится и не повышает ранг автоматически</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${profile.learning_percent}%` }} /></div><button onClick={() => nav("/training/tree")} className="subtle-button mt-5">Продолжить обучение</button></section></div>

    <section className="glass rounded-3xl p-6"><div className="eyebrow">ДОСТИЖЕНИЯ</div><h2 className="mt-1 text-xl font-bold">Заработано: {profile.achievement_details?.length || 0}</h2><div className="mt-4 flex flex-wrap gap-2">{(profile.achievement_details || []).map((item) => <span key={item.code} className="rounded-full border border-cyan-400/30 px-3 py-2 text-sm">★ {item.name}</span>)}{!profile.achievement_details?.length && <span className="text-sm text-slate-500">Первое достижение появится после завершения переговоров.</span>}</div></section>

    <div className="grid gap-6 lg:grid-cols-12"><section id="profile-shop" className="glass rounded-3xl p-6 lg:col-span-8"><div className="eyebrow">МАГАЗИН ★</div><h2 className="mt-1 text-xl font-bold">Оформление и тренировочные возможности</h2><p className="mt-2 text-sm text-slate-400">Покупки не влияют на итоговые метрики, ответы или обязательное обучение.</p><div className="mt-4 flex flex-wrap gap-2">{shopCategories.map((category) => <button key={category} onClick={() => setShopCategory((current) => current === category ? null : category)} className={`rounded-full px-3 py-1 text-sm ${shopCategory === category ? "bg-cyan-400/20 text-cyan-100" : "bg-white/5 text-slate-400"}`}>{category}</button>)}</div>{shopCategory ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{profile.cosmetics?.catalog.filter((item) => item.category_name === shopCategory).map((item) => { const owned = profile.cosmetics.owned.includes(item.code); const equipped = [profile.cosmetics.avatar_code, profile.cosmetics.frame_code, profile.cosmetics.profile_theme].includes(item.code); const requirements = Object.values(item.requirements || {}); return <div key={item.code} className="rounded-2xl border border-white/10 p-4"><b>{item.name}</b><p className="mt-1 text-sm text-yellow-300">{item.cost ? `★ ${item.cost}` : "Награда за развитие"}</p>{requirements.length > 0 && <p className="mt-1 text-xs text-slate-500">Есть условия получения</p>}<button disabled={busy === item.code} onClick={() => owned ? equip(item) : purchase(item)} className="subtle-button mt-3 text-sm">{equipped ? "Выбрано" : owned ? "Использовать" : item.cost ? "Получить" : "Открыть"}</button></div>; })}</div> : <p className="mt-5 text-sm text-slate-500">Выберите категорию, чтобы посмотреть предметы.</p>}</section><section className="glass rounded-3xl p-6 lg:col-span-4"><div className="eyebrow">ИСТОРИЯ ★</div><h2 className="mt-1 text-xl font-bold">Последние операции</h2><div className="mt-4 space-y-3">{(profile.star_transactions || []).map((item, index) => <div className="flex items-start justify-between gap-3 text-sm" key={`${item.created_at}-${index}`}><span className="text-slate-300">{item.description}</span><b className={item.amount > 0 ? "text-emerald-300" : "text-rose-300"}>{item.amount > 0 ? "+" : ""}{item.amount}★</b></div>)}{!profile.star_transactions?.length && <p className="text-sm text-slate-500">После первой завершённой сессии здесь появится объяснение награды.</p>}</div></section></div>
    <section className="glass rounded-3xl p-6"><History /></section>
  </div>;
}

function Stat({ value, label }) { return <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><b className="block text-lg text-cyan-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Mini({ value, label }) { return <div className="rounded-2xl bg-white/5 p-3"><b className="block text-2xl">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Info({ text }) { return <details className="relative inline-block text-sm font-normal"><summary className="cursor-pointer list-none rounded-full border border-cyan-300/50 px-2 py-0.5 text-xs text-cyan-200">!</summary><span className="absolute left-0 top-8 z-30 w-64 rounded-xl border border-white/15 bg-slate-950 p-3 text-xs leading-5 text-slate-200 shadow-xl">{text}</span></details>; }
