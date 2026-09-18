export function VoiceBars() {
  return <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export default function LiveChatBubble({ own = false, label, text, status, delivered = false, voice = false, loading = false }) {
  return <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${own ? "bg-cyan-300/15" : "bg-white/[.07]"}`}>
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><span>{label}</span>{voice && <VoiceBars />}</div>
      {loading ? <span className="voice-dots" aria-label="ИИ отвечает">•••</span> : <div className="whitespace-pre-wrap leading-relaxed">{text}</div>}
      {own && <div className="mt-1 text-right text-xs text-cyan-200/80" aria-label={delivered || status === "delivered" ? "Доставлено ИИ" : status === "sent" ? "Отправлено" : "Отправляется"}>{delivered || status === "delivered" ? "✓✓" : status === "sent" ? "✓" : status === "error" ? "!" : "◌"}</div>}
    </div>
  </div>;
}
