import { useLocation, useNavigate } from "react-router-dom";

export default function TrainingNavigation({ fallback = "/" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.returnTo || fallback;
  return <nav className="training-navigation" aria-label="Навигация обучения">
    <button className="training-nav-back" type="button" onClick={() => navigate(destination)} aria-label="Вернуться на предыдущий экран" title="Назад">←</button>
  </nav>;
}
