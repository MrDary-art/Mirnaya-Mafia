import { useState } from "react";
import { api } from "../api";

export default function CouncilProcessing({ data, meetingId, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (data.status !== "finished" || !data.audio_analysis || data.audio_analysis.status === "complete") return null;
  const status = data.audio_analysis?.status || "waiting";
  async function retry() {
    setBusy(true);setError("");
    try {
      await api(`/api/council-runtime/${meetingId}/analyze`, { method: "POST", body: {} });
      await reload();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="council-panel council-processing" aria-labelledby="processing-title">
    <span className="council-kicker">ВСТРЕЧА ЗАВЕРШЕНА</span>
    <h2 id="processing-title">{status === "error" ? "Не удалось подготовить отчёт" : "Готовим отчёт"}</h2>
    <p role="status">{({
      waiting: "Сохраняем последние записи участников.",
      queued: "Записи сохранены. Ожидаем свободного места в очереди расшифровки.",
      processing: "Whisper расшифровывает речь, затем готовится разбор по сохранённым репликам.",
      error: "Записи сохранены. Руководитель может повторить обработку.",
    })[status] || "Обрабатываем записи встречи."}</p>
    <p>Результат появится здесь автоматически. Отчёт учитывает только сохранённые реплики — отсутствие записи не означает отсутствие участия.</p>
    {status === "error" && data.can_manage && <button className="council-button" disabled={busy} onClick={retry}>{busy ? "Запускаем…" : "Повторить обработку"}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
