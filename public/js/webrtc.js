export async function startLocal(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  if (videoEl) {
    videoEl.srcObject = stream;
    videoEl.muted = true;
    await videoEl.play().catch(() => {});
  }
  return stream;
}

export function createPeer({ stream, onRemote, onSignal }) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  if (stream) {
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) onSignal({ candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    onRemote(e.streams[0]);
  };

  return {
    pc,
    async offer() {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSignal({ sdp: pc.localDescription });
    },
    async handle(data) {
      if (data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          onSignal({ sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          /* ignore race */
        }
      }
    },
    close() {
      pc.close();
    },
  };
}
