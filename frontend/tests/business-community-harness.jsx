// Local synthetic fixtures only. Every API request is intercepted; no production writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/auth.jsx';
import { SettingsWorkspace } from '../src/company/workspace.jsx';
import { BusinessWorkspaces } from '../src/business/BusinessLayout.jsx';
import MeetingSummaryText from '../src/company/MeetingSummaryText.jsx';
import ShareDialog from '../src/components/feed/ShareDialog.jsx';
import PostComposer from '../src/components/feed/PostComposer.jsx';
import PostCard from '../src/components/feed/PostCard.jsx';
import Collections from '../src/pages/Collections.jsx';
import {Achievements} from '../src/company/engagement.jsx';
import CouncilComposer from '../src/components/CouncilComposer.jsx';
import BusinessSectionHeader from '../src/business/BusinessSectionHeader.jsx';
import '../src/pages/decision-council.css';
import '../src/components/council-flow.css';
import '../src/pages/conversation.css';
import '../src/pages/ai-practice.css';
import '../src/design/tokens.css';
import '../src/index.css';
import '../src/arena-v2.css';
import '../src/design/site-polish.css';
import '../src/design/light-sage.css';
import '../src/design/control-palette.css';
import '../src/business/business.css';
import '../src/business/business-sections-forest.css';
import '../src/components/feed/feed.css';
import '../src/pages/community-forest.css';
document.documentElement.dataset.theme = 'sage-light';
let storedFocus = null, bookmarked = false, collections = [];
const post = {id: 123, kind:'TEXT', status:'PUBLISHED', body:'Тестовая полезная публикация для закладок', author:{id:77, username:'qa-author', display_name:'Автор примера'}, audience:'PUBLIC', created_at:'2026-10-20T12:00:00Z', media:[], counts:{likes:0,comments:0,reposts:0}, viewer_state:{can_repost:true,can_comment:true,can_view:true,bookmarked:false}};
const initialCompany = {id:7,name:'Компания для проверки',settings:{}};
window.fetch = async (url, options={}) => {
  const path = new URL(url,location.origin).pathname;
  let result = [];
  if (path === '/api/auth/me') result={id:999,username:'qa-viewer'};
  else if(path === '/api/company/context') result={companies:[],pending_invitations:[]};
  else if(path === '/api/company/search') result=[{id:7,name:'Северная студия',industry:'Консалтинг',members:10}];
  else if(path.endsWith('/pilot')) {storedFocus=JSON.parse(options.body);result={};}
  else if(path.endsWith('/bookmark')) {bookmarked=options.method==='POST';result={};}
  else if(path.endsWith('/bookmarks')) result={items:bookmarked?[{...post,viewer_state:{...post.viewer_state,bookmarked:true}}]:[],next_cursor:null};
  else if(path.endsWith('/collections')) {
    if(options.method==='POST') {const body=JSON.parse(options.body);result={id:50,...body,items_count:0,author:{username:'qa-viewer'}};collections.push(result);}
    else result={items:collections,next_cursor:null};
  }
  else if(path.endsWith('/collections/50/items')) {collections=collections.map(item=>({...item,items_count:1}));result={};}
  else if(path.endsWith('/employees')) result=[{user_id:77,membership_id:77,status:'ACTIVE',name:'Тестовый участник',username:'qa-participant'}];
  else if(path.endsWith('/capabilities')) result={video_enabled:false,max_image_bytes:10000000};
  else if(path.endsWith('/publishers')) result={items:[]};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
function QA() {
  const {user}=useAuth();
  const [data,setData]=useState({company:initialCompany,permissions:{manage_company:true}});
  const [share,setShare]=useState(false);
  const [showCollections,setShowCollections]=useState(false);
  const mode=new URLSearchParams(location.search).get('mode')||'focus';
  return <main style={{maxWidth:1100,margin:'auto',padding:24}}>
    <nav>{['focus','feed','companies','surfaces','council','achievements','ai-heading'].map(id=><a key={id} href={`?mode=${id}`} style={{marginRight:20}}>{id}</a>)}</nav>
    {mode==='ai-heading' ? <div className="practice-page conversation-page ai-practice-page"><header className="conversation-heading"><div><span className="eyebrow">ПРАКТИКА С ИИ</span><h1>Я хочу повысить зарплату</h1><div className="conversation-goal-row"><p className="conversation-goal"><b>Ваша задача:</b> Подготовить аргументы, согласовать критерии и договориться о новом окладе или плане его пересмотра.</p></div></div><button className="subtle-button">Завершить и получить разбор</button></header></div> :
    mode==='achievements' ? <div className="business-shell business-sections-forest"><Achievements data={{company:initialCompany,permissions:{manage_learning:true}}}/></div> :
    mode==='council' ? <div className="business-shell business-sections-forest"><BusinessSectionHeader section="council" title="Совет решений" description="Обсудите задачу вместе с командой."/><div className="council-page council-flow">{user&&<CouncilComposer permissions={{companies:[{id:7,name:'Компания'}]}} initialCompany={7} basePath="/business/7/council" allowGames/>}</div></div> :
    mode==='focus'?<div className="business-shell business-sections-forest"><SettingsWorkspace data={data} reload={async()=>setData({company:{...initialCompany,settings:{pilot:storedFocus}},permissions:{manage_company:true}})}/></div>:
    mode==='companies'?<BusinessWorkspaces/>:
    mode==='feed'?<div className="arena-feed-page community-forest"><PostComposer/><button className="arena-feed-button" onClick={()=>setShare(true)}>Открыть репост</button><button className="arena-feed-button" onClick={()=>setShowCollections(!showCollections)}>Открыть подборки</button>{showCollections?<Collections embedded/>:<PostCard post={post}/>}</div>:
    <div className="business-shell business-sections-forest"><div className="business-main">
      <header className="forest-section-header"><h1>Встречи</h1><header className="meeting-intro" style={{position:'static'}}><button className="primary-button">Создать встречу</button></header></header>
      <section className="business-episode-list"><h2>Ситуации</h2><nav><button className="is-active">Активные</button><button>Завершённые</button></nav></section>
      <header className="business-team-section-heading"><h2>Сотрудники</h2><p>Подразделение группирует коллег, а поле «Руководитель» строит дерево управления.</p></header>
      <header className="business-structure-header"><h2>Подразделения</h2><p>0 подразделений · 2 активных сотрудника</p></header>
      <header className="business-management-page-heading"><h2>Заявки и приглашения</h2><p>Обрабатывайте обращения и приглашайте зарегистрированных пользователей напрямую.</p></header>
      <section className="meeting-summary"><h3>Итог встречи</h3><MeetingSummaryText text={'Подробный разговор, сохранённый для проверки. '.repeat(80)}/></section>
    </div></div>}
    {share&&<ShareDialog post={post} onClose={()=>setShare(false)}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><AuthProvider><QA/></AuthProvider></MemoryRouter>);
