import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { Empty, Loader, Notice } from "./shared.jsx";
import { buildEmployeeHierarchy, groupEmployeesByProfession, hierarchyExpandableIds, hierarchyVisibleIds } from "./hierarchy.js";

const MIN_MAP_SCALE = 0.25;
const MAX_MAP_SCALE = 2;
const clampMapScale = value => Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, value));

function PersonCard({ person, reports, collapsed, onToggle, dimmed = false }) {
  const specialty = person.profession || person.specialization || "Специальность не указана";
  const nameParts = (person.name || person.username || "Сотрудник").trim().split(/\s+/).filter(Boolean);
  return <article className={`business-hierarchy-person${dimmed ? " is-context" : ""}`}>
    <div className="business-hierarchy-person-main">
      <div className="business-hierarchy-person-copy">
        <strong className="business-hierarchy-person-name" aria-label={person.name || person.username || "Сотрудник"}>{nameParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>)}</strong>
        <span>{person.job_title || "Должность не указана"}</span>
        <small>{specialty}</small>
      </div>
      {reports > 0 && <button type="button" className="business-hierarchy-toggle" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "Показать" : "Скрыть"} подчинённых сотрудника ${person.name}`}>
        <Icon name="arrow-right" size={15} className={collapsed ? "" : "is-open"}/><span>{reports}</span>
      </button>}
    </div>
    <div className="business-hierarchy-tags"><span>{person.role_label}</span><span>{person.department || "Без подразделения"}</span></div>
  </article>;
}

function ReportingNode({ person, hierarchy, collapsed, setCollapsed, visibleIds, matchedIds, depth = 0 }) {
  if (visibleIds && !visibleIds.has(person.membership_id)) return null;
  const reports = hierarchy.children.get(person.membership_id) || [];
  const isCollapsed = collapsed.has(person.membership_id) && !visibleIds;
  const toggle = () => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(person.membership_id)) next.delete(person.membership_id); else next.add(person.membership_id);
    return next;
  });
  return <li className="business-hierarchy-node">
    <PersonCard person={person} reports={reports.length} collapsed={isCollapsed} onToggle={toggle} dimmed={Boolean(visibleIds && !matchedIds.has(person.membership_id))}/>
    {reports.length > 0 && !isCollapsed && <ul className="business-hierarchy-children">
      {reports.map(report => <ReportingNode key={report.membership_id} person={report} hierarchy={hierarchy} collapsed={collapsed} setCollapsed={setCollapsed} visibleIds={visibleIds} matchedIds={matchedIds} depth={depth + 1}/>) }
    </ul>}
  </li>;
}

export function CompanyHierarchy({ data }) {
  const companyId = data.company.id;
  const [people, setPeople] = useState([]), [departments, setDepartments] = useState([]);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [mode, setMode] = useState("reporting"), [query, setQuery] = useState(""), [departmentId, setDepartmentId] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());
  const [mapView, setMapView] = useState({ x: 24, y: 24, scale: 1 });
  const [draggingMap, setDraggingMap] = useState(false);
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
    if (event.target.closest("button")) return;
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
  const expandableIds = useMemo(() => hierarchyExpandableIds(hierarchy), [hierarchy]);

  function setTreeCollapsed(next) {
    setCollapsed(next);
    window.requestAnimationFrame(() => window.requestAnimationFrame(fitMap));
  }

  if (!loaded && !error) return <Loader />;
  return <section className="business-hierarchy-page">
    {error && <Notice tone="red">{error}</Notice>}
    <dl className="business-hierarchy-summary"><div><dt>В компании</dt><dd>{hierarchy.active.length}</dd></div><div><dt>Руководителей</dt><dd>{managers}</dd></div><div><dt>Подразделений</dt><dd>{departments.length}</dd></div><div><dt>Без руководителя</dt><dd>{withoutManager}</dd></div></dl>
    <div className="business-hierarchy-toolbar">
      <div className="business-hierarchy-mode" role="group" aria-label="Вид схемы"><button type="button" className={mode === "reporting" ? "is-active" : ""} onClick={() => setMode("reporting")}>По подчинению</button><button type="button" className={mode === "profession" ? "is-active" : ""} onClick={() => setMode("profession")}>По специальностям</button></div>
      <label>Поиск<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя, должность или специальность" /></label>
      <label>Подразделение<select value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Все подразделения</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    </div>
    {mode === "reporting" ? <><div className={`business-hierarchy-canvas${draggingMap ? " is-dragging" : ""}`} ref={canvasRef} role="region" aria-label="Интерактивная карта компании" tabIndex={0} onPointerDown={beginMapPointer} onPointerMove={moveMapPointer} onPointerUp={endMapPointer} onPointerCancel={endMapPointer} onKeyDown={handleMapKeyDown}>
      <div className="business-hierarchy-map-controls" role="group" aria-label="Масштаб карты"><button type="button" onClick={() => zoomMapAt(1 / 1.2)} aria-label="Отдалить карту" title="Отдалить"><Icon name="zoom-out" size={18}/></button><span aria-live="polite">{Math.round(mapView.scale * 100)}%</span><button type="button" onClick={fitMap} aria-label="Показать всю карту" title="Показать целиком"><Icon name="maximize-2" size={17}/></button><button type="button" onClick={() => zoomMapAt(1.2)} aria-label="Приблизить карту" title="Приблизить"><Icon name="zoom-in" size={18}/></button></div>
      <div className="business-hierarchy-tree-actions"><button type="button" onClick={() => setTreeCollapsed(new Set())}>Развернуть всё</button><button type="button" onClick={() => setTreeCollapsed(new Set(expandableIds))}>Свернуть всё</button></div>
      <div className="business-hierarchy-map" ref={mapRef} style={{ transform: `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapView.scale})` }}>
      <ul className="business-hierarchy-roots">{hierarchy.roots.map(person => <ReportingNode key={person.membership_id} person={person} hierarchy={hierarchy} collapsed={collapsed} setCollapsed={setCollapsed} visibleIds={visibleIds} matchedIds={matchedIds}/>)}</ul>
      {!hierarchy.active.length && <Empty>После вступления первого сотрудника здесь появится дерево подчинения.</Empty>}
      {hierarchy.active.length > 0 && visibleIds?.size === 0 && <Empty>По выбранным условиям сотрудники не найдены.</Empty>}
    </div></div></> : <div className="business-profession-groups">
      {professionGroups.map(group => <section key={group.title} className="business-profession-group"><header><div><h3>{group.title}</h3><p>{group.members.length} сотрудников</p></div><span>{new Set(group.members.map(person => person.department).filter(Boolean)).size} подразделений</span></header><ul>{group.members.filter(person => (!departmentId || String(person.department_id || "") === departmentId) && (!query.trim() || [group.title, person.name, person.job_title, person.department, person.role_label].some(value => value?.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))))).map(person => <li key={person.membership_id}><div><strong>{person.name}</strong><span>{person.job_title || "Должность не указана"} · {person.department || "Без подразделения"}</span></div><small>{person.role_label}</small></li>)}</ul></section>)}
      {!professionGroups.length && <Empty>По выбранным условиям специальности не найдены.</Empty>}
    </div>}
  </section>;
}
