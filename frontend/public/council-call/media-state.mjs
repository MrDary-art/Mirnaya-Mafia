export const isLive=track=>!!track&&track.readyState==='live'&&track.enabled;

// Detach stopped tracks so subsequent enable requests cannot reuse a dead track.
export function releaseTracks(stream,kind){
  for(const track of stream.getTracks().filter(t=>t.kind===kind)){
    track.onended=null;
    track.stop();
    stream.removeTrack(track);
  }
}
