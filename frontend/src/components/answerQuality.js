export const answerQualityLabels = {
  strong: "Сильный ход",
  acceptable: "Рабочий вариант",
  weak: "Есть риск",
};

export function theoryAnswerQuality(score) {
  if (score === 100) return "strong";
  if (score === 65) return "acceptable";
  return "weak";
}

export function answerFeedbackText(value) {
  const text = value || "";
  const withoutLabel = text.replace(/^(Сильный ход|Рабочий вариант|Есть риск):\s*/, "");
  return withoutLabel === text ? text : withoutLabel.charAt(0).toLocaleUpperCase("ru-RU") + withoutLabel.slice(1);
}
