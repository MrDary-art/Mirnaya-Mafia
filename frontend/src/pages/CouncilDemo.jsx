import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import CouncilTable from "../components/CouncilTable.jsx";
import CouncilSocialGame, { SocialRole, SocialConsequences } from "../components/CouncilSocialGame.jsx";
import "./decision-council.css";

const initial = {execution_plan:"overtime", first_batch_percent:0, first_batch_days:0, balance_days:0, extra_cost:0, prepayment_percent:0, decision:"", owner:"", open_issues:"", version:0};
const fields = {first_batch_percent:"Первая партия, %",first_batch_days:"Первая поставка, дней",balance_days:"Остаток, дней",extra_cost:"Дополнительные расходы, ₽",prepayment_percent:"Предоплата, %"};

export default function CouncilDemo() {
  const [params] = useSearchParams(), role = params.get("role");
  const [stage,setStage] = useState(0), [data,setData] = useState(null), [error,setError] = useState("");
  const [agreement,setAgreement] = useState(initial), [report,setReport] = useState(null), [busy,setBusy] = useState(false);
  const [reload,setReload] = useState(0), [codes,setCodes] = useState({});
  useEffect(()=>{
    let active=true;setData(current => (role ? current?.role?.key === role : !current?.role) ? current : null);setError("");
    api(`/api/council/demo/social?stage=${stage}${role ? `&role=${encodeURIComponent(role)}` : ""}`,{auth:false}).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[stage,role,reload]);
  useEffect(()=>{
    let active=true;
    if(role)return;
    Promise.all(["project","client","production","finance"].map(async key=>[key,await api(`/api/council/demo/qr?role=${key}&origin=${encodeURIComponent(window.location.origin)}`,{auth:false})])).then(items=>{if(active)setCodes(Object.fromEntries(items));}).catch(()=>{});
    return ()=>{active=false;};
  },[role]);
  function change(key,value){setAgreement(a=>({...a,[key]:value}));setReport(null);}
  async function check(e){e.preventDefault();setBusy(true);setError("");try{setReport(await api("/api/council/demo/social/check",{method:"POST",body:agreement,auth:false}));}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="council-page council-public council-demo social-demo">
    <nav className="council-demo-nav"><Link to={role ? "/demo/council" : "/council"}>{role ? "← К общему столу" : "← Совет решений"}</Link><span>ОТКРЫТАЯ ДЕМОНСТРАЦИЯ</span><span>4 игрока · 15–20 минут</span></nav>
    {!role && <header className="council-demo-hero"><div><span className="council-kicker">СОЦИАЛЬНАЯ ИГРА СО СКРЫТОЙ ИНФОРМАЦИЕЙ</span><h1>Контракт на кону.<br/><em>Чем уступите вы?</em></h1><p>У каждого — свои факты, полномочия и интерес. Сохраните общий контракт, даже когда условия изменятся.</p><div className="council-tags"><span>4 равные роли</span><span>1 поворот событий</span><span>Несколько рабочих сделок</span></div><a className="council-button" href="#social-table">Сесть за стол ↘</a></div><CouncilTable compact equalRoles/></header>}
    {error && <div className="council-note council-note--error" role="alert">{error}<button onClick={()=>setReload(v=>v+1)}>Повторить загрузку</button></div>}
    {!data && !error && <p role="status">Открываем материалы игры…</p>}
    {data && (role ? <><p className="council-note">Демонстрационная карточка. Открывайте вторую вводную, когда общий стол перейдёт к этапу 2. В полной игре это делает сервер одновременно для команды.</p><div className="social-role-stage"><button aria-pressed={stage===0} onClick={()=>setStage(0)}>Начало игры</button><button aria-pressed={stage>=1} onClick={()=>setStage(1)}>Открыть вторую вводную</button></div><SocialRole role={data.role}/></> : <>
      <section className="council-demo-brief"><span>ДЕЛО № 01</span><p>{data.game.brief}</p></section>
      <section className="council-panel" id="social-table"><span className="council-kicker">ПЕРЕДАЙТЕ КАЖДОМУ ЕГО ДОСЬЕ</span><h2>Четыре стороны. Одно решение.</h2><p>Откройте по карточке на своём устройстве. Ведущий помогает с порядком, но не обязателен: один из игроков может заполнять документ.</p><div className="social-demo-roles">{data.roles.map((r,i)=><Link key={r.key} to={`/demo/council?role=${r.key}`} target="_blank" rel="noreferrer"><span className="council-kicker">РОЛЬ 0{i+1}</span><h3>{r.name}</h3><p>{r.preview}</p>{codes[r.key] && <img alt={`QR-код роли ${r.name}`} width="92" height="92" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(codes[r.key].svg)}`}/>}<p>Открыть досье ↗</p></Link>)}</div><small>QR ведёт на текущий адрес. Для телефонов откройте сайт по общему сетевому адресу: localhost доступен только на этом компьютере.</small></section>
      <CouncilSocialGame game={data.game} demo busy={data.game.stage !== stage} advance={()=>{setStage(s=>Math.min(3,s+1));setReport(null);}}/>
      <section className="council-panel"><span className="council-kicker">ОБЩИЙ ДОКУМЕНТ</span><h2>Что вы готовы подписать?</h2><p>Черновик можно собирать с начала игры. Условия проверяются после события. Перед проверкой каждый должен подтвердить свою часть сделки.</p>
      <form className="council-agreement-form" onSubmit={check}><label>Способ исполнения<select value={agreement.execution_plan} onChange={e=>change("execution_plan",e.target.value)}><option value="overtime">Своими силами · сверхурочные</option><option value="partner">Проверенный партнёр</option></select></label><div className="council-agreement-fields"><label>Общее решение<textarea required value={agreement.decision} onChange={e=>change("decision",e.target.value)} placeholder="На какие условия согласились стороны?"/></label>{Object.entries(fields).map(([key,label])=><label key={key}>{label}<input required type="number" min="0" max={key.includes("percent")?100:key.includes("days")?180:1000000} value={agreement[key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}<label>Ответственный<input required value={agreement.owner} onChange={e=>change("owner",e.target.value)}/></label></div><button className="council-button" disabled={busy||stage<3}>{busy ? "Проверяем соглашение…" : stage<3 ? "Проверка откроется на этапе 4" : "Подписать и увидеть последствия ↗"}</button></form>
      {report && <div className={`council-demo-result ${report.feasible?"is-success":""}`} role="status"><span>{report.feasible?"КОНТРАКТ СОХРАНЁН":"СДЕЛКУ НУЖНО ПЕРЕСМОТРЕТЬ"}</span><h3>{report.summary}</h3><ul>{report.issues.map(issue=><li key={issue}>{issue}</li>)}</ul><SocialConsequences report={report}/><button onClick={()=>{setReport(null);setAgreement(initial);setStage(0);}}>Переиграть за другую роль →</button></div>}
      </section>
    </>)}
  </main>;
}
