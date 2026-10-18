import { useEffect, useRef, useState } from "react";
import { api, apiSpeech } from "../api.js";

export default function AdminModelDownloads() {
  const audio=useRef(null);
  const [playing,setPlaying]=useState(null);
  useEffect(()=>()=>{audio.current?.pause();if(audio.current?.src)URL.revokeObjectURL(audio.current.src);},[]);
  async function preview(name){setError("");setPlaying(name);try{audio.current?.pause();if(audio.current?.src)URL.revokeObjectURL(audio.current.src);const blob=await apiSpeech(`/api/admin/tts/test?voice=${name==="piper"?"dmitri":"irina"}`,"");audio.current=new Audio(URL.createObjectURL(blob));audio.current.onended=()=>setPlaying(null);await audio.current.play();}catch(e){setError(e.message);setPlaying(null);}}
  const [state, setState] = useState(null), [error, setError] = useState(""), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, timer;
    async function load() {
      try {
        const value = await api("/api/admin/models");
        if (!active) return;
        setState(value);
        if (value.download.status === "downloading") timer = setTimeout(load, 2000);
      } catch (e) { if (active) setError(e.message); }
    }
    load(); return () => { active = false; clearTimeout(timer); };
  }, [revision]);
  async function download(name) {
    setError(""); setBusy(true);
    try { await api(`/api/admin/models/${name}/download`, { method: "POST" }); setRevision(n => n + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="ia-panel"><h2>Файлы речи</h2><p>Загрузка не переключает модель. После проверки файлов выберите её в настройках распознавания.</p>{error && <p role="alert">{error}</p>}{state ? <><div className="ia-table"><table><thead><tr><th>Модель</th><th>Размер</th><th>Файлы</th><th>Загрузка и проверка</th></tr></thead><tbody>{state.items.map(item => <tr key={item.name}><td>{item.name === "piper" ? "Дмитрий · мужской · Piper" : item.name === "piper-irina" ? "Ирина · женский · Piper" : `Whisper ${item.name}`}</td><td>{Math.ceil(item.bytes / 1024 / 1024)} МБ</td><td>{item.present ? "Загружены" : "Нужно скачать"}{state.loaded === item.name ? " · используется" : ""}</td><td><button disabled={busy || state.download.status === "downloading"} onClick={() => download(item.name)}>{item.present ? "Проверить файлы" : "Скачать"}</button>{item.name.startsWith("piper")&&<button style={{marginLeft:8}} disabled={!item.present||!!playing} onClick={()=>preview(item.name)}>{playing===item.name?"Воспроизводим…":"Прослушать голос"}</button>}</td></tr>)}</tbody></table></div>{state.download.status !== "idle" && <p role="status">{state.download.error || state.download.progress}</p>}</> : <p>Загружаем список…</p>}</section>;
}
