import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, LockKeyhole } from "lucide-react";
import { useAppearance } from "./Appearance";
import SignatureBackground, { SolflareArt } from "./SignatureBackground";

export default function Landing() {
  const { appearance, reducedMotion } = useAppearance();
  const signature = appearance.background === "signature";
  return <div className="landing">
    <header className="public-header">
      <Link className="brand" to="/"><span className="brand-mark">✳</span><span>АРЕНА<br/><b>ПЕРЕГОВОРОВ</b></span></Link>
      <Link to="/login" className="text-link">Войти <ArrowUpRight size={17}/></Link>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/> УЧЕБНОЕ ПРОСТРАНСТВО ДЛЯ СИЛЬНЫХ РЕШЕНИЙ</div>
          <h1>Каждый разговор<br/><em>можно провести лучше.</em></h1>
          <p>Тренируйте переговоры в безопасных ситуациях. Принимайте решения, видьте последствия и находите следующий шаг для роста.</p>
          <div className="hero-actions"><Link className="button primary" to="/login">Начать тренировку <ArrowRight size={19}/></Link><a className="text-link" href="#how">Как это работает <ArrowUpRight size={17}/></a></div>
          <div className="hero-note"><span>01 / 03</span> Практика доступна без API-ключа и внешнего ИИ</div>
        </div>
        <div className="hero-art" aria-hidden="true">{signature && <SignatureBackground appearance={appearance} reducedMotion={reducedMotion}/>}</div>
      </section>
      <section className="how" id="how">
        <div className="section-heading"><span className="kicker">МЕТОД</span><h2>От попытки — к навыку</h2><p>Здесь важно не угадать «правильный ответ», а понять, почему решение сработало.</p></div>
        <div className="how-grid">{[["01", "Выберите ситуацию", "Начните с короткой миссии или продолжите свой путь."], ["02", "Примите решение", "Собеседник реагирует, а разговор меняет направление."], ["03", "Разберите результат", "Увидьте причины, упражнение и возможность повторить."]].map(([n, title, description]) => <article className="how-card" key={n}><span>{n}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
      <section className="practice-invitation">
        <div className="lower-art" aria-hidden="true">{signature && <SolflareArt/>}</div>
        <div className="lower-copy"><span className="kicker">ВАШ СЛЕДУЮЩИЙ РАЗГОВОР</span><h2>Уверенность приходит<br/><em>с практикой.</em></h2><p>Сложный клиент, спор в команде или новый партнёр. Попробуйте другой подход здесь, чтобы найти нужные слова в настоящем разговоре.</p><Link className="button primary" to="/login">Выбрать ситуацию <ArrowRight size={19}/></Link></div>
      </section>
      <section className="privacy-strip"><LockKeyhole size={20}/><span>Ваши ошибки остаются частью тренировки. Сценарный режим работает локально, без отправки диалога внешнему ИИ.</span></section>
    </main>
    <footer>Арена переговоров · Учитесь вести разговор с уверенностью</footer>
  </div>;
}
