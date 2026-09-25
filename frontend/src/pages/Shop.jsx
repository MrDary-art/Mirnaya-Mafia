import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Shop() {
  const [profile, setProfile] = useState(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { refresh } = useAuth();
  const load = useCallback(async () => setProfile(await api("/api/profile")), []);

  useEffect(() => { load().catch((failure) => setError(failure.message)); }, [load]);

  async function act(item, owned) {
    setBusy(item.code);
    setError("");
    try {
      if (owned) await api("/api/profile/equipment", { method: "PUT", body: { item_code: item.code } });
      else {
        await api(`/api/profile/purchases/${item.code}`, { method: "POST" });
        await refresh();
      }
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  if (!profile && !error) return <div className="product-loading" role="status">Загружаем коллекцию…</div>;
  if (!profile) return <div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => { setError(""); load().catch((failure) => setError(failure.message)); }}>Повторить загрузку</button></div>;

  const cosmetics = profile.cosmetics || {};
  const catalog = cosmetics.catalog || [];
  const categories = [...new Set(catalog.map((item) => item.category_name))];
  const selectedCategory = categories.includes(category) ? category : categories[0];
  const items = catalog.filter((item) => item.category_name === selectedCategory);

  return <section className="shop-page">
    <header className="shop-hero">
      <div className="shop-hero-copy">
        <div className="eyebrow">ЛИЧНОЕ / КОЛЛЕКЦИЯ</div>
        <h1>Коллекция возможностей</h1>
        <p>Оформление профиля и дополнительные возможности практики. Покупки не влияют на итоговые метрики, ответы или обязательное обучение.</p>
        <details className="shop-help"><summary>Как работает коллекция?</summary><p>★ дают за качественную практику. Покупки не меняют метрики, ранг или исход переговоров.</p></details>
      </div>
      <div className="shop-hero-art" aria-hidden="true"><span>ОБЪЕКТ / ЛИЧНАЯ КОЛЛЕКЦИЯ</span></div>
    </header>
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    <div className="shop-section-heading"><div><div className="eyebrow">КАТАЛОГ</div><h2>{selectedCategory || "Предметы"}</h2></div><span>{items.length} {items.length === 1 ? "предмет" : "предметов"}</span></div>
    <div className="shop-filters" role="group" aria-label="Категории коллекции">
      {categories.map((itemCategory) => <button key={itemCategory} type="button" aria-pressed={selectedCategory === itemCategory} onClick={() => setCategory(itemCategory)}>{itemCategory}</button>)}
    </div>
    {items.length ? <div className="shop-grid">{items.map((item) => {
      const owned = (cosmetics.owned || []).includes(item.code);
      const equipped = [cosmetics.avatar_code, cosmetics.frame_code, cosmetics.profile_theme].includes(item.code);
      const requirements = Object.values(item.requirements || {});
      return <article key={item.code} className="shop-item">
        <div className="shop-item-mark" aria-hidden="true">{item.category_name?.slice(0, 1)}</div>
        <div className="shop-item-meta">{owned ? "В коллекции" : item.cost ? `★ ${item.cost}` : "Награда за развитие"}</div>
        <h3>{item.name}</h3>
        {requirements.length > 0 && <p>Есть условия получения</p>}
        <button type="button" disabled={Boolean(busy) || equipped} onClick={() => act(item, owned)}>{busy === item.code ? "Сохраняем…" : equipped ? "Выбрано" : owned ? "Использовать" : item.cost ? "Получить" : "Открыть"}</button>
      </article>;
    })}</div> : <p className="product-empty">В этой категории пока нет предметов.</p>}
  </section>;
}
