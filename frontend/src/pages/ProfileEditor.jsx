import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiForm } from "../api.js";
import { useAuth } from "../auth.jsx";
import { CosmeticItemArt, ProfilePreview, cosmeticCategories } from "../components/cosmetics/CosmeticVisual.jsx";

const fields = { avatar: "avatar_code", frame: "frame_code", status: "status_code", theme: "profile_theme", badge: "badge_code" };
const categoryNames = Object.fromEntries(cosmeticCategories);

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

export default function ProfileEditor() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const category = categoryNames[params.get("category")] ? params.get("category") : "avatar";
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const uploadInput = useRef(null);
  const load = useCallback(async () => { setData(await api("/api/me/cosmetics")); setError(""); }, []);

  useEffect(() => { load().catch((cause) => setError(cause.message)); }, [load]);
  const owned = (data?.items || []).filter((item) => item.category === category && item.is_active);
  const equippedCode = data?.equipment?.[fields[category]] || null;
  const optional = category === "badge" || category === "status";

  async function apply(itemCode, name) {
    if (busy || itemCode === equippedCode) return;
    setBusy(itemCode || "none"); setError(""); setMessage("");
    try {
      const equipment = await api("/api/me/cosmetics/equip", { method: "PUT", body: { category, item_code: itemCode } });
      setData((current) => ({ ...current, equipment }));
      setMessage(itemCode ? `${name} — теперь в профиле.` : `${category === "badge" ? "Значок" : "Статус"} снят с профиля.`);
      await load().catch(() => {});
      await refresh().catch(() => {});
      window.dispatchEvent(new Event("arena:cosmetics-changed"));
    } catch (cause) { setError(cause.message || "Не удалось изменить оформление. Попробуйте ещё раз."); }
    finally { setBusy(""); }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("upload"); setError(""); setMessage("");
    let uploaded = false;
    try {
      const blob = await preparePhoto(file);
      const form = new FormData(); form.append("file", blob, "avatar.png");
      await apiForm("/api/me/avatar", form);
      uploaded = true;
      window.dispatchEvent(new Event("arena:cosmetics-changed"));
      const equipment = await api("/api/me/cosmetics/equip", { method: "PUT", body: { category: "avatar", item_code: "avatar_custom" } });
      setData((current) => ({ ...current, equipment }));
      await load().catch(() => {});
      await refresh().catch(() => {});
      setMessage("Фото загружено и установлено в профиле.");
    } catch (cause) {
      if (uploaded) await load().catch(() => {});
      setError(uploaded ? "Фото сохранено, но не применилось. Нажмите на карточку «Моё фото», чтобы выбрать его." : /Method Not Allowed/i.test(cause.message) ? "Сервер запущен без маршрута загрузки фото. Перезапустите backend приложения и попробуйте ещё раз." : cause.message || "Не удалось загрузить фото.");
    } finally { setBusy(""); }
  }

  if (!data && !error) return <div className="cosmetic-loading" role="status"><div className="cosmetic-skeleton" /><span>Загружаем ваше оформление…</span></div>;
  if (!data) return <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => load().catch((cause) => setError(cause.message))}>Повторить</button></div>;

  return <section className="cosmetic-page cosmetic-editor-page">
    <header className="cosmetic-editor-header"><div><h1>Моё оформление</h1><p>Нажмите на предмет, чтобы сразу применить его в профиле.</p></div><div className="cosmetic-editor-links"><button type="button" onClick={() => nav("/shop")}>В магазин →</button></div></header>
    <ProfilePreview equipment={data.equipment} username={data.username} level={data.level} stars={data.stars} userId={data.user_id} />
    {message && <p className="cosmetic-editor-message" role="status">{message}</p>}
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>Закрыть</button></div>}
    <div className="cosmetic-tabs" role="group" aria-label="Что изменить">{cosmeticCategories.map(([code, title]) => <button key={code} type="button" aria-pressed={category === code} onClick={() => { setParams({ category: code }); setError(""); setMessage(""); }}>{title}</button>)}</div>
    <div className="cosmetic-editor-section-head"><div><h2>{categoryNames[category]}</h2><p>Выбрано: {owned.find((item) => item.code === equippedCode)?.name || (optional ? "без оформления" : "базовый вариант")}</p></div></div>
    {category === "avatar" && <div className="cosmetic-upload"><div><strong>Своё фото</strong><p>JPG, PNG или WebP до 8 МБ. Фото обрежется по центру и сразу появится в профиле.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => uploadInput.current?.click()}>{busy === "upload" ? "Загружаем…" : data.has_custom_avatar ? "Заменить фото" : "Загрузить фото"}</button><input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadPhoto} /></div>}
    {owned.length || optional ? <div className="cosmetic-grid cosmetic-editor-grid">{optional && <button type="button" className={`cosmetic-card cosmetic-editor-card${!equippedCode ? " is-current" : ""}`} disabled={Boolean(busy)} aria-pressed={!equippedCode} onClick={() => apply(null, "")}><span className="cosmetic-card-art"><span className="cosmetic-none-art">—</span></span><strong>Без {category === "badge" ? "значка" : "статуса"}</strong><span className="cosmetic-card-state">{!equippedCode ? "Используется" : "Убрать"}</span></button>}{owned.map((item) => <button key={item.code} type="button" className={`cosmetic-card cosmetic-editor-card${equippedCode === item.code ? " is-current" : ""}`} disabled={Boolean(busy)} aria-pressed={equippedCode === item.code} onClick={() => apply(item.code, item.name)}><span className="cosmetic-card-art"><CosmeticItemArt item={item} equipment={data.equipment} userId={data.user_id} /></span><strong>{item.name}</strong><span className="cosmetic-card-state">{busy === item.code ? "Применяем…" : equippedCode === item.code ? "Используется" : "Выбрать"}</span></button>)}</div> : <div className="cosmetic-empty"><p>Пока нет купленных предметов этой категории. Их можно посмотреть в магазине.</p></div>}
  </section>;
}
