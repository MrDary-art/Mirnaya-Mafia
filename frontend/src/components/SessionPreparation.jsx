import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function clock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SessionPreparation({ job, topic }) {
  const [elapsed, setElapsed] = useState(0);
  const dialog = useRef(null);
  const estimate = job ? 30 : 15;
  const remaining = Math.max(0, estimate - elapsed);

  useEffect(() => {
    const startedAt = performance.now();
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    return () => {
      window.clearInterval(timer);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="session-preparation-overlay">
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="session-preparation-title" aria-describedby="session-preparation-description" className="session-preparation-card">
        <div className="session-preparation-heading">
          <div className="session-preparation-orb" aria-hidden="true"><span>✦</span></div>
          <div>
            <p className="session-preparation-eyebrow">ПОДГОТОВКА ДИАЛОГА</p>
            <h2 id="session-preparation-title">ИИ анализирует ваш запрос</h2>
          </div>
        </div>

        <p id="session-preparation-description" className="session-preparation-description">
          Подбираем подходящий сценарий для вас{job ? ", изучаем профессию и готовим вопросы." : " и определяем, как оценить результат беседы."}
        </p>

        <div className="session-preparation-topic">
          <span>ВАША ТЕМА</span>
          <p>{topic.slice(0, 180)}</p>
        </div>

        <div className="session-preparation-activity" role="status">
          <span className="session-preparation-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{remaining ? "Подготовка идёт" : "Подготовка занимает чуть больше обычного"}</span>
        </div>
        <div className="session-preparation-track" aria-hidden="true"><span /></div>

        <div className="session-preparation-times">
          <div>
            <span>ОСТАЛОСЬ ОРИЕНТИРОВОЧНО</span>
            <strong>{remaining ? `~ ${clock(remaining)}` : "Ещё немного"}</strong>
          </div>
          <div>
            <span>ПРОШЛО</span>
            <strong>{clock(elapsed)}</strong>
          </div>
        </div>
        <p className="session-preparation-footnote">Ориентир — около {estimate} секунд. Разговор откроется автоматически, когда подготовка завершится.</p>
      </section>
    </div>,
    document.body,
  );
}
