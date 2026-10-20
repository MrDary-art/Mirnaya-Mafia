// WebSocket delivery and HTTP catch-up can contain the same signal.
// SDP operations must finish before the next offer, answer or ICE candidate.
export function createSignalReceiver(apply, onError) {
  const seen = new Set();
  let queue = Promise.resolve();
  return (event) => {
    if (event.event_id && seen.has(event.event_id)) return queue;
    if (event.event_id) seen.add(event.event_id);
    queue = queue.then(() => apply(event)).catch(onError);
    return queue;
  };
}

// Some browsers emit streamless RTCTrackEvents. Keep audio and video together.
export function collectRemoteTrack(stream, event) {
  const tracks = event.streams?.[0]?.getTracks() || [event.track];
  for (const track of tracks) {
    if (track && !stream.getTracks().some(item => item.id === track.id)) stream.addTrack(track);
  }
  return stream;
}
