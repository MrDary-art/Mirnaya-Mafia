import { useEffect, useRef } from "react";
import { playEncodedSpeech } from "./VoiceConversation.jsx";

export function useSpeechQueue(enabled, onError) {
  const chain = useRef(Promise.resolve());
  const controller = useRef(new AbortController());
  const allowed = useRef(enabled);
  const error = useRef(onError);
  error.current = onError;
  allowed.current = enabled;
  const stop = () => { controller.current.abort(); controller.current = new AbortController(); };
  useEffect(() => { if (!enabled) stop(); },[enabled]);
  useEffect(() => () => controller.current.abort(),[]);
  return {
    enqueue(text,wav) {
      const signal = controller.current.signal;
      chain.current = chain.current.then(async () => {
        if (allowed.current && !signal.aborted) await playEncodedSpeech(text,wav,null,signal);
      }).catch(cause => error.current?.(cause.message));
    },
    drain: () => chain.current,
    stop,
  };
}
