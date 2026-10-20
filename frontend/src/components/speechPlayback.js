function speechBlob(encoded) {
  if (encoded instanceof Blob) return encoded;
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return new Blob([bytes], { type: "audio/wav" });
}

export async function playEncodedSpeech(sentence, encoded, onProgress, signal, context) {
  if (signal?.aborted) return;
  const blob = speechBlob(encoded);
  if (context?.state === "running") {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (signal?.aborted) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    let stop;
    try {
      await new Promise(resolve => {
        stop = () => { source.stop(); resolve(); };
        source.onended = resolve;
        signal?.addEventListener("abort", stop, { once: true });
        source.start();
      });
      if (!signal?.aborted) onProgress?.(sentence);
    } finally {
      signal?.removeEventListener("abort", stop);
      source.onended = null;
      source.disconnect();
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  let frame = 0;
  let stop;
  try {
    await new Promise((resolve, reject) => {
      stop = () => { audio.pause(); resolve(); };
      signal?.addEventListener("abort", stop, { once: true });
      const reveal = () => {
        const fraction = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
        onProgress?.(sentence.slice(0, Math.floor(sentence.length * fraction)));
        if (!audio.paused && !audio.ended) frame = requestAnimationFrame(reveal);
      };
      audio.onended = resolve;
      audio.onerror = () => reject(new Error("Не удалось воспроизвести голос. Попробуйте озвучить ответ ещё раз."));
      audio.play().then(() => { frame = requestAnimationFrame(reveal); }).catch(cause => {
        reject(cause.name === "NotAllowedError" ? new Error("Браузер заблокировал звук. Разрешите воспроизведение звука для этого сайта.") : cause);
      });
    });
    if (!signal?.aborted) onProgress?.(sentence);
  } finally {
    cancelAnimationFrame(frame);
    signal?.removeEventListener("abort", stop);
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    URL.revokeObjectURL(url);
  }
}
