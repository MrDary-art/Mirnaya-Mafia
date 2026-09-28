export function browserSpeechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function speechRecognitionError(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "Разрешите браузеру доступ к микрофону и попробуйте снова.";
  if (code === "audio-capture") return "Микрофон недоступен. Проверьте его подключение.";
  if (code === "network") return "Служба распознавания браузера недоступна. Проверьте подключение и попробуйте снова.";
  if (code === "language-not-supported") return "Браузер не поддерживает распознавание русской речи.";
  return "Не удалось распознать речь. Попробуйте ещё раз или напишите ответ текстом.";
}

export function createBrowserSpeechRecognition({ onStart, onResult, onEnd, onError, continuous = true } = {}) {
  const Recognition = typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) throw new Error("Этот браузер не поддерживает голосовой ввод. Напишите ответ текстом.");
  const recognition = new Recognition();
  recognition.lang = "ru-RU";
  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let finalText = "";
  let interimText = "";
  recognition.onstart = () => onStart?.();
  recognition.onresult = (event) => {
    finalText = "";
    interimText = "";
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) finalText = `${finalText} ${text}`.trim();
      else interimText = `${interimText} ${text}`.trim();
    }
    onResult?.(finalText, interimText);
  };
  recognition.onerror = (event) => onError?.(speechRecognitionError(event.error), event.error);
  recognition.onend = () => onEnd?.();
  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
    text: () => [finalText, interimText].filter(Boolean).join(" ").trim(),
  };
}
