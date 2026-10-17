import { Link } from "react-router-dom";

export default function CompanyRequestSent() {
  return <section className="glass rounded-3xl p-8" aria-labelledby="company-request-title">
    <h1 id="company-request-title" className="text-3xl font-bold">Заявка в компанию отправлена</h1>
    <p className="mt-4">Ваш аккаунт зарегистрирован. Пока заявку одобряют, вы можете перейти на главный сайт и пользоваться личной Ареной.</p>
    <p className="mt-3">После решения администратора компании вам придёт уведомление.</p>
    <Link className="primary-button mt-6" to="/app">Перейти на главный сайт →</Link>
  </section>;
}
