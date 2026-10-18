import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Empty, Loader, Notice } from "./shared.jsx";

const questionKey = question => typeof question === "string" ? question : String(question?.id || question?.text || "");
const questionText = question => typeof question === "string" ? question : String(question?.text || question?.id || "Вопрос");
const questionType = question => typeof question === "string" ? "text" : question?.type || "text";

export default function Surveys({ data }) {
  const companyId = data.company.id;
  const canManage = Boolean(data.permissions.manage_team);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await api("/api/company/" + companyId + "/surveys"));
      setNotice(null);
    } catch (cause) {
      setNotice({ tone: "red", text: cause.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  async function create(event) {
    event.preventDefault();
    const rows = questions.split("\n").map(value => value.trim()).filter(Boolean);
    if (!rows.length) {
      setNotice({ tone: "red", text: "Добавьте хотя бы один вопрос." });
      return;
    }
    setBusy("create");
    setNotice(null);
    try {
      await api("/api/company/" + companyId + "/surveys", { method: "POST", body: { title: title.trim(), questions: rows, anonymous: true } });
      setTitle("");
      setQuestions("");
      await load();
      setNotice({ tone: "success", text: "Опрос опубликован." });
    } catch (cause) {
      setNotice({ tone: "red", text: cause.message });
    } finally {
      setBusy("");
    }
  }

  async function showResults(item) {
    const busyKey = "results-" + item.id;
    setBusy(busyKey);
    setNotice(null);
    try {
      const value = await api("/api/company/" + companyId + "/surveys/" + item.id + "/results");
      setResults(current => ({ ...current, [item.id]: value }));
    } catch (cause) {
      setNotice({ tone: "red", text: cause.message });
    } finally {
      setBusy("");
    }
  }

  async function answer(item) {
    const response = answers[item.id] || {};
    const missing = item.questions.find(question => !String(response[questionKey(question)] || "").trim());
    if (missing) {
      setNotice({ tone: "red", text: "Ответьте на вопрос «" + questionText(missing) + "»." });
      return;
    }
    const busyKey = "answer-" + item.id;
    setBusy(busyKey);
    setNotice(null);
    try {
      await api("/api/company/" + companyId + "/surveys/" + item.id + "/responses", { method: "POST", body: { answers: response } });
      await load();
      setNotice({ tone: "success", text: "Ответ отправлен." });
    } catch (cause) {
      setNotice({ tone: "red", text: cause.message });
    } finally {
      setBusy("");
    }
  }

  return <section className="business-surveys">
    <header>
      <div><span>Обратная связь</span><h2>Корпоративные опросы</h2><p>Собирайте мнения команды. В анонимных опросах руководитель видит только общую сводку.</p></div>
      {canManage && <a href="#new-company-survey">Создать опрос</a>}
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {canManage && <form id="new-company-survey" className="business-survey-form" onSubmit={create}>
      <div><h3>Новый опрос</h3><p>Каждая строка станет отдельным вопросом.</p></div>
      <label>Название<input required minLength="2" maxLength="220" className="company-input" placeholder="Например, обратная связь по обучению" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Вопросы<textarea required rows="4" className="company-input" placeholder={"Что было полезно?\nЧто стоит улучшить?"} value={questions} onChange={event => setQuestions(event.target.value)} /></label>
      <div className="business-survey-form-footer"><span>Ответы собираются анонимно</span><button className="primary-button" disabled={busy === "create"}>{busy === "create" ? "Публикуем…" : "Опубликовать опрос"}</button></div>
    </form>}
    {loading ? <Loader /> : <div className="business-survey-list">{items.map(item => {
      const result = results[item.id];
      const answerBusy = busy === "answer-" + item.id;
      const resultsBusy = busy === "results-" + item.id;
      const labels = new Map(item.questions.map(question => [questionKey(question), questionText(question)]));
      return <article key={item.id} className="business-survey-card">
        <header><div><span>{item.anonymous ? "Анонимный опрос" : "Открытый опрос"}</span><h3>{item.title}</h3><p>{item.questions.length} {item.questions.length === 1 ? "вопрос" : item.questions.length < 5 ? "вопроса" : "вопросов"}</p></div>{item.answered && <strong>Ответ отправлен</strong>}</header>
        {!item.answered && <div className="business-survey-questions">{item.questions.map((question, index) => {
          const key = questionKey(question);
          const value = answers[item.id]?.[key] || "";
          const update = next => setAnswers(current => ({ ...current, [item.id]: { ...(current[item.id] || {}), [key]: next } }));
          return <label key={key || index}><span>{index + 1}. {questionText(question)}</span>{questionType(question) === "scale" ? <select value={value} onChange={event => update(event.target.value)}><option value="">Выберите оценку</option>{[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}</option>)}</select> : <textarea rows="2" value={value} onChange={event => update(event.target.value)} placeholder="Ваш ответ" />}</label>;
        })}<button type="button" className="primary-button" disabled={answerBusy} onClick={() => answer(item)}>{answerBusy ? "Отправляем…" : "Отправить ответы"}</button></div>}
        {canManage && <div className="business-survey-results"><button type="button" className="subtle-button" disabled={resultsBusy} onClick={() => showResults(item)}>{resultsBusy ? "Загружаем…" : result ? "Обновить итоги" : "Посмотреть итоги"}</button>{result && <div><b>{result.responses} ответов</b>{result.suppressed ? <p>{result.reason}</p> : Object.entries(result.answers).map(([question, values]) => <section key={question}><h4>{labels.get(question) || question}</h4>{Object.entries(values).map(([value, count]) => <p key={value}><span>{value}</span><b>{count}</b></p>)}</section>)}</div>}</div>}
      </article>;
    })}{!items.length && <Empty>Активных опросов пока нет.</Empty>}</div>}
  </section>;
}
