// Silent, isolated regression harness: no device access, audio or real API calls.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import VoiceConversation from "../src/components/VoiceConversation.jsx";
import "../src/pages/conversation.css";
let current, starts = 0, posts = 0;
let earlyEnd = false, timeOffset = 0;
// Reproduce a page that has already been open for more than 40 seconds.
const browserNow = performance.now.bind(performance);
performance.now = () => browserNow() + 60000 + timeOffset;
const update = () => window.dispatchEvent(new Event("qa:changed"));
class Recognition {
  start() {
    current = this;
    starts++; update();
    setTimeout(() => {
      if (earlyEnd) { earlyEnd = false; this.onend?.(); }
      else this.onstart?.();
    }, 20);
  }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
}
window.SpeechRecognition = Recognition;
window.fetch = async (url, options) => {
  if (!String(url).endsWith("/api/sessions/123/turn-stream")) throw Error("Unexpected test request");
  const { text } = JSON.parse(options.body);
  posts++; update();
  return new Response(JSON.stringify({ type: "done", result: { text } }) + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
};
function Harness() {
  const [phase, setPhase] = useState("idle"), [turn, setTurn] = useState(""), [, render] = useState(0);
  React.useEffect(() => { const changed=()=>render(n=>n+1); window.addEventListener("qa:changed",changed); return ()=>window.removeEventListener("qa:changed",changed); }, []);
  const result = () => { const row = [{ transcript: "Предлагаю обсудить сроки поставки" }]; row.isFinal = true; current.onresult?.({ results: [row] }); };
  return <main><h1>Изолированная проверка голосового ввода</h1><p>Настоящий микрофон и звук не используются.</p><button onClick={()=>{earlyEnd=true;}}>Следующий запуск: ранний onend</button><button onClick={()=>current?.onend?.()}>Пауза браузера</button><button onClick={()=>{current?.onerror?.({error:"network"}); current?.onend?.();}}>Сетевой сбой</button><button onClick={()=>{timeOffset+=45000;update();}}>Прошло 45 секунд</button><button onClick={result}>Распознать фразу</button><output aria-label="Запуски">{starts}</output><output aria-label="Запросы">{posts}</output><output aria-label="Фаза">{phase}</output><output aria-label="Отправленный текст">{turn}</output><VoiceConversation sessionId={123} speechEnabled={false} onPhase={setPhase} onTurn={data=>setTurn(data.text)}/></main>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
