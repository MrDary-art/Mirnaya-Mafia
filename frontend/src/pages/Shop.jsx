import PageHeader from "../design/PageHeader.jsx";
import Icon, { StarAmount, formatStarAmount } from "../components/Icon.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, apiForm } from "../api.js";
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

async function preparePhoto(file) {
  if (!file.type.startsWith("image/") || file.size > 8_000_000) throw new Error("Выберите изображение размером до 8 МБ.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("Не удалось открыть изображение. Попробуйте JPG, PNG или WebP."); }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const edge = Math.min(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 512, 512);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size > 2_000_000) throw new Error("Не удалось подготовить фото. Попробуйте другое изображение.");
    return blob;
  } finally { bitmap.close(); }
}

function ShopCard({ item, equipment, userId, stars, onClick }) {
  const unavailable = !item.is_active || Boolean(item.lock_reason);
  const priced = !item.owned && !unavailable && item.cost > 0;
  const missing = !item.owned && !item.lock_reason && item.cost > stars;
  const label = item.owned ? "Куплено" : unavailable ? "Пока недоступно" : item.cost ? formatStarAmount(item.cost) : "Бесплатно";
  const hint = item.owned ? item.equipped ? "Используется" : "Применить →" : item.lock_reason || (missing ? `Недостающая сумма: ${formatStarAmount(item.cost - stars)}` : "Посмотреть и купить →");
  return <button type="button" className={`cosmetic-card cosmetic-shop-card${item.owned ? " is-owned" : ""}`} onClick={onClick} aria-label={`${item.name}. ${label}. ${hint}`}>
    <span className="cosmetic-card-art"><CosmeticItemArt item={item} equipment={equipment} userId={userId} /></span>
    <span className={`cosmetic-shop-card-label${item.owned ? " is-owned" : ""}`}>{priced ? <StarAmount value={item.cost} /> : label}</span>
    <strong>{item.name}</strong><span className="cosmetic-shop-card-hint">{missing ? <>Не хватает <StarAmount value={item.cost - stars} /></> : hint}</span>
  </button>;
}

export default function Shop() {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [category, setCategory] = useState("avatar");
  const [selectedCode, setSelectedCode] = useState(null);
  const [purchasedCode, setPurchasedCode] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const closeButton = useRef(null);
  const returnFocus = useRef(null);
  const uploadInput = useRef(null);
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
  const owned = items.filter((item) => item.owned);
  const unowned = items.filter((item) => !item.owned);
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

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("upload"); setActionError(""); setMessage("");
    try {
      const blob = await preparePhoto(file);
      const form = new FormData(); form.append("file", blob, "avatar.png");
      await apiForm("/api/me/avatar", form);
      await api("/api/me/cosmetics/equip", { method: "PUT", body: { category: "avatar", item_code: "avatar_custom" } });
      await load();
      await refresh().catch(() => {});
      setMessage("Фото загружено и установлено в профиле.");
      window.dispatchEvent(new Event("arena:cosmetics-changed"));
    } catch (cause) { setActionError(cause.message || "Не удалось загрузить фото."); }
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
    <PageHeader eyebrow="Профиль" title="Оформление" description="Выбирайте купленные предметы и находите новые в одном месте." aside={<div className="ui-wallet"><span>Ваши звёзды</span><strong><StarAmount value={data.stars} /></strong><small>Списание только после подтверждения покупки.</small></div>} />
    <ProfilePreview equipment={data.equipment} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} />
    {message && <p className="cosmetic-editor-message" role="status">{message}</p>}
    {actionError && !selected && <div className="product-error" role="alert"><p>{actionError}</p><button type="button" onClick={() => setActionError("")}>Закрыть</button></div>}

    <div className="cosmetic-tabs" role="group" aria-label="Категории магазина">{cosmeticCategories.map(([code, title]) => <button key={code} type="button" aria-pressed={category === code} onClick={() => { setCategory(code); setSelectedCode(null); }}>{title}</button>)}</div>
    {category === "avatar" && <div className="cosmetic-upload"><div><strong>Своё фото</strong><p>JPG, PNG или WebP до 8 МБ. Фото обрежется по центру и сразу появится в профиле.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => uploadInput.current?.click()}>{busy === "upload" ? "Загружаем…" : data.has_custom_avatar ? "Заменить фото" : "Загрузить фото"}</button><input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadPhoto} /></div>}
    {(owned.length > 0 || optional) && <section className="cosmetic-shop-group" aria-labelledby="cosmetic-owned-title"><div className="cosmetic-results-head"><h2 id="cosmetic-owned-title">Мои предметы</h2><span>{owned.length}</span></div><p>Нажмите на предмет, чтобы сразу применить его в профиле.</p><div className="cosmetic-grid">{optional && <button type="button" className={`cosmetic-card cosmetic-editor-card${!equippedCode ? " is-current" : ""}`} disabled={Boolean(busy)} aria-pressed={!equippedCode} onClick={() => apply(null, "")}><span className="cosmetic-card-art"><span className="cosmetic-none-art">—</span></span><strong>Без {category === "badge" ? "значка" : "статуса"}</strong><span className="cosmetic-card-state">{!equippedCode ? "Используется" : "Убрать"}</span></button>}{owned.map((item) => <ShopCard key={item.code} item={item} equipment={data.equipment} userId={data.user_id} stars={data.stars} onClick={(event) => openItem(item, event)} />)}</div></section>}
    <section className="cosmetic-shop-group" aria-labelledby="cosmetic-other-title"><div className="cosmetic-results-head"><h2 id="cosmetic-other-title">В магазине</h2><span>{unowned.length}</span></div><p>На карточке указана цена или причина, по которой предмет пока недоступен.</p>{unowned.length ? <div className="cosmetic-grid">{unowned.map((item) => <ShopCard key={item.code} item={item} equipment={data.equipment} userId={data.user_id} stars={data.stars} onClick={(event) => openItem(item, event)} />)}</div> : <div className="cosmetic-empty"><p>Все предметы этой категории уже у вас.</p></div>}</section>

    {selected && createPortal(<div className="cosmetic-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}><section className="cosmetic-dialog" role="dialog" aria-modal="true" aria-labelledby="cosmetic-detail-title"><button ref={closeButton} type="button" className="cosmetic-dialog-close" onClick={closeDetail} aria-label="Закрыть"><Icon name="x" size={19} /></button><div className="eyebrow">{categoryNames[selected.category]}</div><h2 id="cosmetic-detail-title">{selected.name}</h2><ProfilePreview equipment={{ ...data.equipment, [fields[selected.category]]: selected.code }} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} isPreview compact /><p className="cosmetic-detail-description">{descriptions[selected.category]}</p><div className="cosmetic-detail-meta"><span>Цена: {selected.cost ? <StarAmount value={selected.cost} /> : selected.unlock_type === "achievement" ? "за достижение" : selected.unlock_type === "progression" ? "за прогресс" : "бесплатно"}</span><span>Ваш баланс: <StarAmount value={data.stars} /></span></div>{selected.lock_reason && !selected.owned && <p className="cosmetic-lock">{selected.lock_reason}</p>}{actionError && <p className="cosmetic-action-error" role="alert">{actionError}</p>}
      <div className="cosmetic-detail-actions">{purchasedCode === selected.code || selected.owned ? <><p role="status">Предмет уже ваш.</p><button type="button" disabled={Boolean(busy)} onClick={() => apply(selected.code, selected.name, selected.category)}>Применить</button></> : !selected.is_active ? <span>Предмет недоступен</span> : selected.lock_reason ? <span>Сначала выполните условие получения</span> : selected.cost > data.stars ? <span>Не хватает <StarAmount value={selected.cost - data.stars} /></span> : <button type="button" disabled={Boolean(busy)} onClick={() => purchase(selected)}>{busy === "purchase" ? "Покупаем…" : selected.cost ? <>Купить за <StarAmount value={selected.cost} /></> : "Получить бесплатно"}</button>}</div>
    </section></div>, document.body)}
  </section>;
}
