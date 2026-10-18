import {useEffect,useRef,useState} from "react";
import {api} from "../api.js";
import AdminModelDownloads from "../components/AdminModelDownloads.jsx";
import AdminSpeechTest from "../components/AdminSpeechTest.jsx";
import {browserSpeechRecognitionSupported,createBrowserSpeechRecognition} from "../components/browserSpeechRecognition.js";

function BrowserRecognitionTest(){
  const recognition=useRef(null),timer=useRef(null);const [running,setRunning]=useState(false),[text,setText]=useState(""),[error,setError]=useState("");
  useEffect(()=>()=>{clearTimeout(timer.current);recognition.current?.abort();},[]);
  function stop(){clearTimeout(timer.current);recognition.current?.stop();setRunning(false);}
  function start(){setError("");setText("");setRunning(true);try{recognition.current=createBrowserSpeechRecognition({onStart:()=>setRunning(true),onResult:(final,interim)=>setText([final,interim].filter(Boolean).join(" ")),onEnd:()=>{setRunning(false);clearTimeout(timer.current);},onError:message=>{setError(message);setRunning(false);}});recognition.current.start();timer.current=setTimeout(stop,20000);}catch(e){setError(e.message);setRunning(false);}}
  return <section className="ia-panel"><h2>Голосовой ввод в диалоге с ИИ</h2><p>Речь распознаёт служба браузера (Web Speech API). Сайт передаёт модели уже распознанный текст. Настройки Whisper ниже на этот ввод не влияют.</p><p>Этот браузер: {browserSpeechRecognitionSupported()?"голосовой ввод поддерживается":"голосовой ввод не поддерживается"}.</p><button disabled={!browserSpeechRecognitionSupported()} onClick={running?stop:start}>{running?"Остановить проверку":"Проверить голосовой ввод браузера"}</button>{text&&<p role="status" className="settings-answer">{text}</p>}{error&&<p role="alert">{error}</p>}</section>;
}

export default function SpeechSettings(){
  const [cfg,setCfg]=useState(null),[form,setForm]=useState({policy:"local",model:"tiny",tts_voice:"dmitri"}),[workers,setWorkers]=useState([]),[name,setName]=useState("Внешний Whisper"),[enrollment,setEnrollment]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function load(){const [value,items]=await Promise.all([api("/api/admin/installation"),api("/api/admin/stt/workers")]);setCfg(value);setWorkers(items);setForm({policy:value.stt_policy,model:value.stt_model,tts_voice:value.tts_voice||"dmitri"});}
  useEffect(()=>{load().catch(e=>setError(e.message));},[]);
  async function run(work){setBusy(true);setError("");try{await work();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <>{error&&<p role="alert" className="ia-error">{error}</p>}{notice&&<p role="status" className="ia-notice">{notice}</p>}
    <BrowserRecognitionTest/>
    <section className="ia-panel"><h2>Серверное распознавание аудиозаписей · Whisper</h2><p>Используется, когда аудиозапись отправлена в API сайта: серверные голосовые запросы и тест ниже. Это отдельный путь от голосового ввода браузера.</p>
      {!cfg?<p role="status">Загружаем настройки…</p>:<form onSubmit={e=>{e.preventDefault();run(async()=>{setCfg(await api("/api/admin/installation/speech",{method:"PUT",body:{...form,revision:cfg.revision}}));setNotice("Настройки речи сохранены.");});}}>
        <div className="settings-grid"><label>Где распознавать запись<select value={form.policy} onChange={e=>setForm({...form,policy:e.target.value})}><option value="local">Локальный Whisper на сервере</option><option value="auto">Внешний Whisper с локальным резервом</option><option value="remote">Только внешний Whisper</option></select></label><label>Локальная модель Whisper<select value={form.model} onChange={e=>setForm({...form,model:e.target.value})}>{["tiny","base","small"].map(value=><option key={value}>{value}</option>)}</select></label></div>
        <h3>Озвучивание ответов ИИ · Piper</h3><p>Серверный голос читает текст ответа. Распознавание речи пользователя работает отдельно.</p><label>Основной голос<select value={form.tts_voice} onChange={e=>setForm({...form,tts_voice:e.target.value})}><option value="dmitri">Дмитрий · мужской</option><option value="irina">Ирина · женский</option></select></label><p>Сначала скачайте файлы выбранного голоса и прослушайте пример в таблице ниже.</p><button disabled={busy}>Сохранить настройки речи</button>
      </form>}
    </section>
    <AdminModelDownloads/><AdminSpeechTest/>
    <section className="ia-panel"><h2>Живые звонки · WebRTC</h2><p>Микрофон и камера участников соединяются через WebRTC. TURN помогает установить связь между сетями и не распознаёт речь. Звонок Совета решений не записывается и не отправляется в Whisper.</p><p>TURN: {cfg?.turn_configured?"настроен":"не настроен"}. Микрофон и камеру проверяйте в комнате подготовки встречи.</p></section>
    <section className="ia-panel"><div className="settings-heading"><h2>Внешние серверы Whisper</h2><button disabled={busy} onClick={()=>run(load)}>Обновить</button></div><p>Worker принимает задания расшифровки аудио. На видеосвязь и браузерный ввод его подключение не влияет.</p><label>Название компьютера<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||!name.trim()} onClick={()=>run(async()=>setEnrollment(await api("/api/admin/stt/enrollment",{method:"POST",body:{name}})))}>Создать код подключения на 10 минут</button>{enrollment&&<div className="ia-notice"><p>Одноразовый код: <code className="ia-secret">{enrollment.code}</code></p><p>Введите его в установщике worker для этого сайта.</p></div>}
      <div className="settings-mode-list">{workers.map(worker=><div key={worker.id}><b>{worker.name}</b><span>{worker.revoked?"Отозван":worker.ready?"На связи":"Не на связи"}</span>{!worker.revoked&&<button disabled={busy} onClick={()=>run(async()=>{await api(`/api/admin/stt/workers/${worker.id}/revoke`,{method:"POST"});await load();})}>Отозвать доступ</button>}</div>)}</div>{!workers.length&&<p>Внешние серверы не подключены.</p>}
    </section>
  </>;
}
