import { useEffect, useRef, useState } from "react";
import { apiStream } from "../api.js";
import Icon from "./Icon.jsx";
import { useSpeechQueue } from "./useSpeechQueue.js";

const MAX_SPEECH_MS = 40000;

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

export async function playEncodedSpeech(sentence, encoded, onProgress, signal) {
  if (signal?.aborted) return;
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const audio = new Audio(url);
  try {
    await new Promise((resolve, reject) => {
      let frame = 0;
      let lastCharacters = -1;
      const stop = () => { cancelAnimationFrame(frame); audio.pause(); resolve(); };
      signal?.addEventListener("abort", stop, { once:true });
      const reveal = () => {
        const fraction = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.min(1, audio.currentTime / audio.duration)
          : 0;
        const characters = Math.floor(sentence.length * fraction);
        if (characters !== lastCharacters) {
          lastCharacters = characters;
          onProgress?.(sentence.slice(0, characters));
        }
        if (!audio.paused && !audio.ended) frame = requestAnimationFrame(reveal);
      };
      audio.onended = () => { signal?.removeEventListener("abort",stop); cancelAnimationFrame(frame); resolve(); };
      audio.onerror = () => { signal?.removeEventListener("abort",stop); cancelAnimationFrame(frame); reject(new Error("Не удалось воспроизвести голос")); };
      audio.play().then(() => { frame = requestAnimationFrame(reveal); }).catch(reject);
    });
    onProgress?.(sentence);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatDuration(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function VoiceConversation({ sessionId, onTurn, onStreamEvent, onActivity, onPhase, disabled=false, speechEnabled=true }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const speech = useSpeechQueue(speechEnabled, setError);
  useEffect(() => { onPhase?.(phase); }, [phase]);
  const capture = useRef(null);
  const chunks = useRef([]);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const request = useRef(null);
  const runId = useRef(0);

  function clearTimer() {
    window.clearInterval(timer.current);
    timer.current = null;
  }

  async function releaseMicrophone() {
    clearTimer();
    const current = capture.current;
    capture.current = null;
    current?.node.disconnect();
    current?.source.disconnect();
    current?.silent.disconnect();
    current?.stream.getTracks().forEach((track) => track.stop());
    await current?.context.close().catch(() => {});
    onActivity?.(false);
  }

  function cancelRequest() {
    runId.current += 1;
    request.current?.abort();
    request.current = null;
  }

  async function reset() {
    speech.stop();
    cancelRequest();
    await releaseMicrophone();
    chunks.current = [];
    setSeconds(0);
    setPhase("idle");
  }

  useEffect(() => () => {
    cancelRequest();
    clearTimer();
    const current = capture.current;
    current?.stream.getTracks().forEach((track) => track.stop());
    current?.context.close().catch(() => {});
  }, [sessionId]);

  async function startRecording() {
    if (phase !== "idle" || disabled) return;
    const currentRun = ++runId.current;
    setError("");
    setPhase("connecting");
    let stream;
    let context;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
        throw new Error("Браузер не поддерживает запись голоса или требуется HTTPS");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (currentRun !== runId.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new AudioContext();
      await context.audioWorklet.addModule("/voice-worklet.js");
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "voice-capture");
      const silent = context.createGain();
      silent.gain.value = 0;
      chunks.current = [];
      node.port.onmessage = (event) => {
        if (capture.current) chunks.current.push(event.data);
      };
      source.connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      capture.current = { stream, context, source, node, silent };
      startedAt.current = performance.now();
      setSeconds(0);
      setPhase("recording");
      onActivity?.(true);
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((performance.now() - startedAt.current) / 1000);
        setSeconds(elapsed);
        if (elapsed * 1000 >= MAX_SPEECH_MS) sendRecording();
      }, 250);
    } catch (exc) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close().catch(() => {});
      setError(exc.name === "NotAllowedError" ? "Разрешите доступ к микрофону и попробуйте снова" : exc.message);
      setPhase("idle");
    }
  }

  async function cancelRecording() {
    await releaseMicrophone();
    chunks.current = [];
    setSeconds(0);
    setPhase("idle");
  }

  async function sendRecording() {
    if (!capture.current) return;
    const samples = chunks.current.slice();
    const sampleRate = capture.current.context.sampleRate;
    const duration = samples.reduce((sum, item) => sum + item.length, 0) / sampleRate;
    chunks.current = [];
    await releaseMicrophone();
    if (duration < 0.3) {
      setError("Голосовое сообщение слишком короткое. Запишите хотя бы одну фразу.");
      setPhase("idle");
      return;
    }
    const currentRun = runId.current;
    const controller = new AbortController();
    request.current = controller;
    setPhase("transcribing");
    onStreamEvent?.({ type: "voice_pending" });
    let generated = "";
    let spoken = "";
    let turnResult = null;
    try {
      await apiStream(`/api/sessions/${sessionId}/voice-stream`, {
        body: pcm16(samples, sampleRate),
        audio: true,
        signal: controller.signal,
        speak: speechEnabled,
        onEvent: async (event) => {
          if (currentRun !== runId.current) return;
          if (event.type === "reply_delta") {
            generated += event.text;
            setPhase("thinking");
            onStreamEvent?.({ type:"spoken_progress", text:generated });
          } else if (event.type === "sentence_audio") {
            const prefix = spoken ? `${spoken} ` : "";
            setPhase("speaking");
            speech.enqueue(event.text, event.wav);
            spoken = `${prefix}${event.text}`;
          } else if (event.type === "audio_error") {
            setError(event.message);
          } else if (event.type === "done") {
            turnResult = event.result;
          }
          onStreamEvent?.(event);
        },
      });
      if (currentRun !== runId.current) return;
      await speech.drain();
      if (!spoken && generated) onStreamEvent?.({ type: "spoken_progress", text: generated.trim() });
      if (turnResult) await onTurn?.(turnResult);
      setSeconds(0);
      setPhase("idle");
    } catch (exc) {
      if (exc.name !== "AbortError" && currentRun === runId.current) {
        setError(exc.message);
        onStreamEvent?.({ type: "voice_error", message: exc.message });
        setPhase("idle");
      }
    } finally {
      request.current = null;
    }
  }

  const labels = {
    connecting: "Подключаю микрофон…",
    transcribing: "Whisper расшифровывает сообщение…",
    thinking: "Собеседник думает…",
    speaking: "Собеседник отвечает голосом…",
  };

  return <div className="live-voice-panel">
    {phase === "idle" && <button type="button" disabled={disabled} className="live-voice-button" onClick={startRecording}><Icon name="mic" size={18} />Записать голосовое</button>}
    {phase === "recording" && <div className="voice-message-recorder" role="status">
      <span className="live-recording-pulse" />
      <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <b>{formatDuration(seconds)}</b>
      <span className="voice-message-hint">Идёт запись</span>
      <button type="button" className="voice-message-cancel" onClick={cancelRecording}>Отменить</button>
      <button type="button" className="voice-message-send" onClick={sendRecording}>Отправить <Icon name="send" size={16} /></button>
    </div>}
    {phase !== "idle" && phase !== "recording" && <span aria-live="polite" className="live-voice-state active"><span className="live-typing"><span /><span /><span /></span>{labels[phase]}</span>}
    {phase !== "idle" && phase !== "recording" && <button type="button" className="voice-message-cancel" onClick={reset}>Отменить</button>}
    {error && <p role="alert" className="w-full text-xs text-rose-300">{error}</p>}
  </div>;
}
