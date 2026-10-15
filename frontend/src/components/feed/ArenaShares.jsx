import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { StoryIcon } from "../features/stories/StoryPrimitives.jsx";
import "./collections.css";

// Deduplicate concurrent checks without caching permission decisions after a request.
const pending = new Map();
function catalog(userId, kind) {
  const key = `${userId}:${kind}`;
  if (!pending.has(key)) pending.set(key, api(`/api/social/attachments?kind=${kind}`).finally(() => pending.delete(key)));
  return pending.get(key);
}
const pathFor = item => `/feed?attach=${encodeURIComponent(item.kind)}&id=${encodeURIComponent(item.id)}`;
function useMaterials(kind) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => catalog(user?.id, kind).then(result => { if (alive) setItems(result.items); }).catch(() => { if (alive) setItems([]); });
    load(); window.addEventListener("focus", load);
    return () => { alive = false; window.removeEventListener("focus", load); };
  }, [user?.id, kind]);
  return items;
}
export function ArenaShareEntry({ kind, contentId, code, children = "Поделиться в ленте" }) {
  const item = useMaterials(kind).find(material => contentId != null ? String(material.id) === String(contentId) : material.code === code);
  return item ? <Link className="arena-collection-button" to={pathFor(item)}><StoryIcon name="share" size={18} />{children}</Link> : null;
}
export function ArenaSharePanel({ kind, title }) {
  const items = useMaterials(kind);
  if (!items.length) return null;
  return <section className="arena-material-shares"><h2>{title}</h2><p>Выберите материал и добавьте свой комментарий. Публикация появится только после вашего подтверждения.</p><div>{items.map(item => <Link key={item.id} className="arena-collection-button" to={pathFor(item)}><StoryIcon name="share" size={18} />{item.title}</Link>)}</div></section>;
}

export function CertificatePublicationPolicy({ company, canManage, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [allowed, setAllowed] = useState(company.settings?.allow_public_certificates === true);
  useEffect(() => setAllowed(company.settings?.allow_public_certificates === true), [company.id, company.settings?.allow_public_certificates]);
  async function change(checked) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const fresh = await api(`/api/company/context?company_id=${company.id}`);
      await api(`/api/company/${company.id}/settings`, { method: "PUT", body: { settings: { ...fresh.company.settings, allow_public_certificates: checked } } });
      setAllowed(checked); onSaved?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="arena-material-shares"><h2>Публикация сертификатов</h2><p>Сотрудник сможет по своему выбору поделиться фактом получения действующего сертификата и ссылкой проверки. Закрытые PDF и результаты заданий не включаются в пост.</p>{canManage ? <label className="arena-certificate-policy"><input type="checkbox" checked={allowed} disabled={busy} onChange={event => change(event.target.checked)} />Разрешить сотрудникам делиться своими сертификатами</label> : <p>{allowed ? "Компания разрешает делиться своими действующими сертификатами." : "Компания не разрешила публичную публикацию сертификатов."}</p>}{error && <p role="alert">{error}</p>}</section>;
}
