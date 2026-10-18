import { useSearchParams } from "react-router-dom";
export function useWorkspaceTab(key, initial, allowed) {
  const [params, setParams] = useSearchParams();
  const selected = params.get(key);
  const value = allowed.includes(selected) ? selected : initial;
  const change = next => setParams(current => { const query = new URLSearchParams(current); query.set(key, next); if (key === "view") for (const detail of ["assignment", "target", "attempt", "meeting", "action", "record", "person"]) query.delete(detail); return query; });
  return [value, change];
}
export function WorkspaceTabs({ items, value, onChange, label }) {
  return <nav className="business-workspace-tabs" aria-label={label}>{items.map(([id, title]) => <button key={id} type="button" className={id === value ? "is-active" : ""} aria-current={id === value ? "page" : undefined} onClick={() => onChange(id)}>{title}</button>)}</nav>;
}
