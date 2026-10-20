import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecording} from '../public/council-call/recording.js';

test('a failed finalization can be retried after the user leaves the call', async () => {
  const originals={window:globalThis.window,MediaRecorder:globalThis.MediaRecorder,MediaStream:globalThis.MediaStream};
  class Recorder {
    static isTypeSupported(){return true;}
    start(){this.state='recording';}
    stop(){this.state='inactive';queueMicrotask(()=>this.onstop());}
  }
  globalThis.window={MediaRecorder:Recorder};
  globalThis.MediaRecorder=Recorder;
  globalThis.MediaStream=class {};
  let finalizations=0;
  try {
    const recorder=createRecording({
      api:async action=>{
        if(action==='recordstart')return {id:'test-recording'};
        if(action==='recordfinish'&&++finalizations===1)throw Error('Temporary connection failure');
      },
      getMember:()=>({role:1}),status:()=>{},error:()=>{},uploadBinary:async()=>{},
    });
    await recorder.start({});
    await assert.rejects(recorder.finish(),/Temporary connection failure/);
    assert.equal(recorder.hasFailed(),true,'show recovery even when all chunks were uploaded');
    assert.equal(recorder.hasPending(),true);
    await recorder.finish();
    assert.equal(finalizations,2);
    assert.equal(recorder.hasPending(),false);
    assert.equal(recorder.hasFailed(),false);
  } finally {
    for(const [key,value]of Object.entries(originals)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
