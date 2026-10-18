import Icon, { StarAmount, formatStarAmount } from "../components/Icon.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const priced = !item.owned && !unavailable && item.cost > 0;
  const missing = !item.owned && !item.lock_reason && item.cost > stars;
  const label = item.owned ? "Куплено" : unavailable ? "Пока недоступно" : item.cost ? formatStarAmount(item.cost) : "Бесплатно";
  const hint = item.owned ? item.equipped ? "Используется" : "Применить →" : item.lock_reason || (missing ? `Недостающая сумма: ${formatStarAmount(item.cost - stars)}` : "Посмотреть и купить →");
  return <button type="button" className={`cosmetic-card cosmetic-shop-card${item.owned ? " is-owned" : ""}${item.equipped ? " is-equipped" : ""}`} onClick={onClick} aria-pressed={item.equipped} aria-label={`${item.name}. ${label}. ${hint}`}>
    <span className="cosmetic-card-art"><CosmeticItemArt item={item} equipment={equipment} userId={userId} /></span>
    <span className="cosmetic-shop-card-copy"><span className={`cosmetic-shop-card-label${item.owned ? " is-owned" : ""}`}>{item.equipped ? "Используется" : priced ? <StarAmount value={item.cost} /> : label}</span><strong>{item.name}</strong><span className="cosmetic-shop-card-hint">{missing ? <>Не хватает <StarAmount value={item.cost - stars} /></> : hint}</span></span>
  </button>;
}

export default function Shop() {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [category, setCategory] = useState("avatar");
  const [shopView, setShopView] = useState("all");
  const [selectedCode, setSelectedCode] = useState(null);
  const [purchasedCode, setPurchasedCode] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const closeButton = useRef(null);
  const returnFocus = useRef(null);
  const load = useCallback(async () => { setData(await api("/api/shop")); setLoadError(""); }, []);

  useEffect(() => { load().catch((cause) => setLoadError(cause.message)); }, [load]);
  useEffect(() => {
    if (!selectedCode) return undefined;
    closeButton.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") { setSelectedCode(null); if (returnFocus.current?.isConnected) returnFocus.current.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCode]);

  const selected = data?.items.find((item) => item.code === selectedCode);
  const items = useMemo(() => (data?.items || []).filter((item) =>
    item.category === category && (category !== "avatar" || item.shop_visible !== false)), [data, category]);
  const visibleItems = useMemo(() => items
    .filter((item) => shopView === "all" || (shopView === "owned" ? item.owned : !item.owned && item.is_active && !item.lock_reason))
    .sort((left, right) => Number(right.equipped) - Number(left.equipped) || Number(right.owned) - Number(left.owned)), [items, shopView]);
  const equippedCode = data?.equipment?.[fields[category]] || null;
  const optional = category === "badge" || category === "status";

  function closeDetail() { setSelectedCode(null); setPurchasedCode(null); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }
  function openItem(item, event) {
    if (item.owned) { apply(item.code, item.name, item.category); return; }
    returnFocus.current = event.currentTarget;
    setSelectedCode(item.code); setPurchasedCode(null); setActionError("");
  }
  async function apply(itemCode, name, itemCategory = category) {
    if (busy || itemCode === data?.equipment?.[fields[itemCategory]]) return;
    setBusy(itemCode || "none"); setActionError(""); setMessage("");
    try {
      const equipment = await api("/api/me/cosmetics/equip", { method: "PUT", body: { category: itemCategory, item_code: itemCode } });
      setData((current) => ({ ...current, equipment, items: current.items.map((entry) => ({ ...entry, equipped: entry.category === itemCategory ? entry.code === itemCode : entry.equipped })) }));
      setMessage(itemCode ? `${name} — теперь в профиле.` : `${itemCategory === "badge" ? "Значок" : "Статус"} убран из профиля.`);
      closeDetail();
      await refresh().catch(() => {});
      window.dispatchEvent(new Event("arena:cosmetics-changed"));
    } catch (cause) { setActionError(cause.message || "Не удалось изменить оформление. Попробуйте ещё раз."); }
    finally { setBusy(""); }
  }

  async function purchase(item) {
    if (busy) return;
    setBusy("purchase"); setActionError(""); setMessage("");
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
    } finally { setBusy(""); }
  }

  if (!data && !loadError) return <div className="cosmetic-loading" role="status"><div className="cosmetic-skeleton" /><div className="cosmetic-skeleton-grid">{Array.from({ length: 6 }, (_, index) => <div className="cosmetic-skeleton" key={index} />)}</div><span>Загружаем магазин…</span></div>;
  if (!data) return <div className="product-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => load().catch((cause) => setLoadError(cause.message))}>Повторить загрузку</button></div>;

  return <section className="cosmetic-page cosmetic-shop-page">
    <ProfilePreview equipment={data.equipment} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} />
    {message && <p className="cosmetic-editor-message" role="status">{message}</p>}
    {actionError && !selected && <div className="product-error" role="alert"><p>{actionError}</p><button type="button" onClick={() => setActionError("")}>Закрыть</button></div>}

    <section className="cosmetic-storefront" aria-labelledby="cosmetic-storefront-title">
      <div className="cosmetic-storefront-controls"><div className="cosmetic-tabs" role="group" aria-label="Категории магазина">{cosmeticCategories.map(([code, title]) => <button key={code} type="button" aria-pressed={category === code} onClick={() => { setCategory(code); setShopView("all"); setSelectedCode(null); }}>{title}<span>{(data.items || []).filter((item) => item.category === code && (code !== "avatar" || item.shop_visible !== false)).length}</span></button>)}</div><div className="cosmetic-shop-filters" role="group" aria-label="Фильтр предметов">{[["all", "Все"], ["available", "Доступные"], ["owned", "Купленные"]].map(([code, label]) => <button key={code} type="button" aria-pressed={shopView === code} onClick={() => setShopView(code)}>{label}</button>)}</div></div>
      <div className="cosmetic-storefront-head"><div><h2 id="cosmetic-storefront-title">{categoryNames[category]}</h2><p>Купленные предметы можно применить одним нажатием.</p></div><span>{visibleItems.length} {visibleItems.length === 1 ? "предмет" : visibleItems.length > 1 && visibleItems.length < 5 ? "предмета" : "предметов"}</span></div>
      {visibleItems.length || (optional && shopView !== "available") ? <div className="cosmetic-grid cosmetic-storefront-grid">{optional && shopView !== "available" && <button type="button" className={`cosmetic-card cosmetic-editor-card cosmetic-shop-card${!equippedCode ? " is-equipped" : ""}`} disabled={Boolean(busy)} aria-pressed={!equippedCode} onClick={() => apply(null, "")}><span className="cosmetic-card-art"><span className="cosmetic-none-art">—</span></span><span className="cosmetic-shop-card-copy"><span className="cosmetic-shop-card-label is-owned">{!equippedCode ? "Используется" : "Доступно"}</span><strong>Без {category === "badge" ? "значка" : "статуса"}</strong><span className="cosmetic-shop-card-hint">{!equippedCode ? "Выбрано сейчас" : "Убрать оформление →"}</span></span></button>}{visibleItems.map((item) => <ShopCard key={item.code} item={item} equipment={data.equipment} userId={data.user_id} stars={data.stars} onClick={(event) => openItem(item, event)} />)}</div> : <div className="cosmetic-empty"><p>{shopView === "owned" ? "В этой категории пока нет купленных предметов." : "В этой категории пока нет доступных предметов."}</p></div>}
    </section>

    {selected && createPortal(<div className="cosmetic-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}><section className="cosmetic-dialog" role="dialog" aria-modal="true" aria-labelledby="cosmetic-detail-title"><button ref={closeButton} type="button" className="cosmetic-dialog-close" onClick={closeDetail} aria-label="Закрыть"><Icon name="x" size={19} /></button><div className="eyebrow">{categoryNames[selected.category]}</div><h2 id="cosmetic-detail-title">{selected.name}</h2><ProfilePreview equipment={{ ...data.equipment, [fields[selected.category]]: selected.code }} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} isPreview compact /><p className="cosmetic-detail-description">{descriptions[selected.category]}</p><div className="cosmetic-detail-meta"><span>Цена: {selected.cost ? <StarAmount value={selected.cost} /> : selected.unlock_type === "achievement" ? "за достижение" : selected.unlock_type === "progression" ? "за прогресс" : "бесплатно"}</span><span>Ваш баланс: <StarAmount value={data.stars} /></span></div>{selected.lock_reason && !selected.owned && <p className="cosmetic-lock">{selected.lock_reason}</p>}{actionError && <p className="cosmetic-action-error" role="alert">{actionError}</p>}
      <div className="cosmetic-detail-actions">{purchasedCode === selected.code || selected.owned ? <><p role="status">Предмет уже ваш.</p><button type="button" disabled={Boolean(busy)} onClick={() => apply(selected.code, selected.name, selected.category)}>Применить</button></> : !selected.is_active ? <span>Предмет недоступен</span> : selected.lock_reason ? <span>Сначала выполните условие получения</span> : selected.cost > data.stars ? <span>Не хватает <StarAmount value={selected.cost - data.stars} /></span> : <button type="button" disabled={Boolean(busy)} onClick={() => purchase(selected)}>{busy === "purchase" ? "Покупаем…" : selected.cost ? <>Купить за <StarAmount value={selected.cost} /></> : "Получить бесплатно"}</button>}</div>
    </section></div>, document.body)}
  </section>;
}
