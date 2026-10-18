import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";

const modes = [
  {
    id: "ai",
    title: "Практика с ИИ",
    description: "Настройте ситуацию и отрепетируйте сложный разговор с виртуальным собеседником.",
    action: "Перейти к практике",
    route: "/ai",
    Icon: SparkleIcon,
  },
  {
    id: "rooms",
    title: "1 на 1",
    description: "Пригласите другого участника и проведите живые переговоры в назначенное время.",
    action: "Открыть встречи",
    route: "/rooms",
    Icon: UsersThreeIcon,
  },
  {
    id: "scenarios",
    title: "Сценарии",
    description: "Пройдите готовую ситуацию с развилками, последствиями и итоговым разбором.",
    action: "Выбрать сценарий",
    route: "/scenarios",
    Icon: SquaresFourIcon,
  },
];

export default function Home() {
  return (
    <section className="nova-home-hub" aria-labelledby="home-title">
      <header className="nova-home-hub-intro">
        <div className="nova-home-hub-copy">
        <h1 id="home-title">Выберите формат практики</h1>
        <p>Тренируйтесь самостоятельно, вместе с другим участником или в готовом сценарии.</p>
        </div>
        <div className="nova-home-owl-space" aria-hidden="true" />
      </header>

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
              <ArrowRightIcon size={20} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
