import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { SerialError, SerialLoading } from "../components/serials/SerialShared.jsx";
import { businessPracticePath } from "../business/navigation.js";
import "../components/serials/serials.css";

export default function SerialStory() {
  const { storyId, companyId } = useParams();
  const navigate = useNavigate();
  const serialsBase = companyId ? businessPracticePath(companyId, "serials") : "/serials";
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    api(`/api/serials/${encodeURIComponent(storyId)}/runs`, { method: "POST", body: { slot: 1 } })
      .then((result) => {
        if (!active) return;
        if (result.run.status === "completed") {
          navigate(serialsBase, { replace: true });
          return;
        }
        navigate(`${serialsBase}/play/${result.run.id}`, { replace: true, state: { returnTo: serialsBase } });
      })
      .catch((exception) => { if (active) setError(exception.message); });
    return () => { active = false; };
  }, [attempt, navigate, serialsBase, storyId]);

  return <div className="serials-page serials-story-page">
    {error ? <SerialError error={error} onRetry={() => setAttempt((value) => value + 1)} /> : <SerialLoading text="Открываем историю…" />}
  </div>;
}
