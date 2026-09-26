import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { CosmeticItemArt, ProfilePreview, cosmeticCategories } from "../components/cosmetics/CosmeticVisual.jsx";

const categoryNames = Object.fromEntries(cosmeticCategories);
const fields = { avatar: "avatar_code", frame: "frame_code", status: "status_code", theme: "profile_theme", badge: "badge_code" };
const descriptions = {
  avatar: "Этот аватар будет виден в профиле и рядом с вашим именем в комнатах.",
  frame: "Рамка появится вокруг аватара в профиле и карточках участников.",
  status: "Короткая подпись под именем в профиле. Это оформление, а не достижение.",
  theme: "Фон изменит только верхнюю карточку профиля.",
  badge: "Декоративный знак рядом с вашим именем в профиле.",
};

function ShopCard({ item, equipment, userId, stars, onClick }) {
  const unavailable = !item.is_active || Boolean(item.lock_reason);
  const label = item.owned ? "Куплено" : unavailable ? "Пока недоступно" : item.cost ? `${item.cost} ★` : "Бесплатно";
  const hint = item.owned ? item.equipped ? "Сейчас в профиле" : "Выбрать в профиле →" : item.lock_reason || (item.cost > stars ? `Не хватает ${item.cost - stars} ★` : "Посмотреть и купить →");
  return <button type="button" className={`cosmetic-card cosmetic-shop-card${item.owned ? " is-owned" : ""}`} onClick={onClick} aria-label={`${item.name}. ${label}. ${hint}`}>
    <span className="cosmetic-card-art"><CosmeticItemArt item={item} equipment={equipment} userId={userId} /></span>
    <span className={`cosmetic-shop-card-label${item.owned ? " is-owned" : ""}`}>{label}</span>
    <strong>{item.name}</strong><span className="cosmetic-shop-card-hint">{hint}</span>
  </button>;
}

export default function Shop() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [category, setCategory] = useState("avatar");
  const [selectedCode, setSelectedCode] = useState(null);
  const [purchasedCode, setPurchasedCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const closeButton = useRef(null);
  const returnFocus = useRef(null);
  const load = useCallback(async () => { setData(await api("/api/shop")); setLoadError(""); }, []);
  const editPath = (kind) => `/profile/edit?category=${kind}`;

  useEffect(() => { load().catch((cause) => setLoadError(cause.message)); }, [load]);
  useEffect(() => {
    if (!selectedCode) return undefined;
    closeButton.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") { setSelectedCode(null); if (returnFocus.current?.isConnected) returnFocus.current.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCode]);

  const selected = data?.items.find((item) => item.code === selectedCode);
  const items = useMemo(() => (data?.items || []).filter((item) => item.category === category), [data, category]);
  const owned = items.filter((item) => item.owned);
  const unowned = items.filter((item) => !item.owned);

  function closeDetail() { setSelectedCode(null); setPurchasedCode(null); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }
  function openItem(item, event) {
    if (item.owned) { nav(editPath(item.category)); return; }
    returnFocus.current = event.currentTarget;
    setSelectedCode(item.code); setPurchasedCode(null); setActionError("");
  }
  async function purchase(item) {
    if (busy) return;
    setBusy(true); setActionError("");
    try {
      const result = await api(`/api/shop/items/${item.code}/purchase`, { method: "POST" });
      setData((current) => ({ ...current, stars: result.new_balance, items: current.items.map((entry) => entry.code === item.code ? { ...entry, owned: true, equipped: false } : entry) }));
      setPurchasedCode(item.code);
      await load().catch(() => {});
      await refresh().catch(() => {});
      window.dispatchEvent(new Event("arena:cosmetics-changed"));
    } catch (cause) {
      setActionError(cause.message || "Не удалось подтвердить покупку. Проверьте баланс и купленные предметы перед повторной попыткой.");
      await load().catch(() => {});
    } finally { setBusy(false); }
  }

  if (!data && !loadError) return <div className="cosmetic-loading" role="status"><div className="cosmetic-skeleton" /><div className="cosmetic-skeleton-grid">{Array.from({ length: 6 }, (_, index) => <div className="cosmetic-skeleton" key={index} />)}</div><span>Загружаем магазин…</span></div>;
  if (!data) return <div className="product-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => load().catch((cause) => setLoadError(cause.message))}>Повторить загрузку</button></div>;

  return <section className="cosmetic-page cosmetic-shop-page">
    <header className="cosmetic-shop-hero"><div><div className="eyebrow">МАГАЗИН</div><h1>Оформление для вашего профиля</h1><p>Покупайте за звёзды. Купленное останется вашим и появится в редакторе профиля.</p><button type="button" className="cosmetic-secondary-link" onClick={() => nav("/profile/edit")}>Моё оформление →</button></div><div className="cosmetic-wallet"><span>Доступно</span><strong>★ {data.stars}</strong><small>Звёзды спишутся только после подтверждения покупки.</small></div></header>

    <div className="cosmetic-tabs" role="group" aria-label="Категории магазина">{cosmeticCategories.map(([code, title]) => <button key={code} type="button" aria-pressed={category === code} onClick={() => { setCategory(code); setSelectedCode(null); }}>{title}</button>)}</div>
    {owned.length > 0 && <section className="cosmetic-shop-group" aria-labelledby="cosmetic-owned-title"><div className="cosmetic-results-head"><h2 id="cosmetic-owned-title">Уже куплено</h2><span>{owned.length}</span></div><p>Нажмите на предмет, чтобы выбрать его в профиле.</p><div className="cosmetic-grid">{owned.map((item) => <ShopCard key={item.code} item={item} equipment={data.equipment} userId={data.user_id} stars={data.stars} onClick={(event) => openItem(item, event)} />)}</div></section>}
    <section className="cosmetic-shop-group" aria-labelledby="cosmetic-other-title"><div className="cosmetic-results-head"><h2 id="cosmetic-other-title">В магазине</h2><span>{unowned.length}</span></div><p>На карточке указана цена или причина, по которой предмет пока недоступен.</p>{unowned.length ? <div className="cosmetic-grid">{unowned.map((item) => <ShopCard key={item.code} item={item} equipment={data.equipment} userId={data.user_id} stars={data.stars} onClick={(event) => openItem(item, event)} />)}</div> : <div className="cosmetic-empty"><p>Все предметы этой категории уже у вас.</p></div>}</section>

    {selected && createPortal(<div className="cosmetic-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}><section className="cosmetic-dialog" role="dialog" aria-modal="true" aria-labelledby="cosmetic-detail-title"><button ref={closeButton} type="button" className="cosmetic-dialog-close" onClick={closeDetail} aria-label="Закрыть">×</button><div className="eyebrow">{categoryNames[selected.category]}</div><h2 id="cosmetic-detail-title">{selected.name}</h2><ProfilePreview equipment={{ ...data.equipment, [fields[selected.category]]: selected.code }} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} isPreview compact /><p className="cosmetic-detail-description">{descriptions[selected.category]}</p><div className="cosmetic-detail-meta"><span>Цена: {selected.cost ? `${selected.cost} ★` : selected.unlock_type === "achievement" ? "за достижение" : selected.unlock_type === "progression" ? "за прогресс" : "бесплатно"}</span><span>Ваш баланс: {data.stars} ★</span></div>{selected.lock_reason && !selected.owned && <p className="cosmetic-lock">{selected.lock_reason}</p>}{actionError && <p className="cosmetic-action-error" role="alert">{actionError}</p>}
      <div className="cosmetic-detail-actions">{purchasedCode === selected.code ? <><p role="status">Куплено — предмет доступен в редакторе профиля.</p><button type="button" onClick={() => nav(editPath(selected.category))}>Выбрать в профиле</button></> : selected.owned ? <button type="button" onClick={() => nav(editPath(selected.category))}>Выбрать в профиле</button> : !selected.is_active ? <span>Предмет недоступен</span> : selected.lock_reason ? <span>Сначала выполните условие получения</span> : selected.cost > data.stars ? <span>Не хватает {selected.cost - data.stars} ★</span> : <button type="button" disabled={busy} onClick={() => purchase(selected)}>{busy ? "Покупаем…" : selected.cost ? `Купить за ${selected.cost} ★` : "Получить бесплатно"}</button>}</div>
    </section></div>, document.body)}
  </section>;
}
