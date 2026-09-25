import { Link, useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return <section className="product-not-found">
    <span className="eyebrow">МАРШРУТ НЕ НАЙДЕН</span>
    <h1>Этой страницы нет на Арене.</h1>
    <p>Проверьте адрес или вернитесь к выбору формата. Ваши результаты и настройки не изменились.</p>
    <div className="product-actions"><Link className="primary-button" to="/">На главную</Link><button className="subtle-button" onClick={() => navigate(-1)}>Назад</button></div>
  </section>;
}
