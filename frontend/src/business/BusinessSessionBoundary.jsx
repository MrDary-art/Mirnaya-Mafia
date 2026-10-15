import {useEffect,useState} from "react";
import {Link,useParams} from "react-router-dom";
import {api} from "../api.js";
export default function BusinessSessionBoundary({children}){
 const{id,companyId}=useParams();const[state,setState]=useState("loading"),[error,setError]=useState("");
 useEffect(()=>{let active=true;setState("loading");api(`/api/sessions/${id}`).then(session=>{if(!active)return;if(String(session.settings?.corporate?.company_id)!==String(companyId))throw new Error("Эта сессия не относится к выбранной компании.");setState("ready");}).catch(e=>{if(active){setError(e.message);setState("error");}});return()=>{active=false;};},[id,companyId]);
 if(state==="loading")return <p role="status">Проверяем корпоративную сессию…</p>;
 if(state==="error")return <section className="business-panel" role="alert"><h2>Сессия недоступна</h2><p>{error}</p><Link to={`/business/${companyId}/assignments`}>Открыть задания компании</Link></section>;
 return children;
}
