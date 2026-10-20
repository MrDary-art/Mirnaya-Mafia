// Exercise actual failure handlers without hardware, accounts or server mutations.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import PeerCall from '../src/components/PeerCall.jsx';
import BookingActions from '../src/components/BookingActions.jsx';
import '../src/design/tokens.css';
import '../src/index.css';
import '../src/design/light-sage.css';
import '../src/design/control-palette.css';
import '../src/pages/room-role-options.css';
import '../src/pages/room-waiting.css';
import '../src/practice-workspace.css';
document.documentElement.dataset.theme='sage-light';
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Device access denied','NotAllowedError');}});
window.fetch=async()=>new Response(JSON.stringify({detail:'Не удалось отменить встречу. Повторите позже.'}),{status:503,headers:{'Content-Type':'application/json'}});
const room={id:999,your_id:1,host_id:1,guest_id:2,phase:'lobby',can_cancel:true,code:'TEST123456'};
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="nova-shell" style={{padding:24,maxWidth:1000,margin:'auto'}}><div className="product-page"><h1>Онлайн 1×1 — ошибки</h1><p>Проверка цвета реальных сообщений без доступа к устройствам.</p><div className="arena-room-page"><PeerCall room={room}/><BookingActions room={room}/></div><div className="arena-room-hub"><p id="room-code-error" role="alert" className="text-rose-200">Код приглашения не найден. Проверьте код комнаты.</p></div><div className="booking-modal-card"><div className="booking-modal"><div role="alert"><b className="text-white">Приглашение не отправлено</b><p className="text-slate-300">Сервис временно недоступен.</p></div></div></div></div></main></MemoryRouter>);
