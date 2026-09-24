import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const formats = [
  { path: "/ai", number: "01", icon: "✦", title: "Диалог с ИИ", text: "Настройте цель и отработайте разговор текстом или голосом. После сессии получите подробный разбор.", action: "Настроить разговор" },
  { path: "/rooms", number: "02", icon: "◎", title: "Онлайн 1 на 1", text: "Создайте встречу с человеком или пройдите два независимых интервью с ИИ по одному заданию.", action: "Создать встречу", featured: true },
  { path: "/scenarios", number: "03", icon: "◫", title: "Готовые сценарии", text: "Практикуйте деловые ситуации с ветвлениями, метриками и разными исходами без внешнего ИИ.", action: "Открыть каталог" },
  { path: "/training", number: "04", icon: "↗", title: "Обучение", text: "Сначала изучите короткую теорию, затем закрепите её в последовательной программе практики.", action: "Теория и практика" },
];

export default function Home() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/profile").then((profile) => setDaily(profile.daily_challenge || {})).catch(() => setDaily({}));
  }, []);

  async function startDaily() {
    setBusy(true);
    try {
      const session = await api("/api/daily-challenge/start", { method: "POST" });
      navigate(`/play/${session.id}`);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arena-home">
      <header className="arena-page-heading">
        <div>
          <span className="arena-kicker">ВАША ТРЕНИРОВОЧНАЯ ПЛОЩАДКА</span>
          <h1>Выберите формат<br />для следующего разговора</h1>
          <p>Практикуйтесь в своём темпе или пригласите второго участника.</p>
        </div>
        <span className="arena-date-pill">✳ ТРЕНИРУЙТЕ РЕШЕНИЯ</span>
      </header>

      <section className="arena-daily-card">
        <div className="arena-daily-copy">
          <span className="arena-kicker">ЕЖЕДНЕВНОЕ ЗАДАНИЕ</span>
          <h2>Короткая практика</h2>
          <p>Сложная ситуация · около {daily?.minutes || 3} минут · награда {daily?.reward || 2} ★</p>
          <button disabled={busy || !daily} onClick={startDaily}>
            {daily?.completed ? "Пройти ещё раз" : "Начать задание"}<span>→</span>
          </button>
        </div>
        <div className="arena-daily-art" aria-hidden="true">
          <i className="ring one" /><i className="ring two" />
          <strong>01</strong><small>ВАШ ХОД</small>
        </div>
      </section>

      <div className="arena-section-title">
        <div><span className="arena-kicker">ФОРМАТЫ</span><h2>Как хотите тренироваться?</h2></div>
        <span>{formats.length} направления</span>
      </div>

      <div className="arena-format-grid">
        {formats.map((format) => (
          <button key={format.path} className={`arena-format-card ${format.featured ? "featured" : ""}`} onClick={() => navigate(format.path)}>
            <div className="arena-format-top"><span>{format.number}</span><i>{format.icon}</i></div>
            <div><h3>{format.title}</h3><p>{format.text}</p></div>
            <div className="arena-format-action"><span>{format.action}</span><b>↗</b></div>
          </button>
        ))}
      </div>
    </div>
  );
}
