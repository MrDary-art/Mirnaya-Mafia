import test from 'node:test';
import assert from 'node:assert/strict';
import {attachMedia, connectionLabel} from '../public/council-call/peer-media.mjs';

function peer() {
  return {
    transceivers: [],
    getTransceivers() { return this.transceivers; },
    addTransceiver(kind) {
      const tr = {receiver: {track: {kind}}, sender: {async replaceTrack(track) { this.track = track; }}};
      this.transceivers.push(tr);return tr;
    },
  };
}
test('initiator creates exactly two transceivers and awaits both tracks', async () => {
  const pc=peer(), audio={kind:'audio'}, video={kind:'video'};
  await attachMedia(pc,{audio,video},true);
  assert.equal(pc.transceivers.length,2);
  assert.equal(pc.transceivers[0].sender.track,audio);
  assert.equal(pc.transceivers[1].sender.track,video);
  await attachMedia(pc,{audio,video},true);
  assert.equal(pc.transceivers.length,2);
});
test('answerer uses offered m-lines, including camera and screen replacement', async () => {
  const pc=peer(), audio={}, camera={}, screen={};
  await attachMedia(pc,{audio,video:camera});
  assert.equal(pc.transceivers.length,0,'do not pre-create unrelated answering m-lines');
  pc.addTransceiver('audio');pc.addTransceiver('video'); // setRemoteDescription
  await attachMedia(pc,{audio,video:camera});
  assert.equal(pc.transceivers.length,2);
  assert.equal(pc.transceivers[0].sender.track,audio);
  assert.equal(pc.transceivers[1].sender.track,camera);
  await attachMedia(pc,{audio,video:screen});
  assert.equal(pc.transceivers[1].sender.track,screen);
  await attachMedia(pc,{});
  assert.equal(pc.transceivers[0].sender.track,null);
  assert.equal(pc.transceivers[1].sender.track,null);
});
test('signalling presence is not reported as a connected media call', () => {
  const members=[{id:'1',inCall:true},{id:'2',inCall:true}];
  const peers=new Map([['2',{connectionState:'connecting'}]]);
  assert.match(connectionLabel(members,'1',peers,false),/0 из 1.*TURN/);
  peers.get('2').connectionState='connected';
  assert.match(connectionLabel(members,'1',peers,false),/Медиасвязь установлена/);
});
