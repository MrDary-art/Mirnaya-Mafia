import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import FriendsWorkspace from "./FriendsWorkspace.jsx";
import "./messages-overlay.css";

export default function MessagesOverlay({ onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const closeOnEscape = event => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", closeOnEscape);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(<div className="messages-overlay-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} id="messages-overlay" className="messages-overlay-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="messages-overlay-header"><h2 id={titleId}>Сообщения</h2><button ref={closeRef} type="button" onClick={onClose} aria-label="Закрыть сообщения"><XIcon size={20} aria-hidden="true" /></button></header>
      <div className="messages-overlay-body"><FriendsWorkspace overlay onDismiss={onClose} /></div>
    </section>
  </div>, document.body);
}
