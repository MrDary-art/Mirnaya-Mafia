import { useEffect, useState } from "react";

export function VoiceBars() {
  return <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export function RecordingBubble() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="live-recording"><div className="live-recording-bubble" role="status"><span className="live-recording-pulse" /><VoiceBars /><span>Записываю голос</span><time className="live-recording-time">{time}</time></div></div>;
}

export default function LiveChatBubble({ own = false, label, text, status, delivered = false, voice = false, loading = false, activity }) {
  const receipt = delivered || status === "delivered" ? "✓✓" : status === "sent" ? "✓" : status === "error" ? "!" : "◷";
  const receiptLabel = delivered || status === "delivered" ? "Доставлено собеседнику" : status === "sent" ? "Отправлено" : status === "error" ? "Не отправлено" : "Отправляется";

  return <div className={`live-message ${own ? "live-message-own" : "live-message-peer"}`}>
    {!own && <span className="live-avatar" aria-hidden="true">✦</span>}
    <div className="live-message-column">
      <div className="live-message-name">{label || (own ? "Вы" : "Собеседник")}</div>
      <div className={`live-bubble ${own ? "live-bubble-own" : "live-bubble-peer"} ${loading ? "live-bubble-loading" : ""}`}>
        {loading ? <div className="live-typing" role="status" aria-label={activity || "Собеседник думает"}><span /><span /><span /></div> : <div className="live-bubble-text">{text}</div>}
        {voice && <div className="live-voice-mark"><VoiceBars /><span>{status === "transcribing" ? "Распознаю речь" : "Голосовое сообщение"}</span></div>}
        {own && status !== "transcribing" && <span className="live-receipt" aria-label={receiptLabel} title={receiptLabel}>{receipt}</span>}
      </div>
      {activity && <div className="live-message-activity" role="status">{activity}</div>}
    </div>
  </div>;
}
