import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRemoteTrack, createSignalReceiver } from './peerMedia.js';

test('SDP and ICE delivery is ordered and duplicate event IDs are ignored', async () => {
  const applied = [];
  const receive = createSignalReceiver(async event => {
    await new Promise(resolve => setTimeout(resolve, event.kind === 'offer' ? 15 : 0));
    applied.push(event.kind);
  }, error => { throw error; });
  await Promise.all([receive({event_id:'a', kind:'offer'}), receive({event_id:'b', kind:'candidate'}), receive({event_id:'a', kind:'offer'})]);
  assert.deepEqual(applied, ['offer', 'candidate']);
});
test('a rejected signal does not block later signals', async () => {
  const errors = [], applied = [];
  const receive = createSignalReceiver(async event => {
    if (event.kind === 'bad') throw Error('invalid SDP');
    applied.push(event.kind);
  }, error => errors.push(error.message));
  await receive({kind:'bad'}); await receive({kind:'offer'});
  assert.deepEqual(errors, ['invalid SDP']); assert.deepEqual(applied, ['offer']);
});
test('streamless tracks and stream-associated tracks are combined without duplicates', () => {
  const tracks = [], stream = {getTracks:() => tracks, addTrack:track => tracks.push(track)};
  const video = {id:'video'}, audio = {id:'audio'};
  collectRemoteTrack(stream, {track:video, streams:[]});
  collectRemoteTrack(stream, {track:audio, streams:[{getTracks:() => [video, audio]}]});
  assert.deepEqual(tracks, [video, audio]);
});
