import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { companyJobTitle, Empty, Loader, Notice } from "./shared.jsx";
import { buildEmployeeHierarchy, groupEmployeesByProfession, hierarchyVisibleIds, layoutReportingGraph } from "./hierarchy.js";
import "./hierarchy-map.css";

const MIN_MAP_SCALE = 0.25;
const MAX_MAP_SCALE = 2;
const clampMapScale = value => Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, value));

function PersonCard({ person, reports, collapsed, onToggle, dimmed = false }) {
  const isExecutive = ["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER", "DEPARTMENT_MANAGER", "TEAM_LEAD"].includes(person.role);
  const title = companyJobTitle(person) || "Должность не указана";
  const specialty = person.profession || person.specialization || "";
  const normalized = value => value?.trim().toLocaleLowerCase("ru");
  const hasDistinctSpecialty = Boolean(specialty) && normalized(specialty) !== normalized(title);
  const tags = [
    person.role_label,
    person.department,
  ].filter((value, index, values) => value && normalized(value) !== normalized(title) && normalized(value) !== normalized(specialty) && values.findIndex(item => normalized(item) === normalized(value)) === index);
  const name = person.name || person.username || "Сотрудник";
  return <article className={`business-hierarchy-person${isExecutive ? " is-company-owner" : ""}${dimmed ? " is-context" : ""}`}>
    <div className="business-hierarchy-person-main">
      <div className="business-hierarchy-person-copy">
        {isExecutive && <span className="business-hierarchy-owner-mark"><Icon name="star" size={12}/>РУКОВОДСТВО</span>}
        <h3 className="business-hierarchy-person-name">{name}</h3>
        <p className="business-hierarchy-person-title">{title}</p>
        {hasDistinctSpecialty && <p className="business-hierarchy-person-specialty">{specialty}</p>}
      </div>
      {reports > 0 && <button type="button" className="business-hierarchy-toggle" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "Показать" : "Скрыть"} ветку сотрудника ${person.name}`}>
        <Icon name="arrow-right" size={15} className={collapsed ? "" : "is-open"}/><span>{reports}</span>
      </button>}
    </div>
    {tags.length > 0 && <div className="business-hierarchy-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
  </article>;
}

export function CompanyHierarchy({ data, onReady }) {
  const companyId = data.company.id;
  const [people, setPeople] = useState([]), [departments, setDepartments] = useState([]);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (loaded || error) onReady?.(); }, [loaded, error, onReady]);
  const [mode, setMode] = useState("reporting"), [query, setQuery] = useState(""), [departmentId, setDepartmentId] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());
  const [mapView, setMapView] = useState({ x: 24, y: 24, scale: 1 });
  const [draggingMap, setDraggingMap] = useState(false);
  const [nodePositions, setNodePositions] = useState({});
  const nodeDrag = useRef(null);
  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem(`arena-company-map-v2-${companyId}`) || "{}"); setNodePositions(stored && typeof stored === "object" ? stored : {}); } catch { setNodePositions({}); }
  }, [companyId]);
  const initializedCompany = useRef(null);
  const canvasRef = useRef(null), centeredCompany = useRef(null);
  const mapRef = useRef(null), mapViewRef = useRef(mapView), pointersRef = useRef(new Map()), gestureRef = useRef(null);

  const updateMapView = useCallback(next => {
    const value = typeof next === "function" ? next(mapViewRef.current) : next;
    mapViewRef.current = value;
    setMapView(value);
  }, []);

  const fitMap = useCallback(() => {
    const canvas = canvasRef.current, map = mapRef.current;
    if (!canvas || !map || !map.offsetWidth || !map.offsetHeight) return;
    const inset = 48;
    const scale = clampMapScale(Math.min(1, (canvas.clientWidth - inset) / map.offsetWidth, (canvas.clientHeight - inset) / map.offsetHeight));
    updateMapView({
      scale,
      x: (canvas.clientWidth - map.offsetWidth * scale) / 2,
      y: Math.max(24, (canvas.clientHeight - map.offsetHeight * scale) / 2),
    });
  }, [updateMapView]);

  const zoomMapAt = useCallback((factor, clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pointX = (clientX ?? bounds.left + bounds.width / 2) - bounds.left;
    const pointY = (clientY ?? bounds.top + bounds.height / 2) - bounds.top;
    const current = mapViewRef.current;
    const scale = clampMapScale(current.scale * factor);
    updateMapView({
      scale,
      x: pointX - ((pointX - current.x) / current.scale) * scale,
      y: pointY - ((pointY - current.y) / current.scale) * scale,
    });
  }, [updateMapView]);

  function beginMapPointer(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("button, .business-hierarchy-map-controls")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = { type: "pan", point: points[0], view: mapViewRef.current };
    } else if (points.length === 2) {
      const [a, b] = points;
      gestureRef.current = {
        type: "pinch",
        distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: mapViewRef.current,
      };
    }
    setDraggingMap(true);
  }

  function moveMapPointer(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (points.length >= 2 && gesture?.type === "pinch") {
      const [a, b] = points;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const scale = clampMapScale(gesture.view.scale * distance / gesture.distance);
      const canvasBounds = canvasRef.current.getBoundingClientRect();
      const startX = gesture.center.x - canvasBounds.left;
      const startY = gesture.center.y - canvasBounds.top;
      const currentX = center.x - canvasBounds.left;
      const currentY = center.y - canvasBounds.top;
      updateMapView({
        scale,
        x: currentX - ((startX - gesture.view.x) / gesture.view.scale) * scale,
        y: currentY - ((startY - gesture.view.y) / gesture.view.scale) * scale,
      });
    } else if (points.length === 1 && gesture?.type === "pan") {
      updateMapView({
        ...gesture.view,
        x: gesture.view.x + points[0].x - gesture.point.x,
        y: gesture.view.y + points[0].y - gesture.point.y,
      });
    }
  }

  function endMapPointer(event) {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const points = [...pointersRef.current.values()];
    if (points.length === 1) gestureRef.current = { type: "pan", point: points[0], view: mapViewRef.current };
    else if (!points.length) { gestureRef.current = null; setDraggingMap(false); }
  }

  function handleMapKeyDown(event) {
    if (event.target.closest("button, .business-hierarchy-draggable")) return;
    const step = 48;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft") updateMapView(view => ({ ...view, x: view.x + step }));
    if (event.key === "ArrowRight") updateMapView(view => ({ ...view, x: view.x - step }));
    if (event.key === "ArrowUp") updateMapView(view => ({ ...view, y: view.y + step }));
    if (event.key === "ArrowDown") updateMapView(view => ({ ...view, y: view.y - step }));
    if (event.key === "+" || event.key === "=") zoomMapAt(1.2);
    if (event.key === "-") zoomMapAt(1 / 1.2);
    if (event.key === "0") fitMap();
  }

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoaded(false);
    try {
      const [employeeRows, departmentRows] = await Promise.all([
        api(`/api/company/${companyId}/employees`),
        api(`/api/company/${companyId}/departments`),
      ]);
      setPeople(employeeRows); setDepartments(departmentRows); setError(""); setLoaded(true);
      if (initializedCompany.current !== companyId) {
        const tree = buildEmployeeHierarchy(employeeRows);
        const initiallyCollapsed = new Set();
        const visit = (person, depth) => {
          const reports = tree.children.get(person.membership_id) || [];
          if (depth >= 2 && reports.length) initiallyCollapsed.add(person.membership_id);
          reports.forEach(report => visit(report, depth + 1));
        };
        tree.roots.forEach(root => visit(root, 0));
        setCollapsed(initiallyCollapsed);
        initializedCompany.current = companyId;
      }
    } catch (cause) { setError(cause.message); setLoaded(true); }
  }

  useEffect(() => {
    load();
    const refresh = () => load({ quiet: true });
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [companyId]);
  useEffect(() => {
    const mapKey = `${companyId}:${mode}`;
    if (!loaded || mode !== "reporting" || centeredCompany.current === mapKey) return;
    const frame = window.requestAnimationFrame(() => {
      fitMap();
      centeredCompany.current = mapKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaded, mode, companyId, fitMap]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "reporting") return;
    const wheel = event => {
      event.preventDefault();
      zoomMapAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [mode, zoomMapAt, loaded]);
  useEffect(() => {
    if (!loaded || mode !== "reporting") return;
    const frame = window.requestAnimationFrame(fitMap);
    return () => window.cancelAnimationFrame(frame);
  }, [query, departmentId, loaded, mode, fitMap]);

  const hierarchy = useMemo(() => buildEmployeeHierarchy(people), [people]);
  const visibleIds = useMemo(() => hierarchyVisibleIds(people, query, departmentId), [people, query, departmentId]);
  const matchedIds = useMemo(() => {
    if (!visibleIds) return new Set(hierarchy.active.map(person => person.membership_id));
    const normalized = query.trim().toLocaleLowerCase("ru");
    return new Set(hierarchy.active.filter(person => (!departmentId || String(person.department_id || "") === departmentId)
      && (!normalized || [person.name, person.username, person.job_title, person.profession, person.specialization, person.department, person.role_label]
        .some(value => value?.toLocaleLowerCase("ru").includes(normalized)))).map(person => person.membership_id));
  }, [hierarchy.active, visibleIds, query, departmentId]);
  const professionGroups = useMemo(() => groupEmployeesByProfession(hierarchy.active).filter(group => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return group.members.some(person => (!departmentId || String(person.department_id || "") === departmentId)
      && (!normalized || [group.title, person.name, person.job_title, person.department, person.role_label].some(value => value?.toLocaleLowerCase("ru").includes(normalized))));
  }), [hierarchy.active, query, departmentId]);
  const managers = hierarchy.active.filter(person => (hierarchy.children.get(person.membership_id) || []).length > 0).length;
  const withoutManager = hierarchy.roots.filter(person => person.role !== "COMPANY_OWNER").length;
  const graph = useMemo(() => layoutReportingGraph(hierarchy, { collapsed, visibleIds, positions: nodePositions }), [hierarchy, collapsed, visibleIds, nodePositions]);
  const expandableIds = graph.expandableIds;

  function setTreeCollapsed(next) {
    setCollapsed(next);
    window.requestAnimationFrame(() => window.requestAnimationFrame(fitMap));
  }

  if (!loaded && !error) return <Loader />;
  return <section className="business-hierarchy-page">
    {error && <Notice tone="red">{error}</Notice>}
    <dl className="business-hierarchy-summary"><div><dt>В компании</dt><dd>{hierarchy.active.length}</dd></div><div><dt>Руководителей</dt><dd>{managers}</dd></div><div><dt>Подразделений</dt><dd>{departments.length}</dd></div><div><dt>Без руководителя</dt><dd>{withoutManager}</dd></div></dl>
    <div className="business-hierarchy-toolbar">
      <div className="business-hierarchy-mode" role="group" aria-label="Вид схемы"><button type="button" className={mode === "reporting" ? "is-active" : ""} onClick={() => setMode("reporting")}>Иерархия</button><button type="button" className={mode === "profession" ? "is-active" : ""} onClick={() => setMode("profession")}>По специальностям</button></div>
      <label>Поиск<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя, должность или специальность" /></label>
      <label>Подразделение<select value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Все подразделения</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    </div>
    {mode === "reporting" ? <><div className={`business-hierarchy-canvas${draggingMap ? " is-dragging" : ""}`} ref={canvasRef} role="region" aria-label="Интерактивная карта компании" tabIndex={0} onPointerDown={beginMapPointer} onPointerMove={moveMapPointer} onPointerUp={endMapPointer} onPointerCancel={endMapPointer} onKeyDown={handleMapKeyDown}>
      <div className="business-hierarchy-map-controls" role="group" aria-label="Масштаб карты"><button type="button" onClick={() => zoomMapAt(1 / 1.2)} aria-label="Отдалить карту" title="Отдалить"><Icon name="zoom-out" size={18}/></button><span aria-live="polite">{Math.round(mapView.scale * 100)}%</span><button type="button" onClick={fitMap} aria-label="Показать всю карту" title="Показать целиком"><Icon name="maximize-2" size={17}/></button><button type="button" onClick={() => zoomMapAt(1.2)} aria-label="Приблизить карту" title="Приблизить"><Icon name="zoom-in" size={18}/></button></div>
      <div className="business-hierarchy-tree-actions"><button type="button" onClick={() => { setNodePositions({}); localStorage.removeItem(`arena-company-map-v2-${companyId}`); window.requestAnimationFrame(() => window.requestAnimationFrame(fitMap)); }}>Сбросить расположение</button><button type="button" onClick={() => setTreeCollapsed(new Set())}>Развернуть всё</button><button type="button" onClick={() => setTreeCollapsed(new Set(expandableIds))}>Свернуть всё</button></div>
      <div className="business-hierarchy-map business-hierarchy-graph" ref={mapRef} style={{ width: graph.width, height: graph.height, transform: `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapView.scale})` }}>
      <svg className="business-hierarchy-edges" width={graph.width} height={graph.height} aria-hidden="true"><defs><marker id={`company-arrow-${companyId}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>{graph.edges.map(edge => {
        const from = graph.byId.get(edge.parent), to = graph.byId.get(edge.child);
        const x1 = from.x + 114, y1 = from.y + 154, x2 = to.x + 114, y2 = to.y - 5;
        const bend = (y1 + y2) / 2;
        return <path key={`${edge.parent}-${edge.child}`} d={`M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={edge.inferred ? "6 5" : undefined} markerEnd={`url(#company-arrow-${companyId})`} />;
      })}</svg>
      {graph.nodes.map(node => <div key={node.person.membership_id} className="business-hierarchy-draggable" style={{ left: node.x, top: node.y }} tabIndex={0} role="group" aria-label={`${node.person.name}. Переместить карточку: стрелки на клавиатуре или перетаскивание.`}
        onPointerDown={event => {
          if (event.target.closest("button") || (event.pointerType === "mouse" && event.button !== 0)) return;
          event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
          nodeDrag.current = { id: node.person.membership_id, x: event.clientX, y: event.clientY, origin: { x: node.x, y: node.y } };
        }}
        onPointerMove={event => {
          if (nodeDrag.current?.id !== node.person.membership_id) return;
          event.stopPropagation(); const drag = nodeDrag.current;
          const position = { x: Math.max(0, Math.min(5000, drag.origin.x + (event.clientX - drag.x) / mapViewRef.current.scale)), y: Math.max(0, Math.min(5000, drag.origin.y + (event.clientY - drag.y) / mapViewRef.current.scale)) };
          setNodePositions(current => ({ ...current, [drag.id]: position }));
        }}
        onPointerUp={event => {
          if (nodeDrag.current?.id !== node.person.membership_id) return;
          event.stopPropagation(); nodeDrag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          localStorage.setItem(`arena-company-map-v2-${companyId}`, JSON.stringify(nodePositions));
        }}
        onPointerCancel={() => { nodeDrag.current = null; }}
        onKeyDown={event => {
          if (event.target.closest("button")) return;
          const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
          if (!delta) return;
          event.preventDefault(); event.stopPropagation();
          setNodePositions(current => { const next = { ...current, [node.person.membership_id]: { x: Math.max(0, node.x + delta[0]), y: Math.max(0, node.y + delta[1]) } }; localStorage.setItem(`arena-company-map-v2-${companyId}`, JSON.stringify(next)); return next; });
        }}>
        <PersonCard person={node.person} reports={node.reports} collapsed={collapsed.has(node.person.membership_id)} onToggle={() => { const next = new Set(collapsed); next.has(node.person.membership_id) ? next.delete(node.person.membership_id) : next.add(node.person.membership_id); setTreeCollapsed(next); }} dimmed={Boolean(visibleIds && !matchedIds.has(node.person.membership_id))}/>
      </div>)}
      {!hierarchy.active.length && <Empty>После вступления первого сотрудника здесь появится дерево подчинения.</Empty>}
      {hierarchy.active.length > 0 && visibleIds?.size === 0 && <Empty>По выбранным условиям сотрудники не найдены.</Empty>}
    </div></div><p className="business-hierarchy-legend">Сплошная стрелка — назначенный руководитель. Пунктир — сотрудник компании без назначенного руководителя.</p></> : <div className="business-profession-groups">
      {professionGroups.map(group => <section key={group.title} className="business-profession-group"><header><div><h3>{group.title}</h3><p>{group.members.length} сотрудников</p></div><span>{new Set(group.members.map(person => person.department).filter(Boolean)).size} подразделений</span></header><ul>{group.members.filter(person => (!departmentId || String(person.department_id || "") === departmentId) && (!query.trim() || [group.title, person.name, person.job_title, person.department, person.role_label].some(value => value?.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))))).map(person => <li key={person.membership_id}><div><strong>{person.name}</strong><span>{person.job_title || "Должность не указана"} · {person.department || "Без подразделения"}</span></div><small>{person.role_label}</small></li>)}</ul></section>)}
      {!professionGroups.length && <Empty>По выбранным условиям специальности не найдены.</Empty>}
    </div>}
  </section>;
}
