import { useEffect, useRef, useState } from "react";
import { api, apiAudio } from "../api.js";
import { pcm16 } from "./VoiceConversation.jsx";

const THRESHOLD = 0.018;

export default function PeerCall({ room, onTranscript }) {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const stream = useRef(null);
  const rtc = useRef(null);
  const capture = useRef(null);
  const after = useRef(0);
  const pendingCandidates = useRef([]);
  const audioChunks = useRef([]);
  const preRoll = useRef([]);
  const speechStart = useRef(0);
  const lastVoice = useRef(0);
  const uploadQueue = useRef([]);
  const uploading = useRef(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [status, setStatus] = useState("Готов к звонку");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  async function signal(kind, data) {
    await api(`/api/rooms/${room.id}/signal`, { method: "POST", body: { kind, data } });
  }

  async function flushUploads() {
    if (uploading.current) return;
    uploading.current = true;
    try {
      while (uploadQueue.current.length && stream.current) {
        const pcm = uploadQueue.current.shift();
        setPending(uploadQueue.current.length);
        try {
          const result = await apiAudio(`/api/rooms/${room.id}/voice`, pcm);
          if (!result.silence) await onTranscript?.();
        } catch (e) { setError(e.message); }
      }
    } finally {
      uploading.current = false;
      if (uploadQueue.current.length && stream.current) flushUploads();
    }
  }

  function onAudio(data) {
    if (!capture.current || !stream.current) return;
    const now = performance.now();
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    preRoll.current.push(data);
    if (preRoll.current.length > 5) preRoll.current.shift();
    if (rms >= THRESHOLD) {
      if (!speechStart.current) { speechStart.current = now; audioChunks.current = [...preRoll.current]; }
      else audioChunks.current.push(data);
      lastVoice.current = now;
    } else if (speechStart.current) audioChunks.current.push(data);
    if (speechStart.current && (now - lastVoice.current >= 700 || now - speechStart.current >= 30000)) {
      const samples = audioChunks.current;
      const rate = capture.current.context.sampleRate;
      speechStart.current = 0;
      audioChunks.current = [];
      preRoll.current = [];
      if (samples.length * data.length / rate >= 0.3) {
        uploadQueue.current.push(pcm16(samples, rate));
        setPending(uploadQueue.current.length);
        flushUploads();
      }
    }
  }

  async function start() {
    setError(""); setStatus("Подключаю камеру и микрофон");
    let media;
    let context;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Для звонка нужен localhost или HTTPS и доступ к микрофону");
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: true });
        setHasCamera(true);
      } catch (e) {
        if (e.name !== "NotFoundError" && e.name !== "OverconstrainedError") throw e;
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        setHasCamera(false);
      }
      stream.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      const peer = new RTCPeerConnection({ iceServers: [] });
      rtc.current = peer;
      media.getTracks().forEach((track) => peer.addTrack(track, media));
      peer.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; };
      peer.onicecandidate = (event) => { if (event.candidate) signal("candidate", event.candidate.toJSON()).catch((e) => setError(e.message)); };
      peer.onconnectionstatechange = () => setStatus(peer.connectionState === "connected" ? "Звонок идёт" : `Соединение: ${peer.connectionState}`);
      context = new AudioContext();
      await context.audioWorklet.addModule("/voice-worklet.js");
      await context.resume();
      const source = context.createMediaStreamSource(media);
      const node = new AudioWorkletNode(context, "voice-capture");
      node.port.onmessage = (event) => onAudio(event.data);
      source.connect(node);
      node.connect(context.destination);
      capture.current = { context, source, node };
      setConnected(true);
      setStatus("Подключаем собеседника");
      if (room.your_id === room.host_id) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await signal("offer", { type: offer.type, sdp: offer.sdp });
      }
    } catch (e) {
      media?.getTracks().forEach((track) => track.stop());
      context?.close();
      rtc.current?.close();
      rtc.current = null;
      stream.current = null;
      setError(e.name === "NotAllowedError" ? "Разрешите доступ к камере и микрофону" : e.message);
      setStatus("Готов к звонку");
    }
  }

  function stop() {
    rtc.current?.close();
    rtc.current = null;
    capture.current?.node.disconnect();
    capture.current?.source.disconnect();
    capture.current?.context.close();
    capture.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    uploadQueue.current = [];
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setConnected(false);
    setPending(0);
    setStatus("Звонок завершён");
  }

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    async function poll() {
      try {
        const events = await api(`/api/rooms/${room.id}/signals?after=${after.current}`);
        const peer = rtc.current;
        if (!alive || !peer) return;
        for (const event of events) {
          after.current = Math.max(after.current, event.id);
          if (event.kind === "offer" && room.your_id !== room.host_id) {
            await peer.setRemoteDescription(event.data);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await signal("answer", { type: answer.type, sdp: answer.sdp });
          } else if (event.kind === "answer" && room.your_id === room.host_id && !peer.remoteDescription) {
            await peer.setRemoteDescription(event.data);
          } else if (event.kind === "candidate") {
            if (peer.remoteDescription) await peer.addIceCandidate(event.data);
            else pendingCandidates.current.push(event.data);
          }
          if (peer.remoteDescription && pendingCandidates.current.length) {
            for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
          }
        }
      } catch (e) { if (alive) setError(e.message); }
    }
    poll();
    const timer = window.setInterval(poll, 850);
    return () => { alive = false; window.clearInterval(timer); };
  }, [connected, room.id, room.host_id, room.your_id]);
  useEffect(() => () => { rtc.current?.close(); stream.current?.getTracks().forEach((track) => track.stop()); capture.current?.context.close(); }, []);

  function toggleMute() {
    const next = !muted;
    stream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }
  function toggleCamera() {
    const next = !cameraOff;
    stream.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  }

  return <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-4">
    <div className="grid gap-3 sm:grid-cols-2"><video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full rounded-2xl bg-slate-900 object-cover" /><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full rounded-2xl bg-slate-900 object-cover" /></div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><span role="status" className="mr-auto text-sm text-slate-300">{status}{connected && !hasCamera ? " · камера не найдена, только звук" : ""}{pending ? ` · аудио в очереди: ${pending}` : ""}</span>{!connected ? <button onClick={start} className="primary-button">◉ Войти в звонок</button> : <><button onClick={toggleMute} className="rounded-xl border border-white/15 px-3 py-2 text-sm">{muted ? "Включить микрофон" : "Выключить микрофон"}</button>{hasCamera && <button onClick={toggleCamera} className="rounded-xl border border-white/15 px-3 py-2 text-sm">{cameraOff ? "Включить камеру" : "Выключить камеру"}</button>}<button onClick={stop} className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200">Выйти из звонка</button></>}</div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
  </div>;
}
