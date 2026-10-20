// Isolated visual fixtures. No real account data or API mutations.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {Calendar} from '../src/company/engagement.jsx';
import SocialNotifications from '../src/pages/SocialNotifications.jsx';
import ExperienceCanvas from '../src/experience/ExperienceCanvas.jsx';
import '../src/design/tokens.css';
import '../src/index.css';
import '../src/arena-v2.css';
import '../src/design/nocturne.css';
import '../src/practice-workspace.css';
import '../src/design/site-polish.css';
import '../src/design/form-controls.css';
import '../src/components/answer-quality.css';
import '../src/design/light-sage.css';
import '../src/design/control-palette.css';
import '../src/business/business.css';
import '../src/business/business-sections-forest.css';
import '../src/pages/community-forest.css';
document.documentElement.dataset.theme='sage-light';
const mode=new URLSearchParams(location.search).get('mode')||'quality';
if (mode === 'owl') {
 const NativeImage=window.Image;
 window.Image=class extends NativeImage {
  set onload(callback) { super.onload=callback ? ()=>setTimeout(callback,4000) : null; }
 };
}
const today=new Date();
const date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
window.fetch=async url=>{
 const path=new URL(url,location.origin).pathname;
 let data={};
 if(path.endsWith('/calendar'))data=Array.from({length:4},(_,i)=>({id:i+1,title:'Проверка связи и обсуждение очень длинного названия рабочей встречи '+(i+1),date:date+'T'+String(10+i).padStart(2,'0')+':00:00',kind:'MEETING',meeting_id:i+1,status:'SCHEDULED'}));
 else if(path.endsWith('/notifications'))data=[];
 else if(path.endsWith('/preferences'))data={likes:true,comments:true,follows:true,reposts:true,mentions:true,stories:true};
 else throw Error('Unexpected fixture request: '+path);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
function QA(){return <main style={{padding:24,maxWidth:1200,margin:'auto'}}><nav><a href="?mode=quality">Цвета ответов</a> · <a href="?mode=notifications">Уведомления</a> · <a href="?mode=calendar">Календарь</a> · <a href="?mode=owl">Сова</a></nav>{mode==='calendar'?<div className="business-shell business-sections-forest"><div className="business-main"><Calendar data={{company:{id:7},permissions:{}}}/></div></div>:mode==='notifications'?<div className="community-forest"><SocialNotifications embedded/></div>:mode==='owl'?<div style={{position:'relative',height:440}}><ExperienceCanvas/></div>:<div className="nova-shell"><div className="product-page path-session"><h1>Результаты выбора</h1><div className="exercise-options">{[['strong','Сильный ход'],['acceptable','Рабочий вариант'],['weak','Слабый ход']].map(([quality,label])=><button disabled className={'answer-button selected answer-quality-revealed answer-quality-'+quality} key={quality}><span className="path-option-index">1</span><span className="path-option-body">Предлагаю обсудить условия поставки<span className="path-option-feedback"><b>{label}</b>Обратная связь по выбранному ответу</span></span></button>)}</div></div></div>}</main>;}
createRoot(document.getElementById('root')).render(<MemoryRouter><QA/></MemoryRouter>);
