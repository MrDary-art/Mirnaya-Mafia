import { Link } from "react-router-dom";

export default function NotFound() {
  return <section className="product-not-found">
    <span className="eyebrow">МАРШРУТ НЕ НАЙДЕН</span>
    <h1>Этой страницы нет на Арене.</h1>
    <p>Проверьте адрес или вернитесь к выбору формата. Ваши результаты и настройки не изменились.</p>
    <div className="product-actions"><Link className="primary-button" to="/app">На главную</Link></div>
  </section>;
}
