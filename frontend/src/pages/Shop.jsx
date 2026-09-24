import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Icon from "../components/Icon.jsx";

export default function Shop() {
  const [profile, setProfile] = useState(null);
  const [category, setCategory] = useState(null);
  const [busy, setBusy] = useState("");
  const { refresh } = useAuth();
  const load = () => api("/api/profile").then(setProfile);

  useEffect(() => { load().catch((error) => alert(error.message)); }, []);

  async function purchase(item) {
    setBusy(item.code);
    try {
      await api(`/api/profile/purchases/${item.code}`, { method: "POST" });
      await refresh();
      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function equip(item) {
    setBusy(item.code);
    try {
      await api("/api/profile/equipment", { method: "PUT", body: { item_code: item.code } });
      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  if (!profile) return <div className="text-slate-400">Загружаем магазин…</div>;
  const categories = [...new Set((profile.cosmetics?.catalog || []).map((item) => item.category_name))];
  const items = category ? profile.cosmetics?.catalog.filter((item) => item.category_name === category) : [];

  return <section className="glass rounded-3xl p-6 md:p-8">
    <div className="eyebrow ui-icon-label">МАГАЗИН <Icon name="shopping-bag" size={15} /></div>
    <h1 className="mt-1 text-3xl font-extrabold">Оформление и тренировочные возможности <Info /></h1>
    <p className="mt-2 text-sm text-slate-400">Покупки не влияют на итоговые метрики, ответы или обязательное обучение.</p>
    <div className="mt-5 flex flex-wrap gap-2">
      {categories.map((itemCategory) => <button key={itemCategory} onClick={() => setCategory((current) => current === itemCategory ? null : itemCategory)} className={`rounded-full px-3 py-1 text-sm ${category === itemCategory ? "bg-cyan-400/20 text-cyan-100" : "bg-white/5 text-slate-400"}`}>{itemCategory}</button>)}
    </div>
    {category ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const owned = profile.cosmetics.owned.includes(item.code);
        const equipped = [profile.cosmetics.avatar_code, profile.cosmetics.frame_code, profile.cosmetics.profile_theme].includes(item.code);
        const requirements = Object.values(item.requirements || {});
        return <div key={item.code} className="rounded-2xl border border-white/10 p-4"><b>{item.name}</b><p className="mt-1 text-sm text-yellow-300">{item.cost ? <span className="ui-icon-label"><Icon name="star" size={15} />{item.cost}</span> : "Награда за развитие"}</p>{requirements.length > 0 && <p className="mt-1 text-xs text-slate-500">Есть условия получения</p>}<button disabled={busy === item.code} onClick={() => owned ? equip(item) : purchase(item)} className="subtle-button mt-3 text-sm">{equipped ? "Выбрано" : owned ? "Использовать" : item.cost ? "Получить" : "Открыть"}</button></div>;
      })}
    </div> : <p className="mt-5 text-sm text-slate-500">Выберите категорию, чтобы посмотреть предметы.</p>}
  </section>;
}

function Info() {
  return <details className="section-help relative ml-2 inline-block align-middle text-sm font-normal"><summary className="cursor-pointer list-none rounded-full border border-cyan-300/50 px-2 py-0.5 text-xs text-cyan-200"><Icon name="info" size={14} label="О магазине" /></summary><span className="absolute left-0 top-8 z-30 w-64 rounded-xl border border-white/15 bg-slate-950 p-3 text-xs leading-5 text-slate-200 shadow-xl">Звёзды дают за качественную практику. Покупки не меняют метрики, ответы, ранг или исход переговоров.</span></details>;
}
