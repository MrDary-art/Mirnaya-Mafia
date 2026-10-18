import {useRef} from 'react';
import {useParams,Link} from 'react-router-dom';
import {useAuth} from '../auth';
import {api,apiBinary} from '../api';
export default function CouncilCallPage(){
 const {meetingId}=useParams(),{user,ready}=useAuth(),frame=useRef();
 if(!ready)return <p>Проверяем доступ…</p>;
 if(!user)return <main><h1>Войдите в аккаунт компании</h1><Link to="/login">Войти</Link></main>;
 const base='/api/council-runtime/'+meetingId;
 function connect(){const win=frame.current.contentWindow;win.councilBridge={request:(action,body)=>api(base+(action?'/'+action:''),{method:body?'POST':'GET',body}),upload:(id,blob)=>apiBinary(base+'/audio/'+id,blob,{method:'POST'})};win.dispatchEvent(new win.Event('council-ready'));}
 return <iframe ref={frame} title="Звонок Совета решений" src={'/council-call/index.html?meeting='+meetingId} onLoad={connect} allow="camera; microphone; display-capture; autoplay" style={{position:'fixed',inset:0,width:'100%',height:'100dvh',border:0,zIndex:1000,background:'#f7f7ef'}}/>;
}
