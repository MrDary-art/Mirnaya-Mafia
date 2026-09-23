import { useEffect, useRef, useState } from "react";
import { api, apiAudio, apiBinary, roomSocket } from "../api.js";
import { pcm16 } from "./VoiceConversation.jsx";

const THRESHOLD = 0.018;
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export default function PeerCall({ room, onTranscript, onDeviceReady }) {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const media = useRef(null);
  const rtc = useRef(null);
  const socket = useRef(null);
  const capture = useRef(null);
  const pendingCandidates = useRef([]);
  const liveQueue = useRef([]);
  const liveUploading = useRef(false);
  const audioChunks = useRef([]);
  const preRoll = useRef([]);
  const speechStart = useRef(0);
  const lastVoice = useRef(0);
  const recorder = useRef(null);
  const recordingInfo = useRef(null);
  const recordingQueue = useRef([]);
  const recordingUploading = useRef(false);
  const chunkIndex = useRef(0);
  const segmentId = useRef(crypto.randomUUID());
  const phase = useRef(room.phase);
  const lastSignal = useRef(0);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("Проверьте камеру и микрофон");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  function wsSignal(kind, data, generation = 0) {
    const signal = { kind, data, generation, event_id: crypto.randomUUID() };
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "signal", signal }));
    else return api(`/api/rooms/${room.id}/signal`, { method: "POST", body: signal });
  }

  async function applySignal(event) {
    const peer = rtc.current;
    if (!peer) return;
    if (event.kind === "offer" && room.your_id !== room.host_id) {
      await peer.setRemoteDescription(event.data);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await wsSignal("answer", { type: answer.type, sdp: answer.sdp });
    } else if (event.kind === "answer" && room.your_id === room.host_id && !peer.remoteDescription) {
      await peer.setRemoteDescription(event.data);
    } else if (event.kind === "candidate") {
      if (peer.remoteDescription) await peer.addIceCandidate(event.data);
      else pendingCandidates.current.push(event.data);
    } else if (event.kind === "ice-restart") {
      peer.restartIce();
    }
    if (peer.remoteDescription) {
      for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
    }
  }

  async function flushLive() {
    if (liveUploading.current) return;
    liveUploading.current = true;
    try {
      while (liveQueue.current.length && media.current) {
        const pcm = liveQueue.current.shift(); setPending(liveQueue.current.length + recordingQueue.current.length);
        try { const result = await apiAudio(`/api/rooms/${room.id}/voice`, pcm); if (!result.silence) await onTranscript?.(); }
        catch (e) { setError(e.message); }
      }
    } finally { liveUploading.current = false; }
  }

  function onAudio(data) {
    if (!capture.current || !media.current || phase.current !== "active") return;
    const now = performance.now();
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    preRoll.current.push(data); if (preRoll.current.length > 5) preRoll.current.shift();
    if (rms >= THRESHOLD) {
      if (!speechStart.current) { speechStart.current = now; audioChunks.current = [...preRoll.current]; }
      else audioChunks.current.push(data);
      lastVoice.current = now;
    } else if (speechStart.current) audioChunks.current.push(data);
    if (speechStart.current && (now - lastVoice.current >= 1100 || now - speechStart.current >= 30000)) {
      const samples = audioChunks.current; const rate = capture.current.context.sampleRate;
      speechStart.current = 0; audioChunks.current = []; preRoll.current = [];
      if (samples.length * data.length / rate >= .3 && liveQueue.current.length < 5) {
        liveQueue.current.push(pcm16(samples, rate)); setPending(liveQueue.current.length + recordingQueue.current.length); flushLive();
      }
    }
  }

  async function flushRecording() {
    if (recordingUploading.current || !recordingInfo.current) return;
    recordingUploading.current = true;
    try {
      while (recordingQueue.current.length) {
        const item = recordingQueue.current[0];
        const checksum = hex(await crypto.subtle.digest("SHA-256", await item.blob.arrayBuffer()));
        await apiBinary(`/api/rooms/${room.id}/recordings/${recordingInfo.current.id}/chunks/${segmentId.current}/${item.index}`, item.blob, { headers: { "X-Checksum-Sha256": checksum, "X-Start-Ms": String(item.start), "X-End-Ms": String(item.end) } });
        recordingQueue.current.shift(); setPending(liveQueue.current.length + recordingQueue.current.length);
      }
    } catch (e) { setError(`Запись сохранена локально в очереди: ${e.message}`); }
    finally { recordingUploading.current = false; }
  }

  async function beginRecording(stream) {
    if (!consent || !window.MediaRecorder) return;
    recordingInfo.current = await api(`/api/rooms/${room.id}/recordings`, { method: "POST", body: { consent: true, mime_type: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" } });
    const audioOnly = new MediaStream(stream.getAudioTracks());
    const mimeType = recordingInfo.current.mime_type;
    const rec = new MediaRecorder(audioOnly, { mimeType }); let started = performance.now();
    rec.ondataavailable = (event) => { if (!event.data.size) return; const end = performance.now(); recordingQueue.current.push({ blob: event.data, index: chunkIndex.current++, start: Math.round(started), end: Math.round(end) }); started = end; setPending(liveQueue.current.length + recordingQueue.current.length); flushRecording(); };
    rec.start(4000); recorder.current = rec;
  }

  async function finalizeRecording() {
    if (!recordingInfo.current) return;
    await flushRecording();
    if (recordingQueue.current.length) return;
    await api(`/api/rooms/${room.id}/recordings/${recordingInfo.current.id}/finalize`, { method: "POST", body: { manifest: { segments: [{ id: segmentId.current, chunks: Array.from({ length: chunkIndex.current }, (_, i) => i) }] } } });
  }

  async function start() {
    setError(""); setStatus("Проверяем устройства"); let stream; let context;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Для звонка нужен HTTPS или localhost");
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: true }); setHasCamera(true); }
      catch (e) { if (!["NotFoundError", "OverconstrainedError"].includes(e.name)) throw e; stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); setHasCamera(false); }
      media.current = stream; if (localVideo.current) localVideo.current.srcObject = stream;
      const config = await api(`/api/rooms/${room.id}/ice`);
      const peer = new RTCPeerConnection(config); rtc.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; };
      peer.onicecandidate = (event) => { if (event.candidate) wsSignal("candidate", event.candidate.toJSON()).catch((e) => setError(e.message)); };
      peer.onconnectionstatechange = () => { setStatus(peer.connectionState === "connected" ? "Связь установлена" : `Соединение: ${peer.connectionState}`); if (peer.connectionState === "failed") wsSignal("ice-restart", {}).catch(() => {}); };
      const ws = roomSocket(room.id); socket.current = ws;
      ws.onmessage = (event) => { const payload = JSON.parse(event.data); if (payload.type === "signal") applySignal(payload).catch((e) => setError(e.message)); };
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("Не удалось подключить канал комнаты")); });
      const missed = await api(`/api/rooms/${room.id}/signals?after=${lastSignal.current}`);
      for (const event of missed) { lastSignal.current = Math.max(lastSignal.current, event.id); await applySignal(event); }
      context = new AudioContext(); await context.audioWorklet.addModule("/voice-worklet.js"); await context.resume();
      const source = context.createMediaStreamSource(stream); const node = new AudioWorkletNode(context, "voice-capture");
      const silent = context.createGain(); silent.gain.value = 0; node.port.onmessage = (event) => onAudio(event.data);
      source.connect(node); node.connect(silent); silent.connect(context.destination); capture.current = { context, source, node, silent };
      await beginRecording(stream);
      setConnected(true); setStatus("Устройства готовы"); onDeviceReady?.({ transportReady: true, recordingConsent: consent });
      if (room.your_id === room.host_id) { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await wsSignal("offer", { type: offer.type, sdp: offer.sdp }); }
    } catch (e) {
      stream?.getTracks().forEach((track) => track.stop()); context?.close(); rtc.current?.close(); socket.current?.close();
      rtc.current = null; media.current = null; setError(e.name === "NotAllowedError" ? "Разрешите доступ к камере и микрофону" : e.message); setStatus("Устройства не готовы"); onDeviceReady?.({ transportReady: false, recordingConsent: false });
    }
  }

  async function stop() {
    if (recorder.current?.state === "recording") await new Promise((resolve) => { recorder.current.addEventListener("stop", resolve, { once: true }); recorder.current.stop(); });
    await finalizeRecording().catch((e) => setError(e.message));
    rtc.current?.close(); socket.current?.close(); capture.current?.node.disconnect(); capture.current?.source.disconnect(); capture.current?.silent.disconnect(); capture.current?.context.close(); media.current?.getTracks().forEach((track) => track.stop());
    rtc.current = null; socket.current = null; capture.current = null; media.current = null; recorder.current = null;
    if (localVideo.current) localVideo.current.srcObject = null; if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setConnected(false); setStatus("Звонок завершён"); onDeviceReady?.({ transportReady: false, recordingConsent: consent });
  }

  useEffect(() => { phase.current = room.phase; }, [room.phase]);
  useEffect(() => () => { rtc.current?.close(); socket.current?.close(); media.current?.getTracks().forEach((track) => track.stop()); capture.current?.context.close(); }, []);
  function toggleMute() { const next = !muted; media.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }
  function toggleCamera() { const next = !cameraOff; media.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); }

  return <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
    <div className="grid gap-3 sm:grid-cols-2"><div className="relative"><video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full rounded-2xl bg-slate-900 object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-xs">Вы</span></div><div className="relative"><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full rounded-2xl bg-slate-900 object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-xs">{room.peer_name || "Собеседник"}</span></div></div>
    {!connected && <label className="mt-3 flex items-start gap-3 rounded-2xl border border-white/10 p-3 text-sm text-slate-300"><input type="checkbox" className="mt-1 accent-cyan-300" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><b className="block text-white">Сохранять мой голос для личного разбора</b>Записывается только ваш микрофон. Запись приватна, хранится {7} дней и доступна только вам.</span></label>}
    <div className="mt-3 flex flex-wrap items-center gap-3"><span role="status" className="mr-auto text-sm text-slate-300">{status}{connected && !hasCamera ? " · только звук" : ""}{pending ? ` · в очереди: ${pending}` : ""}</span>{!connected ? <button onClick={start} className="primary-button">Проверить устройства</button> : <><button onClick={toggleMute} className="rounded-xl border border-white/15 px-3 py-2 text-sm">{muted ? "Включить микрофон" : "Выключить микрофон"}</button>{hasCamera && <button onClick={toggleCamera} className="rounded-xl border border-white/15 px-3 py-2 text-sm">{cameraOff ? "Включить камеру" : "Выключить камеру"}</button>}<button onClick={stop} className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200">Выйти из звонка</button></>}</div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
  </div>;
}
