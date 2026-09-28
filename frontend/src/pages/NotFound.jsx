import PageHeader from "../design/PageHeader.jsx";
import { Link } from "react-router-dom";

export default function NotFound() {
  return <section className="product-not-found">
    <PageHeader eyebrow="Маршрут не найден" title="Этой страницы нет на Арене" description="Проверьте адрес или вернитесь к выбору формата. Ваши результаты и настройки не изменились." actions={<Link className="primary-button" to="/app">На главную</Link>} />
  </section>;
}
