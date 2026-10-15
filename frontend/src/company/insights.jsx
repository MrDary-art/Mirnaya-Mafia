import { lazy, Suspense, useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice } from "./shared.jsx";
import { AssignmentCard } from "./learning.jsx";
import { Calendar } from "./engagement.jsx";


export function Ratings({ data }) { const [value,setValue]=useState(null),[error,setError]=useState("");useEffect(()=>{api(`/api/company/${data.company.id}/ratings`).then(setValue).catch(e=>setError(e.message))},[data.company.id]);if(!value)return <Loader error={error}/>;if(!value.enabled)return <Empty>{value.reason}</Empty>;if(!data.permissions.manage_team)return <section><h2 className="text-3xl font-bold">{ru("moya pozitsiya")}</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{[[ru("mesto"),value.my_place],[ru("rezultat"),value.my_score],[ru("protsentil"),value.percentile]].map(([l,v])=><article key={l} className="glass rounded-2xl p-5"><b className="text-3xl">{v??"—"}</b><p>{l}</p></article>)}</div></section>;return <section><h2 className="text-3xl font-bold">{ru("reiting kompanii")}</h2><div className="mt-4 space-y-2">{value.ratings.map(x=><article key={x.membership_id} className="glass flex justify-between rounded-2xl p-4"><b>#{x.position} / {x.name}</b><span>{x.score}/100</span></article>)}</div></section>;}



const AnalyticsModule = lazy(() => import("./analytics.jsx").then(module => ({ default: module.Analytics })));
export function Analytics(props) { return <Suspense fallback={<Loader />}><AnalyticsModule {...props} /></Suspense>; }

export { ManagerOverview } from "./overview.jsx";

export { MyResults } from "./results.jsx";
