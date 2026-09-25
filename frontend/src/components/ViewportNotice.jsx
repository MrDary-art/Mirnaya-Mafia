import { createPortal } from "react-dom";
import { useEffect } from "react";
import "./viewport-notice.css";

// Render outside ProductPage: its animated transform creates a containing block
// for fixed descendants. Notices must instead be anchored to the browser viewport.
export default function ViewportNotice({ children, onClose, label = "Уведомление", inbox = false }) {
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return createPortal(<aside className={`viewport-notice${inbox ? " viewport-notice--inbox" : ""}`} aria-label={label}>
    <button className="viewport-notice-close" onClick={onClose} aria-label="Закрыть уведомление">×</button>
    <div className="viewport-notice-content">{children}</div>
  </aside>, document.body);
}
