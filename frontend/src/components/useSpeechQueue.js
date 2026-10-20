import { useEffect, useRef } from "react";
import { playEncodedSpeech } from "./speechPlayback.js";

export function useSpeechQueue(enabled, onError) {
  const chain = useRef(Promise.resolve());
  const controller = useRef(new AbortController());
  const allowed = useRef(enabled);
  const error = useRef(onError);
  const audioContext = useRef(null);
  error.current = onError;
  allowed.current = enabled;
  const stop = () => { controller.current.abort(); controller.current = new AbortController(); };
  useEffect(() => { if (!enabled) stop(); },[enabled]);
  useEffect(() => {
    if (controller.current.signal.aborted) controller.current = new AbortController();
    return () => {
      controller.current.abort();
      audioContext.current?.close().catch(() => {});
      audioContext.current = null;
    };
  },[]);
  return {
    prepare() {
      // Resume during the click, before waiting for an API response.
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      try {
        audioContext.current ||= new Context();
        audioContext.current.resume().catch(() => {});
      } catch { /* HTML audio remains available if Web Audio cannot start. */ }
    },
    enqueue(text,wav) {
      const signal = controller.current.signal;
      chain.current = chain.current.then(async () => {
        if (allowed.current && !signal.aborted) await playEncodedSpeech(text,wav,null,signal,audioContext.current);
      }).catch(cause => { if (!signal.aborted) error.current?.(cause.message); });
    },
    drain: () => chain.current,
    stop,
  };
}
