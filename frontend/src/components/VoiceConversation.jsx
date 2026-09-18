import { useEffect, useRef, useState } from "react";
import { apiAudio, apiSpeech } from "../api.js";

const SILENCE_MS = 700;
const MAX_SPEECH_MS = 30000;
const THRESHOLD = 0.018;

export function pcm16(chunks, sampleRate) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const source = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const count = Math.floor(length * 16000 / sampleRate);
  const output = new ArrayBuffer(count * 2);
  const view = new DataView(output);
  for (let i = 0; i < count; i++) {
    const position = i * sampleRate / 16000;
    const left = Math.floor(position);
    const fraction = position - left;
    const sample = (source[left] || 0) * (1 - fraction) + (source[left + 1] || 0) * fraction;
    view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  }
  return output;
}

export default function VoiceConversation({ sessionId, onTurn, voicePath }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const capture = useRef(null);
  const phaseRef = useRef("idle");
  const chunks = useRef([]);
  const started = useRef(0);
  const lastVoice = useRef(0);
  const preceding = useRef([]);
  const runId = useRef(0);
  const queue = useRef([]);
  const processing = useRef(false);
  const playing = useRef(null);
  const [pending, setPending] = useState(0);

  function setVoicePhase(next) {
    phaseRef.current = next;
    setPhase(next);
  }

  function stop() {
    runId.current += 1;
    setVoicePhase("idle");
    window.speechSynthesis?.cancel();
    playing.current?.pause();
    playing.current = null;
    queue.current = [];
    setPending(0);
    const current = capture.current;
    capture.current = null;
    current?.node.disconnect();
    current?.source.disconnect();
    current?.stream.getTracks().forEach((track) => track.stop());
    current?.context.close();
    chunks.current = [];
    preceding.current = [];
  }

  useEffect(() => () => stop(), [sessionId]);

  async function submitUtterance(samples, sampleRate) {
    if (samples.length) queue.current.push(pcm16(samples, sampleRate));
    setPending(queue.current.length);
    if (processing.current) return;
    processing.current = true;
    const turnRun = runId.current;
    try {
      while (queue.current.length && turnRun === runId.current) {
      setVoicePhase("transcribing");
      const pcm = queue.current.shift();
      setPending(queue.current.length);
      const response = await apiAudio(voicePath || `/api/sessions/${sessionId}/voice`, pcm);
      if (!capture.current || turnRun !== runId.current) return;
      if (response.silence) continue;
      setTranscript(response.transcript);
      if (response.result?.finished) {
        await onTurn(response.result);
        stop();
        return;
      }
      setVoicePhase("thinking");
      await onTurn(response.result);
      if (!capture.current || turnRun !== runId.current) return;
      if (response.result?.session?.ai_provider === "offline") {
        setError(`ИИ недоступен: ${response.result.session.ai_error || "проверьте настройки"}`);
        continue;
      }
      setError("");
      const reply = response.result?.session?.free_reply;
      if (!reply) continue;
      setVoicePhase("speaking");
      const blob = await apiSpeech(`/api/sessions/${sessionId}/speak`, reply);
      if (turnRun !== runId.current) return;
      const url = URL.createObjectURL(blob);
      try {
        const audio = new Audio(url);
        playing.current = audio;
        await new Promise((resolve, reject) => {
          audio.onended = resolve;
          audio.onpause = resolve;
          audio.onerror = () => reject(new Error("Не удалось воспроизвести голос"));
          audio.play().catch(reject);
        });
      } finally {
        URL.revokeObjectURL(url);
        playing.current = null;
      }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      processing.current = false;
      if (capture.current) {
        setVoicePhase("listening");
        if (queue.current.length) submitUtterance([], capture.current.context.sampleRate);
      }
    }
  }

  function onAudio(data) {
    if (!capture.current || processing.current) return;
    const now = performance.now();
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    preceding.current.push(data);
    if (preceding.current.length > 5) preceding.current.shift();
    if (rms >= THRESHOLD) {
      if (!started.current) {
        started.current = now;
        chunks.current = [...preceding.current];
      } else {
        chunks.current.push(data);
      }
      lastVoice.current = now;
    } else if (started.current) {
      chunks.current.push(data);
    }
    if (started.current && (now - lastVoice.current >= SILENCE_MS || now - started.current >= MAX_SPEECH_MS)) {
      const samples = chunks.current;
      const sampleRate = capture.current.context.sampleRate;
      started.current = 0;
      chunks.current = [];
      preceding.current = [];
      if (samples.length * data.length / sampleRate >= 0.3) submitUtterance(samples, sampleRate);
    }
  }

  async function start() {
    const currentRun = ++runId.current;
    setError("");
    setVoicePhase("connecting");
    let stream;
    let context;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error("Браузер не поддерживает голосовой режим или требуется HTTPS");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (currentRun !== runId.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      context = new AudioContext();
      await context.audioWorklet.addModule("/voice-worklet.js");
      await context.resume();
      if (currentRun !== runId.current) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "voice-capture");
      node.port.onmessage = (event) => onAudio(event.data);
      source.connect(node);
      node.connect(context.destination);
      capture.current = { stream, context, source, node };
      setVoicePhase("listening");
    } catch (e) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close();
      setError(e.name === "NotAllowedError" ? "Разрешите доступ к микрофону. Текстовый ввод доступен ниже." : e.message);
      setVoicePhase("idle");
    }
  }

  const labels = { idle: "Голос выключен", connecting: "Подключаем микрофон", listening: "Слушаю", transcribing: "Распознаю и отвечаю", thinking: "Обновляю диалог", speaking: "Отвечаю голосом" };
  return <div className="mt-4 rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-5 text-sm">
    <div className="flex items-center gap-3">
      <button className={phase === "idle" ? "primary-button" : "rounded-2xl bg-rose-500/20 px-4 py-3 text-rose-200"} onClick={phase === "idle" ? start : stop}>{phase === "idle" ? "◉ Начать голосовой разговор" : "Завершить звонок"}</button>
      <span aria-live="polite">{labels[phase]}{phase !== "idle" ? ` · микрофон записывает непрерывно${pending ? ` · в очереди: ${pending}` : ""}` : ""}</span>
    </div>
    {transcript && <p className="mt-2 text-slate-300">Вы: {transcript}</p>}
    {error && <p role="alert" className="mt-2 text-rose-300">{error}</p>}
  </div>;
}
