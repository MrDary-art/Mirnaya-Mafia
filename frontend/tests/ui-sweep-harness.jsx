// Local-only fixtures: API calls never leave this page.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AuthProvider} from '../src/auth.jsx';
import FriendsWorkspace from '../src/components/social/FriendsWorkspace.jsx';
import ProfileWall from '../src/components/feed/ProfileWall.jsx';
import {CosmeticItemArt} from '../src/components/cosmetics/CosmeticVisual.jsx';
import {CatalogManager} from '../src/company/company-tools.jsx';
import {GrowthTools} from '../src/company/growth.jsx';
import '../src/design/tokens.css';
import '../src/index.css';
import '../src/arena-v2.css';
import '../src/design/site-polish.css';
import '../src/design/light-sage.css';
import '../src/design/control-palette.css';
import '../src/business/business.css';
import '../src/business/business-sections-forest.css';
import '../src/pages/account-forest.css';
import '../src/pages/public-profile.css';
import '../src/pages/community-forest.css';
document.documentElement.dataset.theme='sage-light';
let searchLog=[];
window.fetch=async(url,options={})=>{
 const u=new URL(url,location.origin),p=u.pathname;let result=[];
 if(p==='/api/auth/me')result={id:999,username:'qa-viewer'};
 else if(p==='/api/social/people'){
  const term=u.searchParams.get('q');searchLog.push(term);window.dispatchEvent(new Event('qa:search'));
  await new Promise(resolve=>setTimeout(resolve,term==='Анна'?650:80));
  result=term?[{id:2,username:term==='Анна'?'anna':'boris',display_name:term,relationship:'NONE',rank:1}]:[];
 }
 else if(p.endsWith('/stats'))result={posts:0,followers:0,following:0,friends:0,following_author:false};
 else if(p.endsWith('/posts')||p.endsWith('/highlights')||p.endsWith('/collections')){await new Promise(resolve=>setTimeout(resolve,250));result={items:[],next_cursor:null};}
 else if(p.endsWith('/assignments/catalog'))result=[];
 else if(p.endsWith('/catalog'))result={professions:[],competencies:[],specialties:[]};
 else if(p.endsWith('/industry-packs'))result=[{code:'qa-pack',label:'Демо-пакет',situations:['Переговоры о сроках']}];
 else if(p.endsWith('/employees'))result=[{membership_id:1,name:'Тестовый сотрудник'}];
 else if(options.method&&options.method!=='GET')result={};
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
const data={company:{id:7},permissions:{manage_team:true,manage_company:true}};
function QA(){const mode=new URLSearchParams(location.search).get('mode')||'friends';const[,render]=useState(0);useEffect(()=>{const update=()=>render(n=>n+1);window.addEventListener('qa:search',update);return()=>window.removeEventListener('qa:search',update);},[]);return <main style={{maxWidth:1120,margin:'auto',padding:24}}><nav><a href="?mode=friends">Друзья</a> · <a href="?mode=profile">Профиль</a> · <a href="?mode=shop">Магазин</a> · <a href="?mode=catalog">Каталог</a> · <a href="?mode=automation">Автоматизация</a></nav>{mode==='friends'?<><output aria-label="Поисковые запросы">{searchLog.join(' | ')}</output><div className="community-forest"><FriendsWorkspace section="friends"/></div></>:mode==='profile'?<div className="public-profile-page"><header style={{height:320}}><h1>Тестовый профиль</h1></header><ProfileWall userId={2} publicView/></div>:mode==='shop'?<div className="nova-shell"><div className="product-page"><div className="shop-forest"><div className="cosmetic-storefront-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>{['theme_arena','theme_graphite','frame_classic'].map((code,index)=><button key={code} className={'cosmetic-card cosmetic-shop-card'+(index===0?' is-equipped':'')}><span className="cosmetic-card-art"><CosmeticItemArt item={{code,category:code.startsWith('frame')?'frame':'theme',name:code}} equipment={{avatar_code:'avatar_owl_01'}} userId={2}/></span><strong>{code}</strong></button>)}</div></div></div></div>:<div className="business-shell business-sections-forest"><div className="business-main">{mode==='catalog'?<CatalogManager data={data}/>:<GrowthTools data={data}/>}</div></div>}</main>;}
createRoot(document.getElementById('root')).render(<MemoryRouter><AuthProvider><QA/></AuthProvider></MemoryRouter>);
