export function createVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null;
  let listening = false;

  function pickRuVoice() {
    const voices = synth ? synth.getVoices() : [];
    return (
      voices.find((v) => /ru(-RU)?/i.test(v.lang) && /female|irina|milena|katerina/i.test(v.name)) ||
      voices.find((v) => /ru/i.test(v.lang)) ||
      voices[0]
    );
  }

  return {
    canListen: Boolean(SpeechRecognition),
    canSpeak: Boolean(synth),
    listenOnce() {
      if (!SpeechRecognition) {
        return Promise.reject(new Error("Браузер не поддерживает распознавание речи. Используйте Chrome или введите текст."));
      }
      return new Promise((resolve, reject) => {
        if (listening) {
          recognition.stop();
        }
        recognition = new SpeechRecognition();
        recognition.lang = "ru-RU";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        listening = true;
        recognition.onresult = (e) => {
          listening = false;
          resolve(e.results[0][0].transcript);
        };
        recognition.onerror = (e) => {
          listening = false;
          reject(new Error(e.error === "not-allowed" ? "Нет доступа к микрофону" : e.error));
        };
        recognition.onend = () => {
          listening = false;
        };
        recognition.start();
      });
    },
    stop() {
      if (recognition && listening) recognition.stop();
      listening = false;
      if (synth) synth.cancel();
    },
    speak(text) {
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      u.rate = 1.02;
      u.pitch = 1;
      const voice = pickRuVoice();
      if (voice) u.voice = voice;
      synth.speak(u);
    },
  };
}
