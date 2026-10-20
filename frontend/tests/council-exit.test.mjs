import test from 'node:test';
import assert from 'node:assert/strict';
import {createCallExit} from '../public/council-call/call-exit.mjs';

test('explicit exit saves audio before ending the meeting and navigating',async()=>{
  const events=[];
  const exit=createCallExit({
    finishRecording:async()=>events.push('saved'),
    endCall:async()=>{events.push('end');return {phase:'analysis'};},
    stopMedia:()=>events.push('stop'),
    showResult:async result=>events.push(result.phase),busy:()=>{},
  });
  await exit();
  assert.deepEqual(events,['saved','end','stop','analysis']);
});
test('upload failure preserves the page and allows a successful retry',async()=>{
  let attempts=0,ends=0,navigations=0;
  const exit=createCallExit({
    finishRecording:async()=>{if(++attempts===1)throw Error('offline');},
    endCall:async()=>ends++,stopMedia:()=>{},
    showResult:()=>navigations++,busy:()=>{},
  });
  await assert.rejects(exit(),/offline/);
  assert.equal(ends,0);assert.equal(navigations,0);
  await exit();
  assert.equal(ends,1);assert.equal(navigations,1);
});
test('leader ending the meeting stops employee media, waits for final upload and does not end twice',async()=>{
  const events=[];let resolveUpload;
  const exit=createCallExit({
    finishRecording:()=>new Promise(resolve=>{resolveUpload=resolve;}),
    endCall:async()=>assert.fail('no repeated finish request'),
    stopMedia:()=>events.push('stopped'),
    showResult:()=>events.push('next'),busy:()=>{},
  });
  const first=exit({serverEnded:true});
  assert.equal(first,exit({serverEnded:true}));
  assert.deepEqual(events,['stopped']);
  resolveUpload();await first;
  assert.deepEqual(events,['stopped','stopped','next']);
});
test('server failure does not navigate and exit can be retried',async()=>{
  let attempts=0,navigations=0;
  const exit=createCallExit({
    finishRecording:async()=>{},
    endCall:async()=>{if(++attempts===1)throw Error('server unavailable');},
    stopMedia:()=>{},showResult:()=>navigations++,busy:()=>{},
  });
  await assert.rejects(exit(),/server unavailable/);
  assert.equal(navigations,0);
  await exit();assert.equal(navigations,1);
});
