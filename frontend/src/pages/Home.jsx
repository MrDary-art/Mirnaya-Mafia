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
import PracticeHeader from "../components/PracticeHeader.jsx";

const modes = [
  {
    id: "ai",
    title: "Практика с ИИ",
    description: "Отрепетируйте разговор, который ждёт вас в жизни или на работе. Опишите ситуацию, задайте свою роль и цель, выберите сложность собеседника. Ведите диалог с ИИ, пробуйте разные стратегии и разбирайте принятые решения.",
    action: "Перейти к практике",
    route: "/ai",
    Icon: SparkleIcon,
  },
  {
    id: "rooms",
    title: "1 на 1",
    description: "Тренируйтесь в живом диалоге с другим участником. Создайте встречу, задайте ситуацию и цель, пригласите партнёра по ссылке или коду. Отрабатывайте аргументы, ищите общий язык и приходите к договорённостям вместе.",
    action: "Открыть встречи",
    route: "/rooms",
    Icon: UsersThreeIcon,
  },
  {
    id: "scenarios",
    title: "Сценарии",
    description: "Погрузитесь в готовые переговорные ситуации с заданными ролями и целями. Выбирайте реплики и наблюдайте, как решения меняют ход разговора. Изучайте итоговый разбор и проходите сценарий заново, чтобы найти более сильную стратегию.",
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
    <section className="nova-home-hub practice-forest practice-home" aria-labelledby="home-title">
      <div className="nova-home-primary">
        <PracticeHeader title="Практика" titleId="home-title" line="Сильные разговоры начинаются здесь." description="Тренируйтесь самостоятельно, вместе с другим участником или в готовом сценарии.">
          <div className="nova-home-daily-owl practice-hero-owl" aria-hidden="true"><ExperienceCanvas /></div>
        </PracticeHeader>

        <section className={`nova-home-daily${daily?.completed ? " is-complete" : ""}`} aria-labelledby="daily-title">
          <span className="nova-home-daily-icon" aria-hidden="true"><CalendarCheckIcon size={24} weight="regular" /></span>
          <div className="nova-home-daily-copy">
            <h2 id="daily-title">{daily?.title || "Испытание дня"}</h2>
            {!daily && !dailyLoadError && <p role="status">Загружаем сегодняшнее задание…</p>}
            {daily && <span className="nova-home-daily-meta">{daily.minutes} мин · <StarAmount value={daily.reward} /> · {daily.completed ? "Сегодня уже пройдено" : "Доступно сегодня"}</span>}
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
              <div className="practice-mode-heading"><h2 className="nova-home-mode-title">{title}</h2><span className="nova-home-mode-icon" aria-hidden="true">
                <Icon size={30} weight="regular" />
              </span></div>
              <p className="nova-home-mode-description">{description}</p>
              <span className="nova-home-mode-action">
                {action}
                <ArrowRightIcon size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>

    </section>
  );
}
