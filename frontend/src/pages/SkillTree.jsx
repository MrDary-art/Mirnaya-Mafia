import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import TreeCanvas from "../components/training/TreeCanvas.jsx";
import TreeDetails from "../components/training/TreeDetails.jsx";
import { branchFor, readTreeNavigation, recommendedNode, saveTreeNavigation, treeUrl } from "../components/training/treeNavigation.js";

export default function SkillTree() {
  const location = useLocation(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [navigation, setNavigation] = useState(() => readTreeNavigation(location.search));
  useEffect(() => { api("/api/training/tree").then((payload) => { const requested = readTreeNavigation(location.search); const base = requested.nodeId ? payload.nodes.find((node) => node.id === requested.nodeId) : requested.skillId ? payload.nodes.find((node) => node.id === requested.skillId) : requested.professionId ? payload.nodes.find((node) => node.id === requested.professionId) : recommendedNode(payload.nodes); const next = requested.professionId ? requested : branchFor(payload.nodes, base?.id); setNavigation(next); saveTreeNavigation(next); setData(payload); }).catch((error) => setData({ error: error.message })); }, [location.search]);
  const selected = useMemo(() => data?.nodes?.find((node) => node.id === (navigation.nodeId || navigation.skillId || navigation.professionId)), [data, navigation]);
  const current = useMemo(() => data?.nodes?.find((node) => node.type === "training" && node.state === "available"), [data]);
  function select(id) { const next = branchFor(data.nodes, id); setNavigation(next); saveTreeNavigation(next); navigate(treeUrl(next)); }
  if (!data) return <div className="text-slate-400">Загружаем карту навыков…</div>;
  if (data.error) return <div className="glass rounded-3xl p-6 text-rose-200">Не удалось загрузить дерево: {data.error}</div>;
  const crumbs = [{ title: "Путь переговорщика", id: null }]; if (navigation.professionId) crumbs.push({ title: data.nodes.find((node) => node.id === navigation.professionId)?.title, id: navigation.professionId }); if (navigation.skillId) crumbs.push({ title: data.nodes.find((node) => node.id === navigation.skillId)?.title, id: navigation.skillId });
  return <div className="learning-tree-page"><header className="tree-header glass"><div><div className="eyebrow">AI TRAINING</div><nav aria-label="Навигация по дереву" className="tree-crumbs">{crumbs.map((crumb, index) => <span key={crumb.id || "root"}>{index > 0 && <i>›</i>}<button onClick={() => crumb.id ? select(crumb.id) : select("root")}>{crumb.title}</button></span>)}</nav></div><div className="tree-player"><span className="tree-avatar">✦</span><div><b>LVL {data.level}</b><small>{data.xp} XP · ★ {data.stars}</small></div></div></header><div className="tree-layout"><TreeCanvas nodes={data.nodes} focus={navigation.skillId || navigation.professionId || null} selectedId={selected?.id} currentId={current?.id} onSelect={select}/><TreeDetails nodes={data.nodes} selected={selected} onStart={(node) => navigate(`/training/node/${node.id}`, { state: { returnTo: treeUrl(branchFor(data.nodes, node.id)) } })} onBack={() => selected?.parent_id ? select(selected.parent_id) : select("root")}/></div></div>;
}
