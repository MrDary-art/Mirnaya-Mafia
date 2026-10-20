// The answerer must attach tracks after applying the remote offer, to its
// offered transceivers, rather than to unrelated pre-created m-lines.
export async function attachMedia(pc, tracks, initiate = false) {
  for (const kind of ['audio', 'video']) {
    let transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === kind && !t.stopped);
    if (!transceiver && initiate) transceiver = pc.addTransceiver(kind, {direction: 'sendrecv'});
    if (!transceiver) continue;
    transceiver.direction = 'sendrecv';
    await transceiver.sender.replaceTrack(tracks[kind] || null);
  }
}

export function connectionLabel(members, selfId, peers, hasTurn) {
  const others = members.filter(m => m.inCall && !m.bot && m.id !== selfId);
  if (!others.length) return '● Вы в звонке · ждём собеседника';
  const connected = others.filter(m => peers.get(m.id)?.connectionState === 'connected').length;
  if (connected === others.length) return `● Медиасвязь установлена · ${connected} собеседник(а)`;
  return `Медиасвязь: ${connected} из ${others.length} · соединяем${hasTurn ? '' : ' · TURN не настроен'}`;
}
