import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { answerFeedbackText, answerQualityLabels } from "../components/answerQuality.js";

export default function TrainingSession() {
  const { programId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/api/learning/programs/${programId}`).then(setData).catch((error) => alert(error.message)); }, [programId]);
  if (!data) return <div className="text-slate-400">Загрузка упражнения…</div>;
  const ex = data.exercises[index];
  if (!ex) return <div className="glass rounded-3xl p-6"><h1 className="text-2xl font-bold">Блок завершён</h1><button className="mt-4 text-lime-300" onClick={() => nav("/learn")}>К программам</button></div>;
  const quality = result ? (result.ok ? "strong" : "weak") : null;

  async function submit(optionId) {
    setBusy(true);
    try {
      const reply = await api(`/api/learning/programs/${programId}/exercises/${ex.id}`, { method: "POST", body: { option_id: optionId, answer: answer || null } });
      setSelectedOption(optionId);
      setResult(reply);
      setData((current) => ({ ...current, ...reply.progress }));
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  }

  function next() { setResult(null); setSelectedOption(null); setAnswer(""); setIndex((current) => current + 1); }

  return <div className="mx-auto max-w-3xl"><div className="mb-4 text-sm text-lime-300">{data.title} · {index + 1}/{data.exercises.length}</div>
    <div className="glass rounded-3xl p-6"><h1 className="text-2xl font-bold">{ex.title}</h1>
      {ex.dialogue?.map((line, i) => <p key={i} className="mt-3 rounded-xl bg-white/5 p-3">{line}</p>)}
      <p className="mt-5 text-slate-300">{ex.prompt}</p>
      {ex.goal && <p className="mt-3 rounded-xl border border-lime-400/30 p-3 text-lime-100">Попробуйте: {ex.goal}</p>}
      {ex.options?.length ? <div className="mt-5 grid gap-3">{ex.options.map((option) => {
        const revealed = result && selectedOption === option.id;
        return <button key={option.id} disabled={busy || !!result} onClick={() => submit(option.id)} className={`answer-quality-option rounded-2xl border border-white/15 p-4 text-left hover:border-lime-300${revealed ? ` answer-quality-revealed answer-quality-${quality}` : ""}`}><span>{option.text}</span>{revealed && <span className={`answer-quality-badge answer-quality-${quality}`}>{answerQualityLabels[quality]}</span>}</button>;
      })}</div> : <><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={!!result} rows="4" className="mt-5 w-full rounded-2xl bg-black/30 p-4" placeholder="Напишите свой ответ…" /><button disabled={busy || !!result} onClick={() => submit(null)} className="mt-3 rounded-xl bg-lime-400 px-4 py-3 font-semibold text-slate-950">Проверить ответ</button></>}
      {result && <div className={`answer-quality-feedback answer-quality-revealed answer-quality-${quality} mt-5 rounded-2xl p-4`}><b className={`answer-quality-badge answer-quality-${quality}`}>{answerQualityLabels[quality]}</b><p className="mt-3 ui-icon-label"><Icon name={result.ok ? "check" : "circle-dot"} size={17} />{answerFeedbackText(result.feedback)}</p><button className="mt-3 text-lime-200" onClick={next}>Продолжить</button></div>}
    </div>
  </div>;
}
