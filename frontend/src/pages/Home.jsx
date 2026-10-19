import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { api } from "../api.js";
import { StarAmount } from "../components/Icon.jsx";
import ExperienceCanvas from "../experience/ExperienceCanvas.jsx";

const modes = [
  {
    id: "ai",
    title: "Практика с ИИ",
    description: "Настройте индивидуальную ситуацию.",
    action: "Перейти к практике",
    route: "/ai",
    Icon: SparkleIcon,
  },
  {
    id: "rooms",
    title: "1 на 1",
    description: "Практикуйтесь с живым человеком.",
    action: "Открыть встречи",
    route: "/rooms",
    Icon: UsersThreeIcon,
  },
  {
    id: "scenarios",
    title: "Сценарии",
    description: "Пройдите заранее подготовленные экспертами сценарии.",
    action: "Выбрать сценарий",
    route: "/scenarios",
    Icon: SquaresFourIcon,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState(null);
  const [dailyLoadError, setDailyLoadError] = useState("");
  const [dailyStartError, setDailyStartError] = useState("");
  const [dailyBusy, setDailyBusy] = useState(false);

  async function loadDaily() {
    setDailyLoadError("");
    try {
      setDaily(await api("/api/daily-challenge"));
    } catch (error) {
      setDailyLoadError(error.message);
    }
  }

  useEffect(() => { loadDaily(); }, []);

  async function startDaily() {
    setDailyBusy(true);
    setDailyStartError("");
    try {
      const session = await api("/api/daily-challenge/start", { method: "POST" });
      navigate(`/play/${session.id}`);
    } catch {
      setDailyStartError("Не удалось открыть задание. Попробуйте ещё раз.");
    } finally {
      setDailyBusy(false);
    }
  }

  return (
    <section className="nova-home-hub" aria-labelledby="home-title">
      <div className="nova-home-primary">
        <header className="nova-home-hub-intro">
          <div className="nova-home-hub-copy">
            <h1 id="home-title">Выберите формат практики</h1>
            <p>Тренируйтесь самостоятельно, вместе с другим участником или в готовом сценарии.</p>
          </div>
          <div className="nova-home-owl-space" aria-hidden="true" />
        </header>

        <section className={`nova-home-daily${daily?.completed ? " is-complete" : ""}`} aria-labelledby="daily-title">
          <div className="nova-home-daily-owl" aria-hidden="true"><ExperienceCanvas /></div>
          <span className="nova-home-daily-icon" aria-hidden="true"><CalendarCheckIcon size={24} weight="regular" /></span>
          <div className="nova-home-daily-copy">
            <h2 id="daily-title">{daily?.title || "Испытание дня"}</h2>
            {!daily && !dailyLoadError && <p role="status">Загружаем сегодняшнее задание…</p>}
            {daily && <span className="nova-home-daily-meta">{daily.minutes} мин · <StarAmount value={daily.reward} />{daily.completed ? " · Сегодня уже пройдено" : ""}</span>}
            {dailyLoadError && <div className="nova-home-daily-error" role="alert"><span>Не удалось загрузить задание.</span><button type="button" onClick={loadDaily}>Повторить</button></div>}
            {dailyStartError && <p className="nova-home-daily-error" role="alert">{dailyStartError}</p>}
          </div>
          <button className="nova-home-daily-action" type="button" onClick={startDaily} aria-busy={dailyBusy} disabled={dailyBusy || !daily || Boolean(dailyLoadError)}>
            {dailyBusy ? "Открываем…" : daily?.completed ? "Пройти ещё раз" : "Начать задание"}
            <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
        </section>

        <div className="nova-home-mode-grid" aria-label="Режимы переговоров">
          {modes.map(({ id, title, description, action, route, Icon }) => (
            <Link className={`nova-home-mode nova-home-mode-${id}`} to={route} key={id}>
              <span className="nova-home-mode-icon" aria-hidden="true">
                <Icon size={30} weight="regular" />
              </span>
              <span className="nova-home-mode-copy">
                <span className="nova-home-mode-title">{title}</span>
                <span className="nova-home-mode-description">{description}</span>
              </span>
              <span className="nova-home-mode-action">
                {action}
              </span>
            </Link>
          ))}
        </div>
      </div>

    </section>
  );
}
