import { useEffect, useRef, useState } from "react";
import { apiStream } from "../api.js";
import Icon from "./Icon.jsx";
import { useSpeechQueue } from "./useSpeechQueue.js";
import { browserSpeechRecognitionSupported, createBrowserSpeechRecognition } from "./browserSpeechRecognition.js";

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

export default function VoiceConversation({ sessionId, onTurn, onStreamEvent, onActivity, onPhase, disabled=false, speechEnabled=true, compact=false }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [recognized, setRecognized] = useState("");
  const speech = useSpeechQueue(speechEnabled, setError);
  useEffect(() => { onPhase?.(phase); }, [phase]);
  const recognition = useRef(null);
  const networkRetries = useRef(0);
  const transcript = useRef("");
  const stopping = useRef(false);
  const restartTimer = useRef(null);
  const startedAt = useRef(null);
  const timer = useRef(null);
  const request = useRef(null);
  const runId = useRef(0);
  const submitting = useRef(false);
  const finishTimer = useRef(null);
  const startTimer = useRef(null);
  const requestedAt = useRef(0);

  function stopBrowser() {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const current = recognition.current;
    recognition.current = null;
    try { current?.abort(); } catch { /* The browser may already have ended. */ }
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
    const captured = [transcript.current, recognition.current?.text()].filter(Boolean).join(" ").trim();
    stopRecognition();
    transcript.current = captured;
    setRecognized(captured);
    stopping.current = false;
    setError(message);
    setPhase("idle");
  }

  function startSegment(currentRun) {
    const current = createBrowserSpeechRecognition({
      onStart: () => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        window.clearTimeout(startTimer.current);
        if (startedAt.current === null) startedAt.current = performance.now();
        setPhase("recording");
        onActivity?.(true);
      },
      onResult: (finalText, interimText) => {
        if (currentRun === runId.current && recognition.current === current) setRecognized([transcript.current, finalText, interimText].filter(Boolean).join(" "));
      },
      onError: (message, code) => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        if (["network", "aborted"].includes(code) && networkRetries.current < 1 && !stopping.current) {
          networkRetries.current += 1;
          transcript.current = [transcript.current, current.text()].filter(Boolean).join(" ").trim();
          stopBrowser();
          onActivity?.(false);
          setPhase("connecting");
          restartTimer.current = window.setTimeout(() => {
            restartTimer.current = null;
            if (currentRun === runId.current && !stopping.current) {
              try { startSegment(currentRun); }
              catch (exc) { recognitionFailed(exc.message, currentRun); }
            }
          }, 800);
          return;
        }
        if (code !== "no-speech") recognitionFailed(message, currentRun);
      },
      continuous: networkRetries.current === 0,
      onEnd: () => {
        if (currentRun !== runId.current || recognition.current !== current) return;
        window.clearTimeout(startTimer.current);
        recognition.current = null;
        transcript.current = [transcript.current, current.text()].filter(Boolean).join(" ").trim();
        setRecognized(transcript.current);
        if (stopping.current) {
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
      if (currentRun === runId.current && recognition.current === current) recognitionFailed("Браузер не запустил распознавание. Проверьте доступ к микрофону и попробуйте снова.", currentRun);
    }, 15000);
    current.start();
  }

  async function startRecording() {
    if (phase !== "idle" || recognition.current || disabled) return;
    const currentRun = ++runId.current;
    transcript.current = "";
    startedAt.current = null;
    requestedAt.current = performance.now();
    networkRetries.current = 0;
    stopping.current = false;
    submitting.current = false;
    setRecognized("");
    setSeconds(0);
    setError("");
    setPhase("connecting");
    try {
      if (!window.isSecureContext) throw new Error("Для голосового ввода нужен HTTPS или localhost.");
      if (!browserSpeechRecognitionSupported()) throw new Error("Этот браузер не поддерживает распознавание речи. Откройте сайт в браузере с голосовым вводом или напишите ответ текстом.");
      speech.stop();
      startSegment(currentRun);
      timer.current = window.setInterval(() => {
        if (startedAt.current === null) {
          if (performance.now() - requestedAt.current >= 15000) recognitionFailed("Браузер не запустил распознавание. Проверьте доступ к микрофону и попробуйте снова.", currentRun);
          return;
        }
        const elapsed = Math.floor((performance.now() - startedAt.current) / 1000);
        setSeconds(elapsed);
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
    if (stopping.current || startedAt.current === null) return;
    stopping.current = true;
    clearTimer();
    window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    setPhase("transcribing");
    const current = recognition.current;
    if (current) {
      finishTimer.current = window.setTimeout(() => {
        if (submitting.current || !stopping.current) return;
        transcript.current = [transcript.current, current.text()].filter(Boolean).join(" ").trim();
        finishRecording(runId.current);
      }, 2000);
      try { current.stop(); }
      catch {
        transcript.current = [transcript.current, current.text()].filter(Boolean).join(" ").trim();
        recognition.current = null;
        finishRecording(runId.current);
      }
    } else finishRecording(runId.current);
  }

  function finishRecording(currentRun) {
    if (currentRun !== runId.current || submitting.current || !stopping.current) return;
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
    setPhase("thinking");
    const controller = new AbortController();
    request.current = controller;
    onStreamEvent?.({ type: "voice_pending" });
    onStreamEvent?.({ type: "transcript_done", text });
    let generated = "";
    let spoken = "";
    let turnResult = null;
    try {
      await apiStream(`/api/sessions/${sessionId}/turn-stream`, {
        body: { text, speak: speechEnabled },
        speak: speechEnabled,
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
      <span className="voice-message-hint">Отправка только по кнопке</span>
      <button type="button" className="voice-message-cancel" onClick={cancelRecording}>Отменить</button>
      <button type="button" className="voice-message-send" onClick={sendRecording}>Отправить <Icon name="send" size={16} /></button>
    </div></>}
    {phase !== "idle" && phase !== "recording" && <span aria-live="polite" className="live-voice-state active"><span className="live-typing"><span /><span /><span /></span>{labels[phase]}</span>}
    {phase !== "idle" && phase !== "recording" && <button type="button" className="voice-message-cancel" onClick={reset}>Отменить</button>}
    {error && <p role="alert" className="product-error">{error}</p>}
    {phase === "idle" && error && recognized.trim() && <div className="voice-recovery-panel"><p>Распознанный текст сохранён: {recognized}</p><button className="voice-recovery-send" type="button" disabled={disabled} onClick={() => { setError(""); submitTranscript(recognized.trim().slice(0, 2000), ++runId.current); }}>Отправить распознанный текст</button></div>}
  </div>;
}
