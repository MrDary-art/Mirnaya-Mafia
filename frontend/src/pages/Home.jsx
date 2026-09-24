import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { api } from "../api.js";

const formats = [
  { path: "/ai", label: "ИИ", description: "Практикуйтесь с ИИ", Icon: SparkleIcon },
  { path: "/rooms", label: "1×1", description: "Разговор с человеком", Icon: UsersThreeIcon },
  { path: "/scenarios", label: "Сценарии", description: "Реальные ситуации", Icon: SquaresFourIcon },
  { path: "/training", label: "Обучение", description: "Навыки и практика", Icon: BooksIcon },
];

export default function Home() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState(null);
  const [dailyError, setDailyError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/profile").then((profile) => setDaily(profile.daily_challenge || {})).catch(() => setDaily({}));
  }, []);

  async function startDaily() {
    setBusy(true);
    setDailyError("");
    try {
      const session = await api("/api/daily-challenge/start", { method: "POST" });
      navigate(`/play/${session.id}`);
    } catch {
      setDailyError("Задание пока недоступно. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nova-home">
      <header className="nova-home-header">
        <div className="nova-wordmark" aria-label="Арена переговоров"><strong>ARENA</strong><span>NEGOTIATIONS</span></div>
        <p>Лучшие переговоры<br />начинаются с практики.</p>
      </header>

      <section className="nova-home-hero" aria-labelledby="home-title">
        <div className="nova-home-copy">
          <span className="nova-eyebrow">БОЛЬШЕ УВЕРЕННОСТИ В ВАЖНЫХ РАЗГОВОРАХ</span>
          <h1 id="home-title" tabIndex="-1">Не каждый сложный разговор<br className="nova-desktop-break" /> нужно проходить впервые.</h1>
          <p className="nova-home-subtitle">Потренируйте его здесь.</p>
          <div className="nova-home-actions">
            <button className="nova-button nova-button-primary" onClick={() => navigate("/ai")}>Начать практику <ArrowRightIcon size={20} aria-hidden="true" /></button>
            <a className="nova-text-link" href="#how-it-works">Как это работает</a>
          </div>
        </div>
        <div className="nova-home-visual-note" aria-hidden="true">
          <span>OBSERVE</span><span>DECIDE</span><span>ACT</span>
        </div>
        <div className="nova-home-corner-copy" aria-hidden="true">БОЛЬШЕ ПРОЗРАЧНОСТИ<br />БОЛЬШЕ ВОЗМОЖНОСТЕЙ<br />БОЛЬШЕ ВАС</div>
      </section>

      <nav className="nova-format-bar" aria-label="Формат практики">
        {formats.map(({ path, label, description, Icon }) => (
          <button key={path} className="nova-format" onClick={() => navigate(path)}>
            <Icon size={32} weight="light" aria-hidden="true" />
            <span className="nova-format-copy"><strong>{label}</strong><small>{description}</small></span>
            <ArrowRightIcon className="nova-format-arrow" size={18} aria-hidden="true" />
          </button>
        ))}
      </nav>

      <section className="nova-home-lower" id="how-it-works">
        <div className="nova-home-story">
          <span className="nova-eyebrow">НАШ ПОДХОД</span>
          <h2>Сначала увидеть.<br />Затем понять.<br />Потом действовать.</h2>
          <p>Проведите разговор в безопасной среде, увидьте последствия своих решений и войдите в настоящую встречу подготовленнее.</p>
        </div>
        <div className="nova-daily-capsule">
          <span className="nova-eyebrow">ЕЖЕДНЕВНАЯ ПРАКТИКА</span>
          <h3>Один разговор. Один новый навык.</h3>
          <p>{daily ? `Около ${daily.minutes || 3} минут · +${daily.reward || 2} звезды` : "Загружаем задание…"}</p>
          <button className="nova-button nova-button-secondary" onClick={startDaily} disabled={busy || !daily}>
            {busy ? "Открываем…" : "Начать задание"} <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
          {dailyError && <p className="nova-inline-error" role="alert">{dailyError}</p>}
        </div>
      </section>
    </div>
  );
}
