import { useEffect, useRef, useState } from "react";

export default function DesignGallery() {
  const [state, setState] = useState("idle");
  const [dialog, setDialog] = useState(false);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!dialog) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setDialog(false); }
      if (event.key !== "Tab") return;
      const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, [dialog]);
  return <div className="design-gallery">
    <header className="design-gallery-intro">
      <span className="eyebrow">DEV ONLY · PRODUCT DESIGN PASS V4</span>
      <h1>Состояния интерфейса</h1>
      <p>Локальная витрина компонентов. Она не вызывает API и не подменяет реальные бизнес-состояния.</p>
    </header>
    <div className="design-gallery-grid">
      <section className="glass design-gallery-panel" aria-labelledby="gallery-actions">
        <h2 id="gallery-actions">Действия</h2>
        <div className="design-gallery-actions">
          <button className="primary-button" onClick={() => setState("success")}>Основное действие</button>
          <button className="subtle-button" onClick={() => setDialog(true)}>Открыть окно</button>
          <button className="subtle-button" disabled>Недоступно</button>
          <button className="subtle-button" aria-busy={state === "pending"} onClick={() => setState("pending")}>Ожидание</button>
        </div>
      </section>
      <section className="glass design-gallery-panel" aria-labelledby="gallery-fields">
        <h2 id="gallery-fields">Поля</h2>
        <label>Название переговоров<input placeholder="Например: сроки запуска" /></label>
        <label>Формат<select defaultValue="scenario"><option value="scenario">Сценарный · офлайн</option><option value="online">Диалог с ИИ</option></select></label>
        <label>Комментарий<textarea rows={3} placeholder="Опишите контекст" /></label>
      </section>
      <section className="glass design-gallery-panel" aria-labelledby="gallery-feedback">
        <h2 id="gallery-feedback">Системная обратная связь</h2>
        <div className="design-gallery-actions">
          <button className="subtle-button" onClick={() => setState("error")}>Ошибка</button>
          <button className="subtle-button" onClick={() => setState("empty")}>Пусто</button>
          <button className="subtle-button" onClick={() => setState("success")}>Успех</button>
        </div>
        {state === "error" && <div className="product-error" role="alert">Не удалось выполнить действие. Ввод сохранён; попробуйте ещё раз.</div>}
        {state === "empty" && <p className="design-gallery-state" role="status">Здесь пока нет записей.</p>}
        {state === "success" && <p className="design-gallery-state is-success" role="status">Действие подтверждено в витрине.</p>}
        {state === "pending" && <p className="design-gallery-state" role="status">Ожидаем ответ…</p>}
        {state === "idle" && <p className="design-gallery-state">Выберите состояние для просмотра.</p>}
      </section>
    </div>
    {dialog && <div className="scenario-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(false); }}>
      <div ref={dialogRef} className="scenario-modal" role="dialog" aria-modal="true" aria-labelledby="gallery-dialog-title">
        <div className="scenario-modal-head"><h2 id="gallery-dialog-title">Пример окна</h2><button aria-label="Закрыть" onClick={() => setDialog(false)}>×</button></div>
        <p>Реальные диалоги и их клавиатурные сценарии проверяются на страницах продукта.</p>
        <button className="primary-button" onClick={() => setDialog(false)}>Понятно</button>
      </div>
    </div>}
  </div>;
}
