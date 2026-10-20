// Keep the page (and its unsent recording) alive until saving succeeds.
export function createCallExit({finishRecording, endCall, stopMedia, showResult, busy}) {
  let pending;
  return function exit({serverEnded = false} = {}) {
    if (pending) return pending;
    pending = (async () => {
      busy(true);
      const saving = finishRecording();
      if (serverEnded) stopMedia();
      await saving;
      const result = serverEnded ? null : await endCall();
      stopMedia();
      await showResult(result);
    })().finally(() => { pending = null; busy(false); });
    return pending;
  };
}
