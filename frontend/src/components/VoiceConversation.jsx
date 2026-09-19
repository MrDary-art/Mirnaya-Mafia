import { useEffect, useRef, useState } from "react";
import { apiStream } from "../api.js";

const SILENCE_STORAGE_KEY = "arena_voice_pause_seconds";
const DEFAULT_SILENCE_SECONDS = 2.5;
const TAIL_SILENCE_MS = 200;
const MAX_SPEECH_MS = 30000;
const THRESHOLD = 0.018;

function savedSilenceSeconds() {
  try {
    const value = Number(window.localStorage.getItem(SILENCE_STORAGE_KEY));
    return value >= 1 && value <= 5 ? value : DEFAULT_SILENCE_SECONDS;
  } catch {
    return DEFAULT_SILENCE_SECONDS;
  }
}

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

export default function VoiceConversation({ sessionId, onTurn, onStreamEvent, onActivity }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [silenceSeconds, setSilenceSeconds] = useState(savedSilenceSeconds);
  const silenceMs = useRef(silenceSeconds * 1000);
  const capture = useRef(null);
  const phaseRef = useRef("idle");
  const chunks = useRef([]);
  const started = useRef(0);
  const lastVoice = useRef(0);
  const preceding = useRef([]);
  const voicedChunkCount = useRef(0);
  const runId = useRef(0);
  const queue = useRef([]);
  const processing = useRef(false);
  const playing = useRef(null);
  const request = useRef(null);

  function setVoicePhase(next) {
    if (next === "speaking") {
      started.current = 0;
      chunks.current = [];
      preceding.current = [];
      voicedChunkCount.current = 0;
      onActivity?.(false);
    }
    phaseRef.current = next;
    setPhase(next);
  }

  function stop() {
    runId.current += 1;
    request.current?.abort();
    request.current = null;
    playing.current?.pause();
    playing.current = null;
    queue.current = [];
    processing.current = false;
    setPending(0);
    const current = capture.current;
    capture.current = null;
    current?.node.disconnect();
    current?.source.disconnect();
    current?.stream.getTracks().forEach((track) => track.stop());
    current?.context.close();
    chunks.current = [];
    preceding.current = [];
    voicedChunkCount.current = 0;
    started.current = 0;
    onActivity?.(false);
    setVoicePhase("idle");
  }

  useEffect(() => () => stop(), [sessionId]);

  function changeSilenceSeconds(event) {
    const next = Number(event.target.value);
    silenceMs.current = next * 1000;
    setSilenceSeconds(next);
    try { window.localStorage.setItem(SILENCE_STORAGE_KEY, String(next)); } catch { /* The setting still applies to this call. */ }
  }

  async function playSentence(sentence, encoded, prefix, turnRun) {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    const audio = new Audio(url);
    playing.current = audio;
    setVoicePhase("speaking");
    try {
      await new Promise((resolve, reject) => {
        let frame = 0;
        let lastCharacters = -1;
        const reveal = () => {
          if (turnRun !== runId.current) return;
          const fraction = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
          const characters = Math.floor(sentence.length * fraction);
          if (characters !== lastCharacters) {
            lastCharacters = characters;
            onStreamEvent?.({ type: "spoken_progress", text: prefix + sentence.slice(0, characters) });
          }
          if (!audio.paused && !audio.ended) frame = requestAnimationFrame(reveal);
        };
        audio.onended = () => { cancelAnimationFrame(frame); resolve(); };
        audio.onpause = () => { cancelAnimationFrame(frame); resolve(); };
        audio.onerror = () => { cancelAnimationFrame(frame); reject(new Error("Не удалось воспроизвести голос")); };
        audio.play().then(() => { frame = requestAnimationFrame(reveal); }).catch(reject);
      });
      if (turnRun === runId.current) onStreamEvent?.({ type: "spoken_progress", text: prefix + sentence });
    } finally {
      URL.revokeObjectURL(url);
      playing.current = null;
      if (capture.current && turnRun === runId.current) setVoicePhase("thinking");
    }
  }

  async function submitUtterance(samples, sampleRate) {
    if (samples.length) queue.current.push(pcm16(samples, sampleRate));
    setPending(queue.current.length);
    if (processing.current) return;
    processing.current = true;
    const turnRun = runId.current;
    try {
      while (queue.current.length && turnRun === runId.current) {
        const pcm = queue.current.shift();
        setPending(queue.current.length);
        setVoicePhase("transcribing");
        onStreamEvent?.({ type: "voice_pending" });
        const controller = new AbortController();
        request.current = controller;
        let spoken = "";
        let generated = "";
        let turnResult = null;
        await apiStream(`/api/sessions/${sessionId}/voice-stream`, {
          body: pcm,
          audio: true,
          signal: controller.signal,
          onEvent: async (event) => {
            if (turnRun !== runId.current) return;
            if (event.type === "reply_delta") {
              generated += event.text;
              setVoicePhase("thinking");
            } else if (event.type === "sentence_audio") {
              const prefix = spoken ? `${spoken} ` : "";
              await playSentence(event.text, event.wav, prefix, turnRun);
              spoken = `${prefix}${event.text}`;
            } else if (event.type === "audio_error") {
              setError(event.message);
            } else if (event.type === "done") {
              turnResult = event.result;
            }
            onStreamEvent?.(event);
          },
        });
        request.current = null;
        if (turnRun !== runId.current) return;
        if (turnResult) {
          if (!spoken && generated) onStreamEvent?.({ type: "spoken_progress", text: generated.trim() });
          await onTurn(turnResult);
          if (turnResult.finished) { stop(); return; }
        }
      }
    } catch (exc) {
      if (exc.name !== "AbortError" && turnRun === runId.current) {
        setError(exc.message);
        onStreamEvent?.({ type: "voice_error", message: exc.message });
      }
    } finally {
      processing.current = false;
      if (capture.current && turnRun === runId.current) {
        setVoicePhase("listening");
        if (queue.current.length) submitUtterance([], capture.current.context.sampleRate);
      }
    }
  }

  function onAudio(data) {
    if (!capture.current || phaseRef.current === "speaking") return;
    const now = performance.now();
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    preceding.current.push(data);
    if (preceding.current.length > 5) preceding.current.shift();
    if (rms >= THRESHOLD) {
      if (!started.current) {
        started.current = now;
        chunks.current = [...preceding.current];
        onActivity?.(true);
      } else chunks.current.push(data);
      voicedChunkCount.current = chunks.current.length;
      lastVoice.current = now;
    } else if (started.current) chunks.current.push(data);
    if (started.current && (now - lastVoice.current >= silenceMs.current || now - started.current >= MAX_SPEECH_MS)) {
      const sampleRate = capture.current.context.sampleRate;
      const tailChunks = Math.ceil(sampleRate * TAIL_SILENCE_MS / 1000 / data.length);
      const samples = chunks.current.slice(0, voicedChunkCount.current + tailChunks);
      started.current = 0;
      chunks.current = [];
      preceding.current = [];
      voicedChunkCount.current = 0;
      onActivity?.(false);
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
    } catch (exc) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close();
      setError(exc.name === "NotAllowedError" ? "Разрешите доступ к микрофону. Текстовый ввод доступен ниже." : exc.message);
      setVoicePhase("idle");
    }
  }

  const labels = { idle: "Голосовой режим выключен", connecting: "Подключаю микрофон…", listening: "Слушаю вас", transcribing: "Расшифровываю вашу реплику…", thinking: "Собеседник думает…", speaking: "Собеседник говорит" };
  return <div className="live-voice-panel">
    <button type="button" className={`live-voice-button ${phase === "idle" ? "" : "active"}`} onClick={phase === "idle" ? start : stop}><span aria-hidden="true">{phase === "idle" ? "◉" : "■"}</span>{phase === "idle" ? "Начать голосовой разговор" : "Завершить звонок"}</button>
    <span aria-live="polite" className={`live-voice-state ${phase !== "idle" ? "active" : ""}`}>{phase === "listening" ? <span className="live-recording-pulse" /> : phase === "thinking" || phase === "transcribing" ? <span className="live-typing"><span /><span /><span /></span> : null}{labels[phase]}{pending ? ` · ещё реплик в очереди: ${pending}` : ""}</span>
    <details className="live-voice-delay"><summary>Пауза до отправки: {String(silenceSeconds).replace(".", ",")} с</summary><label>Отправить реплику после тишины<input type="range" min="1" max="5" step="0.5" value={silenceSeconds} onChange={changeSilenceSeconds} aria-label="Пауза перед отправкой голосовой реплики, секунды" /></label><div className="live-voice-delay-scale"><span>1 с</span><span>5 с</span></div></details>
    {error && <p role="alert" className="w-full text-xs text-rose-300">{error}</p>}
  </div>;
}
