// Tag every negotiation, including ICE, so delayed HTTP responses cannot attach
// an answer or candidates from a closed connection to its replacement.
export function sameSession(peer, payload) {
  return !!peer && (!payload?.councilSession || peer.signalSession === payload.councilSession);
}

export function sessionPayload(peer, payload) {
  return {...payload, councilSession: peer.signalSession};
}

export function peerConfiguration(iceServers = []) {
  const hasTurn = iceServers.some(server =>
    [].concat(server.urls || []).some(url => /^turns?:/.test(url)));
  return {iceServers, bundlePolicy: 'max-bundle', iceTransportPolicy: hasTurn ? 'relay' : 'all'};
}

export function candidateKey(id, payload) {
  return `${id}:${payload?.councilSession || 'legacy'}`;
}
