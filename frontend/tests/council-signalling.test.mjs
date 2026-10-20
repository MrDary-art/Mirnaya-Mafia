import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sameSession, sessionPayload, peerConfiguration, candidateKey} from '../public/council-call/signalling.mjs';

test('delayed answer and ICE from a closed peer cannot enter its replacement', () => {
  const old = {signalSession: 'old'}, current = {signalSession: 'new'};
  for (const message of [{type:'answer',sdp:'sdp'}, {candidate:'candidate'}]) {
    assert.equal(sameSession(current, sessionPayload(old, message)), false);
    assert.equal(sameSession(current, sessionPayload(current, message)), true);
  }
  assert.equal(sameSession(undefined, {}), false);
});
test('ICE arriving before its offer is queued by negotiation, not only by user', () => {
  assert.notEqual(candidateKey('41',{councilSession:'old'}),candidateKey('41',{councilSession:'new'}));
  assert.equal(candidateKey('41',{}),'41:legacy');
});
test('Council uses a bundled relay path when TURN is configured, preserving STUN-only installs', () => {
  const servers=[{urls:['turn:example.invalid:3478?transport=tcp'],username:'test',credential:'test'}];
  assert.deepEqual(peerConfiguration(servers),{iceServers:servers,bundlePolicy:'max-bundle',iceTransportPolicy:'relay'});
  assert.equal(peerConfiguration([{urls:'stun:example.invalid'}]).iceTransportPolicy,'all');
});

// Exercise the actual call controller, including HTTP message ordering, without
// accessing real devices or involving the production meeting.
function controller(id) {
  const sent=[],errors=[];
  class Peer {
    signalingState='stable';connectionState='new';remoteDescription=null;
    candidates=[];
    close(){this.connectionState='closed';}
    async addIceCandidate(candidate){this.candidates.push(candidate);}
    async setRemoteDescription(description){
      this.remoteDescription=description;
      this.signalingState=description.type==='offer'?'have-remote-offer':'stable';
    }
    async createAnswer(){return {type:'answer',sdp:'test-answer'};}
    async setLocalDescription(description){
      this.localDescription={...description,toJSON:()=>description};
      this.signalingState=description.type==='offer'?'have-local-offer':'stable';
    }
  }
  const room={me:{id},signals:[],iceServers:[]};
  const context={
    room,peers:new Map(),seen:new Set(),ice:new Map(),remote:new Map(),
    sameSession,sessionPayload,peerConfiguration,candidateKey,
    RTCPeerConnection:Peer,crypto:{randomUUID:()=> 'new'},
    api:async(action,body)=>sent.push(body),attachMedia:async()=>{},
    stream:{getAudioTracks:()=>[]},display:null,cameraTrack:null,
    tiles:()=>{},error:message=>errors.push(message),
  };
  const source=readFileSync(new URL('../public/council-call/call.js',import.meta.url),'utf8');
  vm.runInNewContext(source.slice(source.indexOf('async function send('),source.indexOf('async function replace(')),context);
  return {...context,sent,errors};
}
test('controller preserves early ICE until the matching offer arrives',async()=>{
  const c=controller('42');
  c.room.signals=[
    {id:1,from:'41',kind:'ice',payload:{councilSession:'s1',candidate:'early'}},
    {id:2,from:'41',kind:'offer',payload:{councilSession:'s1',type:'offer',sdp:'offer'}},
  ];
  await c.signals();
  assert.equal(c.peers.get('41').candidates[0].candidate,'early');
  assert.equal(c.sent[0].kind,'answer');
  assert.equal(c.sent[0].payload.councilSession,'s1');
  assert.equal(c.ice.size,0);
  assert.deepEqual(c.errors,[]);
});
test('controller ignores old answers and departures after reconnection',async()=>{
  const c=controller('41'),pc=c.makePeer('42','new');
  await pc.setLocalDescription({type:'offer',sdp:'new-offer'});
  c.room.signals=[
    {id:1,from:'42',kind:'answer',payload:{councilSession:'old',type:'answer',sdp:'old-answer'}},
    {id:2,from:'42',kind:'leave',payload:{councilSession:'old'}},
    {id:3,from:'42',kind:'answer',payload:{councilSession:'new',type:'answer',sdp:'new-answer'}},
  ];
  await c.signals();
  assert.equal(c.peers.get('42'),pc);
  assert.equal(pc.remoteDescription.sdp,'new-answer');
  assert.deepEqual(c.errors,[]);
});
