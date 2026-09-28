import { useEffect, useRef, useState } from "react";
import { apiAudio, apiSpeech } from "../api.js";
import { pcm16 } from "./VoiceConversation.jsx";

export default function AdminSpeechTest() {
  const [phase, setPhase] = useState("idle");
  const [policy, setPolicy] = useState("local");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const capture = useRef(null);
  const audio = useRef(null);
  const mounted = useRef(true);
  function cleanup() {
    const current = capture.current;
    capture.current = null;
    if (!current) return;
    clearInterval(current.timer);
    current.stream.getTracks().forEach(track => track.stop());
    current.node.disconnect();
    current.context.close().catch(() => {});
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cleanup(); audio.current?.pause(); if (audio.current?.src) URL.revokeObjectURL(audio.current.src); }; }, []);
  async function start() {
    setError(""); setResult(null); setPhase("connecting");
    let stream, context;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Микрофону нужен HTTPS или localhost");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
      context = new AudioContext();
      await context.audioWorklet.addModule("/voice-worklet.js");
      const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, "voice-capture"), silent = context.createGain();
      silent.gain.value = 0; source.connect(node); node.connect(silent); silent.connect(context.destination);
      const current = { stream, context, node, chunks: [], started: performance.now() };
      node.port.onmessage = e => { if (capture.current === current) current.chunks.push(e.data); };
      capture.current = current;
      current.timer = setInterval(() => { const value = Math.floor((performance.now() - current.started) / 1000); setSeconds(value); if (value >= 40) send(); }, 250);
      setSeconds(0); setPhase("recording");
    } catch (e) { stream?.getTracks().forEach(t => t.stop()); context?.close(); setError(e.message); setPhase("idle"); }
  }
  async function send() {
    const current = capture.current;
    if (!current) return;
    const pcm = pcm16(current.chunks, current.context.sampleRate);
    cleanup(); setPhase("sending");
    try { const answer = await apiAudio(`/api/admin/stt/test?policy=${policy}`, pcm); if (mounted.current) setResult(answer); }
    catch (e) { if (mounted.current) setError(e.message); }
    finally { if (mounted.current) setPhase("idle"); }
  }
  async function speak() {
    setError(""); setPhase("speaking");
    try {
      const wav = await apiSpeech("/api/admin/tts/test", "");
      if (!mounted.current) return;
      if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
      audio.current = new Audio(URL.createObjectURL(wav));
      audio.current.onended = () => mounted.current && setPhase("idle");
      await audio.current.play();
    } catch (e) { if (mounted.current) { setError(e.message); setPhase("idle"); } }
  }
  return <section className="ia-panel"><h2>Проверка распознавания видеовстреч 1×1</h2><p>Запишите короткую фразу для проверки серверной расшифровки видеозвонка. Тест не создаёт тренировку и не отправляет запрос в GigaChat.</p><label>Распознать запись<select value={policy} disabled={phase !== "idle"} onChange={e => setPolicy(e.target.value)}><option value="local">На этом сервере</option><option value="remote">На внешнем worker</option></select></label><div className="ia-toolbar"><button disabled={phase !== "idle"} onClick={speak}>Прослушать Дмитрия</button>{phase === "recording" ? <><span role="status">Запись · {seconds} с</span><button onClick={send}>Отправить запись</button><button onClick={() => { cleanup(); setPhase("idle"); }}>Отмена</button></> : <button disabled={phase !== "idle"} onClick={start}>{phase === "sending" ? "Распознаём…" : "Записать фразу"}</button>}</div>{error && <p role="alert" className="ia-error">{error}</p>}{result && <div className="ia-notice"><p>{result.silence ? "Речь не обнаружена" : result.transcript}</p><small>{result.provider === "remote" ? "Внешний worker" : "Локальный Whisper"} · {result.seconds} с</small></div>}</section>;
}
