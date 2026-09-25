import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { api } from "../api.js";
import { HomeWorldScrollController } from "../experience/HomeWorldScrollController.js";
import { HOME_SECTIONS } from "../experience/homeWorldModel.js";

const worlds = [
  { id: "ai", number: "01 / INTELLIGENCE", eyebrow: "ПЕРВЫЙ КОНТАКТ", title: "Диалог с ИИ", copy: "Спокойно отрепетируйте сложный разговор. Попробуйте разные подходы и увидьте, как меняется реакция собеседника.", action: "Настроить разговор", route: "/ai" },
  { id: "rooms", number: "02 / CONNECTION", eyebrow: "ДВА ВЗГЛЯДА", title: "Онлайн 1×1", copy: "Проведите встречу с другим человеком. Услышьте иную позицию и найдите путь к общему решению.", action: "Открыть встречи", route: "/rooms" },
  { id: "scenarios", number: "03 / DECISIONS", eyebrow: "ПРОВЕРКА РЕШЕНИЙ", title: "Сценарии", copy: "Реальные ситуации с развилками и последствиями. Выбирайте реплики, отслеживайте доверие и достигайте цели без внешнего ИИ.", action: "Выбрать сценарий", route: "/scenarios" },
  { id: "learning", number: "04 / GROWTH", eyebrow: "ТРАЕКТОРИЯ РОСТА", title: "Обучение", copy: "Знания становятся навыком через практику. Двигайтесь от короткой теории к уверенным решениям.", action: "Открыть путь развития", route: "/training" },
  { id: "history", number: "05 / MEMORY", eyebrow: "ВАШ СЛЕД", title: "История", copy: "Посмотрите, как менялись ваши решения и чему научил каждый разговор.", action: "Посмотреть историю", route: "/history" },
  { id: "friends", number: "06 / COMMUNITY", eyebrow: "СВЯЗИ", title: "Друзья", copy: "Сильные переговоры строятся на внимании к людям. Продолжайте разговор с теми, кто рядом.", action: "Найти друзей", route: "/people" },
  { id: "profile", number: "07 / IDENTITY", eyebrow: "ВАША ТРАЕКТОРИЯ", title: "Профиль", copy: "Соберите свой опыт в единую картину: практика, прогресс и новый взгляд на собственные возможности.", action: "Открыть профиль", route: "/profile" },
];

export default function Home() {
  const navigate = useNavigate();
  const root = useRef(null);
  const debug = useRef(null);
  const [activeSection, setActiveSection] = useState("hero");
  const [daily, setDaily] = useState(null);
  const [dailyError, setDailyError] = useState("");
  const [dailyLoadError, setDailyLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("worldDebug");

  async function loadDaily() {
    setDailyLoadError("");
    try { setDaily(await api("/api/daily-challenge")); }
    catch (error) { setDailyLoadError(error.message); }
  }
  useEffect(() => { loadDaily(); }, []);

  useEffect(() => {
    const controller = new HomeWorldScrollController({
      root: root.current,
      onActive: (id) => {
        setActiveSection(id);
        window.dispatchEvent(new CustomEvent("arena:home-section", { detail: { sectionId: id } }));
      },
      onFrame: (snapshot) => {
        window.dispatchEvent(new CustomEvent("arena:home-world", { detail: snapshot }));
        if (debug.current) {
          const render = window.__arenaWorldStats || {};
          debug.current.textContent = `scroll ${Math.round(snapshot.scrollY)} · ${Math.round(snapshot.velocity)}px/s · ${snapshot.speed} · ${snapshot.activeSection} → ${snapshot.nextSection} · owl ${render.owlState || "loading"} · camera ${render.cameraState || "loading"} · scenes ${render.loadedScenes || "loading"} · ${render.fps || 0} FPS`;
        }
      },
    });
    controller.start();
    return () => controller.stop();
  }, []);

  async function startDaily() {
    setBusy(true);
    setDailyError("");
    try {
      const session = await api("/api/daily-challenge/start", { method: "POST" });
      navigate(`/play/${session.id}`);
    } catch {
      setDailyError("Задание пока недоступно. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  function goToSection(sectionId) {
    window.dispatchEvent(new CustomEvent("arena:navigate-home", { detail: { sectionId } }));
  }

  return (
    <div ref={root} className="nova-home-world">
      <div className="nova-world-progress" aria-hidden="true"><span style={{ height: `${Math.max(7, (HOME_SECTIONS.findIndex(({ id }) => id === activeSection) + 1) / HOME_SECTIONS.length * 100)}%` }} /></div>
      <section id="hero" data-home-section="hero" className="nova-world-section nova-world-hero" aria-labelledby="home-title">
        <header className="nova-home-header">
          <div className="nova-wordmark" aria-label="Арена переговоров"><strong>ARENA</strong><span>NEGOTIATIONS</span></div>
          <p>Лучшие переговоры<br />начинаются с практики.</p>
        </header>
        <div className="nova-world-copy nova-world-copy-hero">
          <span className="nova-eyebrow">БОЛЬШЕ УВЕРЕННОСТИ В ВАЖНЫХ РАЗГОВОРАХ</span>
          <h1 id="home-title">Не каждый сложный разговор<br className="nova-desktop-break" /> нужно проходить впервые.</h1>
          <p className="nova-home-subtitle">Потренируйте его здесь.</p>
          <div className="nova-home-actions">
            <button className="nova-button nova-button-primary" onClick={() => goToSection("ai")}>Начать путешествие <ArrowRightIcon size={20} aria-hidden="true" /></button>
            <button className="nova-text-link" onClick={() => goToSection("learning")}>Как это работает</button>
          </div>
        </div>
        <div className="nova-world-hero-index" aria-hidden="true">00 <span>/ 08</span></div>
        <button className="nova-world-scroll-cue" onClick={() => goToSection("ai")}>Листайте вниз <ArrowDownIcon size={18} aria-hidden="true" /></button>
      </section>

      {worlds.map((world, index) => (
        <section key={world.id} id={world.id} data-home-section={world.id}
          className={`nova-world-section nova-world-${world.id}`} aria-labelledby={`world-title-${world.id}`}>
          <div className="nova-world-scene-label" aria-hidden="true">{world.number}</div>
          <div className="nova-world-copy">
            <span className="nova-eyebrow">{world.eyebrow}</span>
            <h2 id={`world-title-${world.id}`}>{world.title}</h2>
            <p>{world.copy}</p>
            <button className="nova-button nova-button-secondary" onClick={() => navigate(world.route)}>
              {world.action} <ArrowRightIcon size={19} aria-hidden="true" />
            </button>
          </div>
          <span className="nova-world-connector" aria-hidden="true">{String(index + 1).padStart(2, "0")} / 08</span>
        </section>
      ))}

      <section id="finale" data-home-section="finale" className="nova-world-section nova-world-finale" aria-labelledby="world-title-finale">
        <div className="nova-world-copy">
          <span className="nova-eyebrow">ПРОДОЛЖАЙТЕ ПРАКТИКУ</span>
          <h2 id="world-title-finale">Следующий разговор<br />начинается с вас.</h2>
          <p>Один разговор. Один новый навык. Возвращайтесь к практике в своём ритме.</p>
          {daily && <div className="nova-daily-brief"><b>{daily.title}</b><p>{daily.brief}</p><small>{daily.minutes} мин · ★ {daily.reward} · {daily.completed ? "Сегодня уже пройдено" : "Доступно сегодня"}</small></div>}
          <div className="nova-world-final-actions">
            <button className="nova-button nova-button-primary" onClick={startDaily} disabled={busy || !daily || Boolean(dailyLoadError)}>
              {busy ? "Открываем…" : daily?.completed ? "Пройти ещё раз" : "Начать задание"} <ArrowRightIcon size={19} aria-hidden="true" />
            </button>
            <button className="nova-text-link" onClick={() => goToSection("hero")}>Вернуться к сове ↑</button>
          </div>
          {!daily && !dailyLoadError && <p role="status">Загружаем задание дня…</p>}
          {dailyLoadError && <div className="nova-daily-error" role="alert"><p>Не удалось загрузить задание: {dailyLoadError}</p><button className="nova-text-link" onClick={loadDaily}>Повторить загрузку</button></div>}
          {dailyError && <p className="nova-inline-error" role="alert">{dailyError}</p>}
        </div>
      </section>
      {debugEnabled && <div className="nova-world-debug"><span ref={debug} /><nav aria-label="Home world debug">{HOME_SECTIONS.map(({ id, label }) => <button key={id} onClick={() => goToSection(id)}>{label}</button>)}</nav></div>}
    </div>
  );
}
