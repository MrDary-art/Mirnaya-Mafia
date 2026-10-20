import { useEffect, useRef, useState } from "react";
import { apiStream } from "../api.js";
import Icon from "./Icon.jsx";
import { useSpeechQueue } from "./useSpeechQueue.js";
import { browserSpeechRecognitionSupported, createBrowserSpeechRecognition } from "./browserSpeechRecognition.js";
export { playEncodedSpeech } from "./speechPlayback.js";

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

function formatDuration(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function VoiceConversation({ sessionId, onTurn, onStreamEvent, onActivity, onPhase, onBeforeStart, disabled=false, speechEnabled=true, compact=false }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [recognized, setRecognized] = useState("");
  const speech = useSpeechQueue(speechEnabled, setError);
  useEffect(() => { onPhase?.(phase); }, [phase]);
  const recognition = useRef(null);
  const transcript = useRef("");
  const segmentText = useRef("");
  const stopping = useRef(false);
  const restartTimer = useRef(null);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const request = useRef(null);
  const runId = useRef(0);
  const submitting = useRef(false);
  const finishTimer = useRef(null);
  const startTimer = useRef(null);
  const replyMuted = useRef(false);

  function stopBrowser() {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const current = recognition.current;
    recognition.current = null;
    current?.abort();
  }

  function clearTimer() {
    window.clearInterval(timer.current);
    timer.current = null;
  }

  function stopRecognition() {
    clearTimer();
    window.clearTimeout(finishTimer.current);
    stopBrowser();
    onActivity?.(false);
  }

  function cancelRequest() {
    runId.current += 1;
    request.current?.abort();
    request.current = null;
  }

  function reset() {
    speech.stop();
    cancelRequest();
    stopRecognition();
    transcript.current = "";
    stopping.current = false;
    setRecognized("");
    setSeconds(0);
    setPhase("idle");
    onStreamEvent?.({ type: "silence" });
  }

  useEffect(() => () => {
    cancelRequest();
    stopRecognition();
  }, [sessionId]);

  function recognitionFailed(message, currentRun) {
    if (currentRun !== runId.current) return;
    stopRecognition();
    stopping.current = false;
    setError(message);
    setPhase("idle");
  }

  function startSegment(currentRun) {
    segmentText.current = "";
    const current = createBrowserSpeechRecognition({
      onStart: () => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        window.clearTimeout(startTimer.current);
        if (!startedAt.current) startedAt.current = performance.now();
        setPhase("recording");
        onActivity?.(true);
      },
      onResult: (finalText, interimText) => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        const text = [finalText, interimText].filter(Boolean).join(" ");
        if (text) segmentText.current = text;
        setRecognized([transcript.current, text].filter(Boolean).join(" "));
      },
      onError: (message, code) => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        if (code !== "no-speech") recognitionFailed(message, currentRun);
      },
      onEnd: () => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        window.clearTimeout(startTimer.current);
        recognition.current = null;
        transcript.current = [transcript.current, current.text() || segmentText.current].filter(Boolean).join(" ").trim();
        setRecognized(transcript.current);
        if (stopping.current || performance.now() - startedAt.current >= MAX_SPEECH_MS) {
          finishRecording(currentRun);
        } else {
          restartTimer.current = window.setTimeout(() => {
            restartTimer.current = null;
            if (currentRun === runId.current && !stopping.current) {
              try { startSegment(currentRun); }
              catch (exc) { recognitionFailed(exc.message, currentRun); }
            }
          }, 150);
        }
      },
    });
    recognition.current = current;
    startTimer.current = window.setTimeout(() => {
      if (currentRun === runId.current && recognition.current === current) recognitionFailed("Браузер не запустил микрофон. Проверьте разрешение на доступ и попробуйте снова.", currentRun);
    }, 30000);
    current.start();
  }

  async function startRecording() {
    if (phase !== "idle" || disabled) return;
    const currentRun = ++runId.current;
    transcript.current = "";
    startedAt.current = 0;
    stopping.current = false;
    submitting.current = false;
    replyMuted.current = false;
    setRecognized("");
    setSeconds(0);
    setError("");
    setPhase("connecting");
    try {
      if (!window.isSecureContext) throw new Error("Для голосового ввода нужен HTTPS или localhost.");
      if (!browserSpeechRecognitionSupported()) throw new Error("Этот браузер не поддерживает распознавание речи. Откройте сайт в браузере с голосовым вводом или напишите ответ текстом.");
      onBeforeStart?.();
      speech.stop();
      if (speechEnabled) speech.prepare();
      startSegment(currentRun);
      timer.current = window.setInterval(() => {
        if (!startedAt.current) return;
        const elapsed = Math.floor((performance.now() - startedAt.current) / 1000);
        setSeconds(elapsed);
        if (elapsed * 1000 >= MAX_SPEECH_MS) sendRecording();
      }, 250);
    } catch (exc) {
      recognitionFailed(exc.name === "NotAllowedError" ? "Разрешите доступ к микрофону в настройках сайта." : exc.message, currentRun);
    }
  }

  function cancelRecording() {
    runId.current += 1;
    stopRecognition();
    transcript.current = "";
    stopping.current = false;
    setRecognized("");
    setSeconds(0);
    setPhase("idle");
  }

  function sendRecording() {
    if (stopping.current || !startedAt.current) return;
    stopping.current = true;
    if (speechEnabled) speech.prepare();
    clearTimer();
    window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    setPhase("transcribing");
    const current = recognition.current;
    if (current) {
      finishTimer.current = window.setTimeout(() => {
        if (submitting.current || !stopping.current) return;
        transcript.current = [transcript.current, current.text() || segmentText.current].filter(Boolean).join(" ").trim();
        finishRecording(runId.current);
      }, 2000);
      try { current.stop(); }
      catch {
        transcript.current = [transcript.current, current.text() || segmentText.current].filter(Boolean).join(" ").trim();
        recognition.current = null;
        finishRecording(runId.current);
      }
    } else finishRecording(runId.current);
  }

  function finishRecording(currentRun) {
    if (currentRun !== runId.current || submitting.current) return;
    submitting.current = true;
    clearTimer();
    window.clearTimeout(finishTimer.current);
    stopBrowser();
    onActivity?.(false);
    const text = transcript.current.trim().slice(0, 2000);
    stopping.current = false;
    if (!text) {
      setError("Речь не распознана. Попробуйте ещё раз или напишите ответ текстом.");
      setPhase("idle");
      return;
    }
    submitTranscript(text, currentRun);
  }

  async function submitTranscript(text, currentRun) {
    const controller = new AbortController();
    request.current = controller;
    setPhase("thinking");
    onStreamEvent?.({ type: "voice_pending" });
    onStreamEvent?.({ type: "transcript_done", text });
    let generated = "";
    let spoken = "";
    let turnResult = null;
    try {
      await apiStream(`/api/sessions/${sessionId}/turn-stream`, {
        body: { text, speak: speechEnabled },
        signal: controller.signal,
        onEvent: async (event) => {
          if (currentRun !== runId.current) return;
          if (event.type === "transcript_delta") {
            setRecognized(previous => `${previous} ${event.text}`.trim());
          } else if (event.type === "transcript_done") {
            setRecognized(event.text);
          } else if (event.type === "silence") {
            setError("Речь не обнаружена. Попробуйте говорить ближе к микрофону.");
          } else if (event.type === "reply_delta") {
            generated += event.text;
            setPhase("thinking");
            onStreamEvent?.({ type:"spoken_progress", text:generated });
          } else if (event.type === "sentence_audio") {
            const prefix = spoken ? `${spoken} ` : "";
            if (!replyMuted.current) {
              setPhase("speaking");
              speech.enqueue(event.text, event.wav);
            }
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
      if (currentRun !== runId.current) return;
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
      if (request.current === controller) request.current = null;
    }
  }

  const labels = {
    connecting: "Запускаю распознавание речи…",
    transcribing: "Отправляю распознанный текст…",
    thinking: "ИИ думает…",
    speaking: "ИИ отвечает голосом…",
  };

  return <div className={`live-voice-panel${compact ? " live-voice-panel-compact" : ""}`}>
    {phase === "idle" && <button type="button" disabled={disabled} className="live-voice-button" onClick={startRecording} aria-label="Ответить голосом" title="Ответить голосом"><Icon name="mic" size={18} />{compact ? null : "Ответить голосом"}</button>}
    {!compact && <p className="w-full text-xs text-slate-400">Нажмите на кнопку «Ответить голосом», затем произнесите вслух ответ и нажмите «Отправить».</p>}
    {phase === "recording" && <><div className="voice-message-recorder" role="status">
      <span className="live-recording-pulse" />
      <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <b>{formatDuration(seconds)}</b>
      <span className="voice-message-hint">Распознаём речь</span>
      <button type="button" className="voice-message-cancel" onClick={cancelRecording}>Отменить</button>
      <button type="button" className="voice-message-send" onClick={sendRecording}>Отправить <Icon name="send" size={16} /></button>
    </div>{recognized && <p className="w-full break-words text-xs text-slate-600" aria-live="polite">{recognized}</p>}</>}
    {phase !== "idle" && phase !== "recording" && <span aria-live="polite" className="live-voice-state active"><span className="live-typing"><span /><span /><span /></span>{labels[phase]}</span>}
    {["connecting", "transcribing"].includes(phase) && <button type="button" className="voice-message-cancel" onClick={reset}>Отменить</button>}
    {["thinking", "speaking"].includes(phase) && speechEnabled && <button type="button" className="voice-message-cancel" onClick={() => { replyMuted.current = true; speech.stop(); setPhase("thinking"); }}>Остановить озвучку</button>}
    {error && <p role="alert" className="w-full text-xs text-rose-300">{error}</p>}
  </div>;
}
