import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

function StreamVideo({ stream, muted = false, hidden = false, label }) {
  const video = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    video.current.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [stream]);
  return <div className="council-call-video"><video ref={video} autoPlay playsInline muted={muted} style={hidden ? { opacity: 0 } : undefined} aria-label={label} /><b>{label}</b>{blocked && <button onClick={() => video.current.play().then(() => setBlocked(false))}>Включить звук</button>}</div>;
}

export default function CouncilCall({ meetingId, userId, team }) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(false);
  const [level, setLevel] = useState(0);
  const [local, setLocal] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [states, setStates] = useState({});
  const [controls, setControls] = useState({});
  const [peerControls, setPeerControls] = useState({});
  const runtime = useRef(null);
  const mounted = useRef(true);
  const path = `/api/council/${meetingId}`;

  function stop() {
    const run = runtime.current;
    if (run) {
      run.stopped = true;
      clearTimeout(run.timer);
      cancelAnimationFrame(run.frame);
      run.context?.close().catch(() => {});
      run.stream.getTracks().forEach(track => track.stop());
      Object.values(run.peers).forEach(peer => peer.pc.close());
      runtime.current = null;
      api(`${path}/call`, { method: "DELETE" }).catch(() => {});
    }
    if (mounted.current) {
      setConnected(false); setLocal(null); setRemotes({}); setStates({}); setCamera(false); setLevel(0);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [meetingId]);

  async function start() {
    setBusy(true); setError("");
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Для микрофона нужен HTTPS или localhost.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const run = { stream, session: crypto.randomUUID(), peers: {}, cursor: 0, mic: true, camera: false, stopped: false };
      runtime.current = run;
      setLocal(stream); setMic(true);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        run.context = new AudioCtx();
        const analyser = run.context.createAnalyser(); analyser.fftSize = 256;
        run.context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const meter = () => {
          if (run.stopped) return;
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
          if (mounted.current) setLevel(Math.min(100, rms * 400));
          run.frame = requestAnimationFrame(meter);
        };
        meter();
      }
      const signal = (id, kind, payload) => api(`${path}/signal`, { method: "POST", body: { recipient_id: id, kind,
        payload: { ...payload, session: run.session, to_session: run.peers[id]?.session } } });
      function makePeer(person, iceServers) {
        const previous = run.peers[person.user_id];
        if (previous?.session === person.session) return previous;
        previous?.pc.close();
        const pc = new RTCPeerConnection({ iceServers });
        const remoteStream = new MediaStream();
        const peer = { pc, session: person.session, pending: [] };
        run.peers[person.user_id] = peer;
        pc.addTrack(stream.getAudioTracks()[0], stream);
        const transceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        peer.videoSender = transceiver.sender;
        if (stream.getVideoTracks()[0]) peer.videoSender.replaceTrack(stream.getVideoTracks()[0]);
        pc.ontrack = event => {
          remoteStream.addTrack(event.track);
          if (mounted.current) setRemotes(value => ({ ...value, [person.user_id]: remoteStream }));
        };
        pc.onicecandidate = event => {
          if (event.candidate && !run.stopped) signal(person.user_id, "candidate", { candidate: event.candidate.toJSON() }).catch(reason => { if (mounted.current) setError(reason.message); });
        };
        pc.onconnectionstatechange = () => { if (mounted.current) setStates(value => ({ ...value, [person.user_id]: pc.connectionState })); };
        return peer;
      }
      const poll = async () => {
        if (run.stopped) return;
        try {
          await api(`${path}/call`, { method: "PUT", body: { session: run.session, mic: run.mic, camera: run.camera } });
          const snapshot = await api(`${path}/call?after=${run.cursor}`);
          if (run.stopped) return;
          run.controls = snapshot.controls;
          setControls(snapshot.controls);
          setPeerControls(Object.fromEntries(snapshot.peers.map(person => [person.user_id, person])));
          if (snapshot.controls.muted) {
            run.mic = false;
            run.stream.getAudioTracks().forEach(track => { track.enabled = false; });
            setMic(false);
          }
          if (snapshot.controls.camera_blocked && run.camera) {
            run.camera = false;
            for (const peer of Object.values(run.peers)) await peer.videoSender.replaceTrack(null);
            run.stream.getVideoTracks().forEach(track => { track.stop(); run.stream.removeTrack(track); });
            setCamera(false); setLocal(new MediaStream(run.stream.getTracks()));
          }
          const online = snapshot.peers.filter(person => person.user_id !== userId);
          for (const [id, peer] of Object.entries(run.peers)) {
            if (!online.some(person => person.user_id === Number(id))) {
              peer.pc.close(); delete run.peers[id];
              setRemotes(value => { const next = { ...value }; delete next[id]; return next; });
              setStates(value => { const next = { ...value }; delete next[id]; return next; });
            }
          }
          for (const person of online) {
            const isNew = run.peers[person.user_id]?.session !== person.session;
            const peer = makePeer(person, snapshot.iceServers);
            if (isNew && userId < person.user_id) {
              await peer.pc.setLocalDescription(await peer.pc.createOffer());
              await signal(person.user_id, "offer", { description: peer.pc.localDescription.toJSON() });
            }
          }
          for (const event of snapshot.signals) {
            const peer = run.peers[event.author_id], data = event.payload;
            if (data.to_session === run.session && peer?.session === data.session) {
              if (event.kind === "offer") {
                await peer.pc.setRemoteDescription(data.description);
                for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
                await peer.pc.setLocalDescription(await peer.pc.createAnswer());
                await signal(event.author_id, "answer", { description: peer.pc.localDescription.toJSON() });
              } else if (event.kind === "answer" && peer.pc.signalingState === "have-local-offer") {
                await peer.pc.setRemoteDescription(data.description);
                for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
              } else if (event.kind === "candidate") {
                if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
                else peer.pending.push(data.candidate);
              }
            }
            run.cursor = event.id;
          }
          if (mounted.current) setError("");
        } catch (reason) { if (mounted.current && !run.stopped) { stop(); setError(reason.message); } }
        finally { if (!run.stopped) run.timer = setTimeout(poll, 2000); }
      };
      setConnected(true);
      await poll();
    } catch (reason) {
      stream?.getTracks().forEach(track => track.stop()); stop();
      if (mounted.current) setError(reason.name === "NotAllowedError" ? "Разрешите доступ к микрофону в настройках браузера и попробуйте снова." : reason.message);
    } finally { if (mounted.current) setBusy(false); }
  }

  function toggleMic() {
    const run = runtime.current;
    if (!run || run.controls?.muted) return;
    run.mic = !run.mic;
    run.stream.getAudioTracks().forEach(track => { track.enabled = run.mic; });
    setMic(run.mic);
  }

  async function toggleCamera() {
    const run = runtime.current;
    if (!run || busy || run.controls?.camera_blocked) return;
    setBusy(true);
    try {
      if (run.camera) {
        for (const peer of Object.values(run.peers)) await peer.videoSender.replaceTrack(null);
        run.stream.getVideoTracks().forEach(track => { track.stop(); run.stream.removeTrack(track); });
        run.camera = false;
      } else {
        const video = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 360 } } });
        if (run.stopped || run.controls?.camera_blocked) { video.getTracks().forEach(track => track.stop()); return; }
        const track = video.getVideoTracks()[0]; run.stream.addTrack(track);
        for (const peer of Object.values(run.peers)) await peer.videoSender.replaceTrack(track);
        run.camera = true;
      }
      setCamera(run.camera); setLocal(new MediaStream(run.stream.getTracks())); setError("");
    } catch (reason) { setError(`Не удалось включить камеру: ${reason.message}`); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <section className="council-panel council-call"><h2>Общий разговор</h2>
    <p>Микрофон включается по кнопке. Камера — по желанию. Звонок не записывается.</p>
    {(controls.muted || controls.camera_blocked) && <p className="council-note">Организатор ограничил {controls.muted ? "микрофон и сообщения" : ""}{controls.muted && controls.camera_blocked ? " и " : ""}{controls.camera_blocked ? "камеру" : ""}. После снятия ограничения включите устройство сами.</p>}
    {error && <p role="alert">{error}</p>}
    {!connected ? <button className="council-button" disabled={busy} onClick={start}>{busy ? "Подключаем…" : "Подключить микрофон"}</button> : <>
      <div className="council-action-row"><button disabled={controls.muted} aria-pressed={mic} onClick={toggleMic}>{mic ? "Выключить микрофон" : "Включить микрофон"}</button><button disabled={busy || controls.camera_blocked} aria-pressed={camera} onClick={toggleCamera}>{camera ? "Выключить камеру" : "Включить камеру"}</button><button onClick={stop}>Отключиться</button></div>
      <label className="council-mic-meter">Проверка микрофона <meter min="0" max="100" value={mic ? level : 0} />{mic ? "Скажите несколько слов" : "Микрофон выключен"}</label>
      <div className="council-call-grid"><StreamVideo stream={local} muted label="Вы" />{Object.entries(remotes).map(([id, stream]) => <StreamVideo key={id} stream={stream} muted={peerControls[id]?.muted} hidden={peerControls[id]?.camera_blocked} label={team.find(person => person.user_id === Number(id))?.name || "Ведущий"} />)}</div>
      <p role="status">{Object.values(states).filter(value => value === "connected").length} собеседников подключено. {Object.values(states).some(value => value === "failed") && "Связь прервалась. Отключитесь и подключитесь снова."}</p>
    </>}
  </section>;
}
