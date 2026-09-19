import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Home() {
  const nav = useNavigate();
  const [daily, setDaily] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/profile")
      .then((profile) => setDaily(profile.daily_challenge || {}))
      .catch(() => setDaily({}));
  }, []);

  async function startDaily() {
    setBusy(true);
    try {
      const session = await api("/api/daily-challenge/start", { method: "POST" });
      nav(`/play/${session.id}`);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="eyebrow">АРЕНА ПЕРЕГОВОРОВ</div>
      <h1 className="text-4xl font-extrabold">Развивайте навык<br />в реальных диалогах</h1>
      <p className="mt-3 max-w-2xl text-slate-400">Выберите формат, который подходит вам сегодня.</p>

      <section className="glass mt-6 flex flex-col gap-5 rounded-3xl p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="eyebrow">ЕЖЕДНЕВНОЕ ЗАДАНИЕ</div>
          <h2 className="mt-1 text-2xl font-bold">Короткая практика</h2>
          <p className="mt-2 text-sm text-slate-400">
            Высокая сложность · ~{daily?.minutes || 3} мин · награда ★ {daily?.reward || 2}
          </p>
        </div>
        <button disabled={busy || !daily} onClick={startDaily} className="primary-button shrink-0">
          {daily?.completed ? "Пройти ещё раз" : "Начать задание"} →
        </button>
      </section>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <button onClick={() => nav("/scenarios")} className="mode-card text-left">
          <span className="mode-icon">◈</span>
          <div className="text-2xl font-bold">Сценарии</div>
          <p>Готовые деловые ситуации с ветвлениями, реакциями оппонента и отчётом — без ИИ.</p>
          <span className="mode-action">Открыть каталог →</span>
        </button>
        <button onClick={() => nav("/ai")} className="mode-card text-left">
          <span className="mode-icon">◉</span>
          <div className="text-2xl font-bold">Диалог с ИИ</div>
          <p>Тренируйте переговоры с ИИ: текстом или голосом, с разбором после разговора.</p>
          <span className="mode-action">Выбрать формат →</span>
        </button>

        <button onClick={() => nav("/rooms")} className="mode-card text-left">
          <span className="mode-icon">◌</span>
          <div className="text-2xl font-bold">Онлайн 1 на 1</div>
          <p>Онлайн 1 × 1: создайте комнату, пригласите партнёра и отработайте ситуацию вместе.</p>
          <span className="mode-action">Открыть режимы →</span>
        </button>

        <section className="mode-card flex flex-col text-left">
          <span className="mode-icon">✦</span>
          <div className="text-2xl font-bold">Обучение</div>
          <p>Разбирайте принципы переговоров и закрепляйте навыки в коротких упражнениях.</p>
          <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
            <button onClick={() => nav("/theory")} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-slate-400">
              <b className="block text-slate-300">Теория</b>
              <span className="text-sm">Открыть уроки →</span>
            </button>
            <button onClick={() => nav("/training/path")} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-left text-cyan-100">
              <b className="block">Практика</b>
              <span className="text-sm">Открыть путь →</span>
            </button>
          </div>
        </section>

        <button onClick={() => nav("/setup")} className="mode-card text-left">
          <span className="mode-icon">▣</span>
          <div className="text-2xl font-bold">Сценарные переговоры</div>
          <p>Офлайн-режим с готовыми ситуациями, вариантами ответов и преднастроенными репликами.</p>
          <span className="mode-action">Выбрать сценарий →</span>
        </button>
      </div>
    </div>
  );
}
