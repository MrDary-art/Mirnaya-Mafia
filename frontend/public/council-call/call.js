import {createRecording} from './recording.js';
import {releaseTracks,isLive} from './media-state.mjs?v=20261018-camera-stop-2';
const $=s=>document.querySelector(s);
const code=new URLSearchParams(location.search).get('meeting');
let room,joined=false,polling=false,stream=new MediaStream(),display=null,cameraTrack=null;
let boardVersion=-1,board=[],drawing=null,drawingPointer=null,tool='pen',pending=[],unsaved=[],queue=Promise.resolve(),mediaBusy=false,epoch=0;
const peers=new Map(),seen=new Set(),ice=new Map(),remote=new Map();
const canvas=$('#board'),ctx=canvas.getContext('2d');
const recording=createRecording({api,code,getToken:()=>'',uploadBinary:(id,blob)=>window.councilBridge.upload(id,blob),getMember:()=>room?.me,error,status:text=>{$('#record-status').textContent=text;updateRecordingButtons();}});
function updateRecordingButtons(){
 $('#finish-record').hidden=!room?.recordingAllowed||!stream.getAudioTracks().some(isLive);
 $('#retry-record').hidden=!recording.hasFailed();
}
function error(message){$('#join-error').textContent=$('#waiting').hidden?'':message;$('#error').textContent=$('#waiting').hidden?message:'';}
function workspace(){
 $('#waiting').hidden=joined;
 $('#meeting').hidden=!joined;
 $('#controls').hidden=!joined;
 document.body.classList.toggle('in-call',joined);
 canvas.setAttribute('aria-disabled',String(!joined));
 document.querySelectorAll('.tools button,.tools input,#board-text').forEach(control=>control.disabled=!joined);
 $('#retry-board').disabled=!joined;
}
function boardStatus(message){
 $('#board-status').textContent=message;
 $('#retry-board').hidden=!unsaved.length;
}
const moscowTime=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))+' МСК';
function syncEntry(){
 if(!room)return;
 $('#back-to-council').href='/council/'+encodeURIComponent(code);
 const finished=room.reservationEnded||['analysis','report'].includes(room.phase);
 const waiting=!finished&&!room.canJoin;
 const opens=room.joinOpensAt&&Date.now()<room.joinOpensAt;
 const message=finished?'Время звонка завершилось. Вернитесь к встрече, чтобы посмотреть итог.':waiting?(opens?'Вход откроется '+moscowTime(room.joinOpensAt)+'.':'Звонок пока не открыт. Обновляем состояние встречи…'):'Звонок открыт. Выберите устройства и войдите.';
 if($('#entry-window').textContent!==message)$('#entry-window').textContent=message;
 $('#entry-window').dataset.state=finished?'ended':waiting?'waiting':'open';
 $('#waiting').classList.toggle('is-finished',finished);
 $('#waiting-label').textContent=finished?'Встреча завершена':'Подключение к встрече';
 $('#waiting-title').textContent=finished?'Звонок завершён':'Проверьте устройства';
 $('#waiting-copy').textContent=finished?'Созвон завершён. Откройте встречу, чтобы посмотреть материалы и итог.':'Выберите, какие устройства включить. Их можно изменить во время встречи. Камера не записывается.';
 $('#slot-time').textContent='Начало '+moscowTime(room.started)+' · до '+moscowTime(room.reservedUntil);
 $('#join-call').disabled=mediaBusy||!room.canJoin||finished;
 $('#join-call').setAttribute('aria-busy',String(mediaBusy));
 if(!joined){const status=finished?'Встреча завершилась':waiting?'Ожидаем начала':'Можно войти';if($('#connection').textContent!==status)$('#connection').textContent=status;}
 workspace();
}
function joinError(cause){
 if(cause?.name==='NotAllowedError'||cause?.name==='PermissionDeniedError')return 'Браузер не разрешил доступ к камере или микрофону. Разрешите доступ в настройках сайта либо выключите устройства и войдите без них.';
 if(cause?.name==='NotFoundError'||cause?.name==='DevicesNotFoundError')return 'Выбранная камера или микрофон не найдены. Подключите устройство либо выключите его перед входом.';
 if(cause?.name==='NotReadableError'||cause?.name==='TrackStartError')return 'Камера или микрофон заняты другой программой. Закройте её либо войдите без устройства.';
 return cause?.message||'Не удалось войти в звонок. Повторите попытку.';
}
async function api(action,body){if(!window.councilBridge)throw new Error('Откройте звонок из авторизованной комнаты.');return window.councilBridge.request(action,body);}
function accept(data){
 room=data;
 const ended=data.reservationEnded||!data.canJoin||['analysis','report'].includes(data.phase);
 if(ended&&joined){
  epoch++;joined=false;drawing=null;drawingPointer=null;
  const finishing=recording.finish();stopMedia();finishing.catch(e=>error(e.message));
  $('#videos').replaceChildren();
  workspace();error(data.reservationEnded?'Зарезервированное время истекло. Вернитесь к встрече, чтобы посмотреть итог.':'Переговоры завершены. Вернитесь к встрече, чтобы посмотреть итог.');
 }
 const own=data.members?.find(m=>m.id===data.me.id);
 if(joined&&own?.muted&&stream.getAudioTracks().length){recording.finish().catch(e=>error(e.message));releaseTracks(stream,'audio');replace('audio',null).catch(()=>{});controls();}
 if(joined&&own?.cameraBlocked&&(cameraTrack||display)){releaseTracks(stream,'video');cameraTrack=null;display?.getTracks().forEach(t=>t.stop());display=null;replace('video',null).catch(()=>{});controls();}
 if(data.board&&data.boardVersion>boardVersion){boardVersion=data.boardVersion;board=data.board;paint();}
 $('#title').textContent=data.title;
 $('#identity').textContent=data.me.name+' · '+(data.members.find(m=>m.id===data.me.id)?.roleName||'Ведущий')+' · '+code;
 $('#clear').hidden=!data.permissions.manage;
 renderMeetingAdmin();
 const phaseNames={prepare:'Досье',team:'Стороны',talk:'Переговоры',agreement:'Соглашение',vote:'Голосование',analysis:'Анализ',report:'Итог'};
 const adminSummary=$('#meeting-admin summary');
 if(adminSummary)adminSummary.textContent=adminSummary.textContent.replace(' · '+data.phase,' · '+(phaseNames[data.phase]||'Этап встречи'));
 renderSocialGame();syncEntry();updateRecordingButtons();
}
const boardPalette=['#022e24','#1f4d3a','#4f8f75','#9fc3b2','#e7f1ec'];
function boardColor(value){if(boardPalette.includes(value))return value;const hex=/^#[0-9a-f]{6}$/i.test(value||'')?value:'#1f4d3a';const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const source=rgb(hex);return [...boardPalette].sort((a,b)=>rgb(a).reduce((s,n,i)=>s+(n-source[i])**2,0)-rgb(b).reduce((s,n,i)=>s+(n-source[i])**2,0))[0];}
function draw(item){const pts=item.points.map(([x,y])=>[x*canvas.width,y*canvas.height]);const [a,b=a]=[pts[0],pts.at(-1)];ctx.save();ctx.strokeStyle=item.tool==='eraser'?'#e7f1ec':boardColor(item.color);ctx.fillStyle=boardColor(item.color);ctx.lineWidth=item.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();if(item.tool==='text'){ctx.font=(18+item.width*2)+'px Arial';ctx.fillText(item.text,a[0],a[1],canvas.width-a[0]);}else if(item.tool==='rect'){ctx.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);}else if(item.tool==='ellipse'){const rx=Math.abs(b[0]-a[0])/2,ry=Math.abs(b[1]-a[1])/2;if(rx>0&&ry>0){ctx.ellipse((a[0]+b[0])/2,(a[1]+b[1])/2,rx,ry,0,0,Math.PI*2);ctx.stroke();}}else{ctx.moveTo(...a);if(item.tool==='line')ctx.lineTo(...b);else for(const p of pts)ctx.lineTo(...p);if(pts.length===1)ctx.lineTo(a[0]+.1,a[1]+.1);ctx.stroke();}ctx.restore();}
function paint(){ctx.fillStyle='#e7f1ec';ctx.fillRect(0,0,canvas.width,canvas.height);for(const item of [...board,...unsaved,...pending])draw(item);if(drawing)draw(drawing);}
function point(e){const rect=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];}
async function persistItem(item){
 try{accept(await api('board',{operation:'add',item}));error('');boardStatus(unsaved.length?'Часть рисунков не сохранена. Повторите сохранение.':'Сохранено · видно всем участникам');return true;}
 catch(e){if(!unsaved.includes(item))unsaved.push(item);error('Не удалось сохранить рисунок: '+e.message);boardStatus('Рисунок пока только у вас. Проверьте соединение и повторите сохранение.');return false;}
 finally{pending=pending.filter(p=>p!==item);paint();}
}
function saveItem(item){
 item.points=item.points.map(p=>p.map(n=>Math.round(n*10000)/10000));
 pending.push(item);boardStatus('Сохраняем рисунок…');paint();
 queue=queue.then(()=>persistItem(item));
}
function finishDrawing(e){
 if(!drawing||e.pointerId!==drawingPointer)return;
 const end=point(e);
 if(['line','rect','ellipse'].includes(drawing.tool))drawing.points=[drawing.points[0],end];else drawing.points.push(end);
 const item=drawing;drawing=null;drawingPointer=null;
 if(['line','rect','ellipse'].includes(item.tool)&&Math.hypot((item.points[1][0]-item.points[0][0])*canvas.width,(item.points[1][1]-item.points[0][1])*canvas.height)<4){boardStatus('Для линии и фигуры нажмите и протяните указатель по доске.');paint();return;}
 saveItem(item);
}
canvas.addEventListener('pointerdown',e=>{
 if(!joined){error('Звонок завершён. Чтобы рисовать, войдите в открытую встречу.');return;}
 if(e.button!==0||drawing)return;
 const item={tool,color:$('#color').value,width:Number($('#width').value),points:[point(e)],text:$('#board-text').value.trim()};
 if(tool==='text'){if(!item.text){boardStatus('Введите надпись над доской, затем нажмите на место для текста.');$('#board-text').focus();return;}saveItem(item);return;}
 drawing=item;drawingPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);boardStatus('Рисуем… отпустите указатель, чтобы сохранить.');paint();e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{if(!drawing||e.pointerId!==drawingPointer)return;const p=point(e);if(['line','rect','ellipse'].includes(drawing.tool))drawing.points=[drawing.points[0],p];else{drawing.points.push(p);if(drawing.points.length>=999){const finished=drawing;drawing={...finished,points:[p]};saveItem(finished);}}paint();e.preventDefault();});
canvas.addEventListener('pointerup',finishDrawing);
canvas.addEventListener('pointercancel',e=>{if(e.pointerId!==drawingPointer)return;drawing=null;drawingPointer=null;boardStatus('Рисование прервано. Попробуйте ещё раз.');paint();});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#text-options').hidden=tool!=='text';boardStatus(tool==='text'?'Введите надпись, затем нажмите на нужное место на доске.':['line','rect','ellipse'].includes(tool)?'Нажмите и протяните указатель по доске, затем отпустите.':tool==='eraser'?'Проведите ластиком по рисунку.':'Рисуйте мышью или пальцем.');});
$('#width').oninput=()=>{$('#width-value').value=$('#width').value;};
$('#retry-board').onclick=()=>{if(!joined)return;const retry=[...unsaved];unsaved=[];boardStatus('Повторяем сохранение…');for(const item of retry){pending.push(item);queue=queue.then(()=>persistItem(item));}paint();};
$('#undo').onclick=()=>{if(!joined)return;queue=queue.then(async()=>{try{accept(await api('board',{operation:'undo'}));boardStatus('Последний ваш рисунок отменён.');}catch(e){error(e.message);boardStatus('Не удалось отменить рисунок. Попробуйте ещё раз.');}});};
$('#clear').onclick=()=>{if(!joined||!confirm('Очистить общую доску для всех? Перед очисткой можно скачать PNG.'))return;queue=queue.then(async()=>{try{accept(await api('board',{operation:'clear',version:boardVersion}));unsaved=[];boardStatus('Доска очищена для всех участников.');paint();}catch(e){error(e.message);boardStatus('Не удалось очистить доску. Попробуйте ещё раз.');}});};
$('#export').onclick=()=>{const a=document.createElement('a');a.download='Совет-'+code+'-доска.png';a.href=canvas.toDataURL('image/png');a.click();};
function tiles(){if(!room||!joined)return;const members=room.members.filter(m=>!m.bot&&(m.inCall||m.id===room.me.id));$('#count').textContent='В звонке: '+members.length;const ids=new Set(members.map(m=>m.id));for(const el of $('#videos').children)if(!ids.has(el.dataset.id))el.remove();for(const m of members){let el=[...$('#videos').children].find(x=>x.dataset.id===m.id);if(!el){el=document.createElement('div');el.className='video-tile';el.dataset.id=m.id;const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=m.name[0];const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=m.id===room.me.id;const label=document.createElement('span');label.className='video-label';label.textContent=m.name+(m.id===room.me.id?' · вы':'');const state=document.createElement('span');state.className='video-state';el.append(avatar,video,label,state);$('#videos').append(el);}const video=el.querySelector('video');const media=m.id===room.me.id?(display||stream):remote.get(m.id);if(video.srcObject!==media){video.srcObject=media||null;if(media)video.play().catch(()=>{});}video.onclick=()=>video.play().catch(()=>{});const local=m.id===room.me.id;const videoOn=local?(!!display||isLive(cameraTrack)):(m.screenOn||m.videoOn);video.style.opacity=videoOn?'1':'0';video.style.visibility=videoOn?'visible':'hidden';el.classList.toggle('camera-off',!videoOn);const connected=m.id===room.me.id||peers.get(m.id)?.connectionState==='connected';el.querySelector('.video-state').textContent=m.id===room.me.id?(display?'Показ экрана':isLive(cameraTrack)?'Камера включена':'Камера выключена'):connected?(m.screenOn?'Показ экрана':m.videoOn?'Камера включена':'Камера выключена'):'Соединение…';}}
function controls(){
 const audio=stream.getAudioTracks().find(isLive);
 $('#mic .control-label').textContent=isLive(audio)?'Выключить микрофон':'Включить микрофон';
 $('#mic').setAttribute('aria-pressed',String(!!isLive(audio)));
 $('#camera .control-label').textContent=isLive(cameraTrack)?'Выключить камеру':'Включить камеру';
 $('#camera').setAttribute('aria-pressed',String(!!isLive(cameraTrack)));
 $('#share .control-label').textContent=display?'Остановить показ':'Показать экран';
 $('#share').setAttribute('aria-pressed',String(!!display));
 updateRecordingButtons();
}
async function send(to,kind,payload){await api('signal',{to,kind,payload});}
function makePeer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers:Array.isArray(room?.iceServers)?room.iceServers:[]});peers.set(id,pc);pc.addTransceiver('audio',{direction:'sendrecv'});pc.addTransceiver('video',{direction:'sendrecv'});for(const tr of pc.getTransceivers()){const track=tr.receiver.track.kind==='audio'?stream.getAudioTracks()[0]:(display?.getVideoTracks()[0]||cameraTrack);if(track)tr.sender.replaceTrack(track).catch(e=>error(e.message));}pc.onicecandidate=e=>{if(e.candidate)send(id,'ice',e.candidate.toJSON()).catch(e=>error(e.message));};pc.ontrack=e=>{let media=remote.get(id);if(!media){media=new MediaStream();remote.set(id,media);}if(!media.getTracks().some(t=>t.id===e.track.id))media.addTrack(e.track);tiles();};pc.onconnectionstatechange=()=>{tiles();if(pc.connectionState==='failed')error('Не удалось соединиться с одним из участников. Перезайдите в звонок. Между разными сетями может потребоваться TURN-сервер.');};return pc;}
async function signals(){for(const s of room.signals){if(seen.has(s.id))continue;seen.add(s.id);if(s.kind==='leave'){peers.get(s.from)?.close();peers.delete(s.from);remote.delete(s.from);continue;}const pc=makePeer(s.from);if(s.kind==='offer'){if(pc.signalingState!=='stable'){if(room.me.id<s.from)continue;await pc.setLocalDescription({type:'rollback'});}await pc.setRemoteDescription(s.payload);for(const candidate of ice.get(s.from)||[])await pc.addIceCandidate(candidate);ice.delete(s.from);await pc.setLocalDescription(await pc.createAnswer());await send(s.from,'answer',pc.localDescription.toJSON());}else if(s.kind==='answer'){if(pc.signalingState!=='have-local-offer')continue;await pc.setRemoteDescription(s.payload);for(const candidate of ice.get(s.from)||[])await pc.addIceCandidate(candidate);ice.delete(s.from);}else if(s.kind==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(s.payload);else{const list=ice.get(s.from)||[];list.push(s.payload);ice.set(s.from,list);}}}}
function presence(active=joined){return {active,audio:isLive(stream.getAudioTracks()[0]),video:isLive(cameraTrack),screen:!!display,boardVersion};}
async function publish(){if(joined)accept(await api('call',presence()));}
async function replace(kind,track){await Promise.all([...peers.values()].map(pc=>pc.getTransceivers().find(t=>t.receiver.track.kind===kind)?.sender.replaceTrack(track)));}
async function join(){
 if(mediaBusy||joined||!room?.canJoin)return;
 epoch++;mediaBusy=true;syncEntry();error('');
 try{
  const audio=$('#entry-mic').checked,video=$('#entry-camera').checked;
  if((audio||video)&&!navigator.mediaDevices?.getUserMedia)throw new Error('Этот браузер не поддерживает доступ к камере и микрофону. Выключите устройства или откройте звонок в актуальном браузере.');
  stream=audio||video?await navigator.mediaDevices.getUserMedia({audio,video}):new MediaStream();
  cameraTrack=stream.getVideoTracks()[0]||null;
  const current=await api('');accept(current);
  if(!current.canJoin)throw new Error(current.reservationEnded?'Время звонка завершилось. Вернитесь к встрече, чтобы посмотреть итог.':'Звонок пока не открыт. Попробуйте войти в указанное время.');
  current.signals.forEach(s=>seen.add(s.id));
  const connected=await api('call',presence(true));
  joined=true;accept(connected);
  if(!joined||!connected.canJoin||!connected.members.some(m=>m.id===connected.me.id&&m.inCall))throw new Error('Сервер не подтвердил подключение или время звонка закончилось. Вернитесь к встрече и проверьте её статус.');
  syncEntry();
  if(connected.recordingAllowed&&stream.getAudioTracks().length){
   try{await recording.start(stream.getAudioTracks()[0]);}
   catch(cause){releaseTracks(stream,'audio');await publish().catch(()=>{});error('Звонок открыт, но запись речи не началась: '+joinError(cause)+' Микрофон выключен; включите его после устранения проблемы.');}
  }
  controls();await poll();
 }catch(cause){
  if(joined)await api('call',{active:false}).catch(()=>{});
  joined=false;stopMedia();syncEntry();error(joinError(cause));
 }finally{mediaBusy=false;syncEntry();}
}
function stopMedia(){stream.getTracks().forEach(t=>t.stop());display?.getTracks().forEach(t=>t.stop());stream=new MediaStream();display=null;cameraTrack=null;for(const pc of peers.values())pc.close();peers.clear();remote.clear();ice.clear();}
async function leave(){try{await recording.finish();}catch(e){stopMedia();controls();tiles();error(e.message);return;}epoch++;joined=false;for(const id of peers.keys())send(id,'leave',null).catch(()=>{});stopMedia();try{accept(await api('call',{active:false}));}catch(e){error(e.message);}$('#videos').replaceChildren();syncEntry();}
async function mediaAction(fn,label='Устройство'){if(mediaBusy)return;if(!joined){error('Звонок завершён. Вернитесь к встрече, чтобы посмотреть итог.');syncEntry();return;}mediaBusy=true;document.querySelectorAll('#mic,#camera,#share').forEach(b=>b.disabled=true);try{await fn();if(joined)await publish();error('');}catch(e){error(label+': '+e.message);}finally{mediaBusy=false;controls();tiles();document.querySelectorAll('#mic,#camera,#share').forEach(b=>b.disabled=!joined);}}
$('#join-call').onclick=join;$('#leave').onclick=leave;
$('#mic').onclick=()=>mediaAction(async()=>{const t=stream.getAudioTracks().find(isLive);if(t){try{await recording.finish();}finally{releaseTracks(stream,'audio');await replace('audio',null);}}else{const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!joined){media.getTracks().forEach(t=>t.stop());return;}const t=media.getAudioTracks()[0];releaseTracks(stream,'audio');stream.addTrack(t);try{if(room.recordingAllowed)await recording.start(t);}catch(e){releaseTracks(stream,'audio');throw e;}await replace('audio',t);t.onended=()=>{recording.finish().catch(e=>error(e.message));releaseTracks(stream,'audio');replace('audio',null).catch(()=>{});publish().catch(()=>{});controls();tiles();};}});
$('#camera').onclick=()=>mediaAction(async()=>{if(cameraTrack&&cameraTrack.readyState==='live'){cameraTrack.onended=null;cameraTrack.stop();releaseTracks(stream,'video');cameraTrack=null;if(!display)await replace('video',null);}else{const media=await navigator.mediaDevices.getUserMedia({video:true});if(!joined){media.getTracks().forEach(t=>t.stop());return;}releaseTracks(stream,'video');cameraTrack=media.getVideoTracks()[0];stream.addTrack(cameraTrack);if(!display)await replace('video',cameraTrack);cameraTrack.onended=()=>{cameraTrack=null;releaseTracks(stream,'video');if(!display)replace('video',null).catch(()=>{});publish().catch(()=>{});controls();tiles();};}});
async function stopShare(){const old=display;if(!old)return;display=null;old.getTracks().forEach(t=>{t.onended=null;t.stop();});await replace('video',isLive(cameraTrack)?cameraTrack:null);if(joined)await publish();controls();tiles();}
function shareError(cause){if(['NotAllowedError','AbortError','PermissionDeniedError'].includes(cause?.name))return 'выбор окна отменён или браузер запретил доступ. Выберите окно и нажмите «Поделиться» в окне браузера.';if(cause?.name==='NotReadableError')return 'выбранное окно недоступно. Попробуйте показать другую вкладку или экран.';return cause?.message||'не удалось начать показ. Проверьте разрешения браузера и попробуйте ещё раз.';}
$('#share').onclick=()=>mediaAction(async()=>{if(display){await stopShare();return;}if(!window.isSecureContext)throw new Error('доступен только через HTTPS или localhost. Откройте защищённую ссылку на встречу.');const policy=document.permissionsPolicy||document.featurePolicy;if(policy?.allowsFeature('display-capture')===false)throw new Error('заблокирован настройками страницы. Откройте встречу напрямую или обратитесь к администратору.');if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('браузер не поддерживает показ экрана. Откройте встречу в актуальном Chrome или Edge.');let capture;try{capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});}catch(cause){throw new Error(shareError(cause));}if(!joined){capture.getTracks().forEach(t=>t.stop());throw new Error('время встречи закончилось до начала показа.');}const track=capture.getVideoTracks()[0];if(!track){capture.getTracks().forEach(t=>t.stop());throw new Error('браузер не передал изображение выбранного окна.');}display=capture;track.onended=()=>stopShare().catch(e=>error('Показ экрана: '+e.message));try{await replace('video',track);}catch(cause){await stopShare();throw cause;}},'Показ экрана');
function view(gallery){$('#board-panel').hidden=gallery;$('.meeting-layout').classList.toggle('gallery-mode',gallery);$('#show-board').setAttribute('aria-pressed',String(!gallery));$('#show-gallery').setAttribute('aria-pressed',String(gallery));}
$('#show-board').onclick=()=>view(false);$('#show-gallery').onclick=()=>view(true);
async function poll(){if(polling||!window.councilBridge)return;polling=true;const requestEpoch=epoch;try{const fresh=await api(joined?'call':'',joined?presence(true):undefined);if(requestEpoch!==epoch)return;accept(fresh);syncEntry();if(joined){if($('#connection').textContent!=='● Встреча подключена')$('#connection').textContent='● Встреча подключена';await signals();for(const m of room.members.filter(m=>m.inCall&&!m.bot&&m.id!==room.me.id)){if(!peers.has(m.id)&&room.me.id<m.id){const pc=makePeer(m.id);await pc.setLocalDescription(await pc.createOffer());await send(m.id,'offer',pc.localDescription.toJSON());}}for(const [id,pc]of peers)if(!room.members.some(m=>m.id===id&&m.inCall)){pc.close();peers.delete(id);remote.delete(id);}tiles();}}catch(e){$('#connection').textContent='Связь прервана · повторяем подключение';error(e.message);}finally{polling=false;}}
window.addEventListener('beforeunload',e=>{if(recording.hasPending()){e.preventDefault();e.returnValue='Запись ещё загружается. Завершите звонок кнопкой выхода.';}});
window.addEventListener('pagehide',()=>{stopMedia();if(joined)window.councilBridge?.request('call',{active:false}).catch(()=>{});});
async function boot(){try{if(!window.councilBridge)await new Promise(resolve=>window.addEventListener('council-ready',resolve,{once:true}));accept(await api(''));syncEntry();}catch(e){error(e.message);$('#connection').textContent='Нет доступа';$('#join-call').disabled=true;}}
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
function renderMeetingAdmin(){const node=$('#meeting-admin');if(!room)return;const wasOpen=node.querySelector('details')?.open;const eligible=room.members.filter(m=>m.role>=0&&m.id!==room.host);const count=room.stageRequest?.approvals.length||0;node.innerHTML=room.permissions.manage?`<details ${wasOpen?'open':''}><summary>Пульт ${room.me.access==='owner'?'владельца':room.me.access==='developer'?'разработчика':'модератора'} · ${room.phase}</summary><p>Переходы ведущего меняют этап для всей комнаты.</p><div class="admin-actions">${['prepare','team','talk','agreement','vote'].map(x=>`<button data-admin-stage="${x}">${({prepare:'Досье',team:'Стороны',talk:'Переговоры',agreement:'Соглашение',vote:'Голосование',analysis:'Анализ'})[x]}</button>`).join('')}</div><button id="stage-policy">${room.allowStageRequests?'Запретить':'Разрешить'} переходы по согласию игроков</button>${room.phase==='analysis'?'<button id="run-analysis">Расшифровать записи и получить итог</button>':''}</details>`:room.me.role>=0&&room.me.id!==room.host?`<p>Переход к следующему этапу: ${count} / ${eligible.length} голосов</p><button id="stage-approve" ${!['prepare','team','talk','agreement'].includes(room.phase)||!room.allowStageRequests||room.stageRequest?.approvals.includes(room.me.id)?'disabled':''}>${room.allowStageRequests?'Одобрить следующий этап':'Ведущий запретил переходы'}</button>`:'';}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-admin-stage],#stage-policy,#stage-approve,#run-analysis,#retry-record');if(!b)return;try{b.disabled=true;if(b.dataset.adminStage)accept(await api('navigate',{phase:b.dataset.adminStage}));else if(b.id==='stage-policy')accept(await api('stagepolicy',{enabled:!room.allowStageRequests}));else if(b.id==='stage-approve')accept(await api('stagerequest',{}));else if(b.id==='run-analysis'){await recording.finish();accept(await api('analyze',{}));}else if(b.id==='retry-record')await recording.retry();}catch(e){error(e.message);}finally{b.disabled=false;}});
$('#finish-record').onclick=async()=>{try{await recording.finish();}catch(e){error(e.message);}finally{releaseTracks(stream,'audio');await replace('audio',null);await publish();controls();}};
setInterval(poll,1500);paint();boot();

let socialSignature = "";
function renderSocialGame(){
 const game=room?.game;
 let panel=document.getElementById('social-game');
 if(room?.preparationCall){
  const intro=document.querySelector('#waiting > p');if(intro)intro.textContent=room.recordingAllowed?'Если включить микрофон, речь будет записана для отчёта по тестовому созвону. Камера не записывается.':'Вы можете говорить без записи: ваши устные реплики не попадут в автоматический отчёт. Камера не записывается.';
  const notice=document.querySelector('.record-notice b');if(notice)notice.textContent='Запись речи — для отчёта по созвону';
  const explanation=document.querySelector('.record-notice p');if(explanation)explanation.textContent=room.recordingAllowed?'Загруженные записи расшифровываются, а доступный ИИ уточняет итог только по сохранённым репликам. Черновик проверяет руководитель перед отправкой участникам.':'Вы вошли без согласия на запись. Ваш микрофон может работать, но ваша речь не записывается и не анализируется.';
 }
 if(!game){panel?.remove();return;}
 const intro=document.querySelector('#waiting > p');if(intro)intro.textContent='Проверьте микрофон: звук каждого участника записывается отдельно для итогового разбора. Камера необязательна и не записывается.';
 const notice=document.querySelector('.record-notice b');if(notice)notice.textContent='Запись речи — для личного разбора';
 const explanation=document.querySelector('.record-notice p');if(explanation)explanation.textContent='Записи передаются в Whisper, затем ИИ сверяет реплики с ролью и соглашением. Итоги корпоративной встречи появятся после обработки всех записей.';
 const signature=JSON.stringify([game,room.myRole,room.outcome,room.canAdvanceGame]);
 if(signature===socialSignature)return;
 socialSignature=signature;
 const opened=panel?.querySelector('details')?.open;
 if(!panel){panel=document.createElement('section');panel.id='social-game';panel.className='board-panel';document.getElementById('meeting-admin').after(panel);}
 panel.replaceChildren();
 const add=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 add(panel,'span','КОНТРАКТ НА КОНУ · ЭТАП '+(game.stage+1)+' / 4').className='eyebrow';
 add(panel,'h2',game.current.title);add(panel,'p',game.current.prompt);
 if(game.event){const event=add(panel,'aside','');event.className='social-call-event';add(event,'b',game.event.title);add(event,'p',game.event.text);}
 if(room.myRole){const role=room.myRole,details=add(panel,'details','');details.open=!!opened;add(details,'summary','Моя закрытая роль · '+role.name);add(details,'h3','Личный интерес');add(details,'p',role.personal_interest);add(details,'h3','Мои полномочия');add(details,'p',role.authority);const facts=add(details,'ul','');for(const fact of [...role.private_facts,...(role.new_facts||[])])add(facts,'li',fact);for(const limit of role.limits)add(details,'p',limit);if(role.sealed)add(details,'p','Вторая вводная откроется на следующем этапе.');}
 if(room.permissions.manage&&!game.finished){const controls=add(panel,'div','');controls.className='admin-actions';for(const offset of [-1,1]){const button=add(controls,'button',offset<0?'← Предыдущий этап':'Следующий этап →');button.disabled=game.stage+offset<0||game.stage+offset>3;button.onclick=async()=>{try{accept(await api('gamestage',{stage:game.stage+offset}));}catch(e){error(e.message);}};}}
 if(game.stage<3&&room.canAdvanceGame){const approved=game.approvals.includes(Number(room.me.id));add(panel,'p','Готовы продолжать: '+game.approvals.length+' / 4');const button=add(panel,'button',approved?'Ждём остальных':'Готов к следующему этапу →');button.disabled=approved;button.onclick=async()=>{button.disabled=true;try{accept(await api('gameadvance',{stage:game.stage}));}catch(e){error(e.message);button.disabled=false;}};}
 const link=add(panel,'a','Общий документ, предложения и личные переговоры ↗');link.href='/council/'+code;link.target='_blank';link.rel='noopener';link.className='social-call-link';
 if(room.outcome){add(panel,'h3',room.outcome.summary);for(const text of room.outcome.consequences||[])add(panel,'p',text);}
}
