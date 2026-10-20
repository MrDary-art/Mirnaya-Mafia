// Isolated WebRTC regression: canvas video only, no physical devices or audio.
import React from 'react';
import {createRoot} from 'react-dom/client';
import PeerCall from '../src/components/PeerCall.jsx';
import '../src/design/tokens.css';
import '../src/index.css';
import '../src/design/light-sage.css';
import '../src/pages/room-role-options.css';
import '../src/pages/room-waiting.css';
import '../src/components/bookings.css';
import '../src/pages/conversation.css';
import '../src/practice-workspace.css';
document.documentElement.dataset.theme = 'sage-light';
const nativeRTC = window.RTCPeerConnection;
let other, otherStream, ws, deviceCalls = 0;
function canvasStream(label, color) {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
  const context = canvas.getContext('2d');
  const paint = () => {context.fillStyle=color;context.fillRect(0,0,480,270);context.fillStyle='#e7f1ec';context.font='24px sans-serif';context.fillText(label,25,120);context.fillText(String(Date.now()),25,170);};
  paint(); const timer=setInterval(paint,100); const stream=canvas.captureStream(10);
  stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));
  return stream;
}
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{deviceCalls++;return canvasStream('Вы · тест', '#1f4d3a');}});
// Capture is a silent stub. Browser RTC and video elements remain real.
window.AudioContext = class {audioWorklet={addModule:async()=>{}};sampleRate=48000;destination={};resume=async()=>{};close=async()=>{};createMediaStreamSource=()=>({connect(){},disconnect(){}});createGain=()=>({gain:{value:0},connect(){},disconnect(){}});};
window.AudioWorkletNode = class {port={};connect(){} disconnect(){}};
const send = signal => ws.onmessage?.({data:JSON.stringify({type:'signal',...signal})});
let serial=Promise.resolve();
window.WebSocket = class {
  static OPEN=1;readyState=1;
  constructor(){ws=this;setTimeout(()=>this.onopen?.(),20);}
  send(raw){serial=serial.then(async()=>{
    const {signal}=JSON.parse(raw);
    if(signal.kind==='offer') {
      if(!other) {
        other=new nativeRTC({iceServers:[]});
        otherStream=canvasStream('Собеседник · тест','#426b5a');
        otherStream.getTracks().forEach(track=>other.addTrack(track,otherStream));
        other.onicecandidate=event=>event.candidate&&send({kind:'candidate',data:event.candidate.toJSON(),event_id:crypto.randomUUID()});
      }
      await other.setRemoteDescription(signal.data);
      const answer=await other.createAnswer();await other.setLocalDescription(answer);
      const response={kind:'answer',data:{type:answer.type,sdp:answer.sdp},event_id:crypto.randomUUID()};
      send(response);send(response); // Duplicate transport delivery must be harmless.
    } else if(signal.kind==='candidate') await other.addIceCandidate(signal.data);
  }).catch(error=>{document.querySelector('output').textContent=error.message;});}
  close(){this.readyState=3;other?.close();other=null;otherStream?.getTracks().forEach(track=>track.stop());}
};
window.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/ice')?{iceServers:[]}:[]),{headers:{'Content-Type':'application/json'}});
function Harness(){return <main className="nova-shell" style={{padding:24,maxWidth:1000,margin:'auto'}}><h1>Проверка 1×1 без устройств</h1><p>Только тестовые видеокадры. Камера, микрофон и звук не используются.</p><output/><div className="arena-room-page"><PeerCall room={{id:123,your_id:1,host_id:1,phase:'lobby',peer_name:'Собеседник · тест'}}/><div className="booking-date-banner"><small>КОМНАТА ОТКРЫТА СЕЙЧАС</small><b>Можно начинать после входа второго участника</b><p>Второй участник может присоединиться по коду или ссылке.</p><button>Скопировать приглашение</button></div><details className="room-feedback"><summary>Обратная связь · необязательно</summary><p>Зафиксируйте результат</p></details></div><fieldset className="room-role-options"><legend>Кем вы будете в этой встрече?</legend><label><input type="radio" name="role"/><span><b>Менеджер проектов</b><small>Отвечает за приём и приоритизацию правок, планирование работ.</small></span></label><label className="selected"><input type="radio" name="role" defaultChecked/><span><b>Руководитель направления</b><small>Согласует план и фиксирует договорённости.</small></span></label></fieldset><div className="conversation-page"><div className="conversation-composer"><div className="voice-recovery-panel"><p>Распознанный текст сохранён: Предлагаю обсудить сроки поставки.</p><button className="voice-recovery-send">Отправить распознанный текст</button></div></div></div></main>;}
createRoot(document.getElementById('root')).render(<Harness/>);
