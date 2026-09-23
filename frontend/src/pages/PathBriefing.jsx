import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

// Kept as a route target for old links. A level now opens its first task
// immediately instead of showing a separate briefing screen.
export default function PathBriefing() {
  const { levelId } = useParams(); const nav = useNavigate(); const location = useLocation(); const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/learning-path/levels/${levelId}/attempts`, { method: "POST" })
      .then((attempt) => nav(`/training/path/attempt/${attempt.attempt_id}`, { replace: true, state: location.state }))
      .catch((e) => setError(e.message));
  }, [levelId, location.state, nav]);
  return <section className="briefing glass"><TrainingNavigation fallback="/training/path" />{error ? <p className="text-rose-300">{error}</p> : <p className="text-slate-400">Открываем уровень…</p>}</section>;
}
