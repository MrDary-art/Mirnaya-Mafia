import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PracticeSetup from "./PracticeSetup.jsx";

const scenarioLaunches = new Map();

export default function Setup() {
  const [params] = useSearchParams();
  return params.get("mode") === "online" ? <PracticeSetup /> : <ScenarioLaunch />;
}

function ScenarioLaunch() {
  const [params] = useSearchParams();
  const { companyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const preset = params.get("preset") || "hr_firing_01";
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const launchKey = `${location.key}:${companyId || "personal"}:${preset}:${attempt}`;

  useEffect(() => {
    let active = true;
    let launch = scenarioLaunches.get(launchKey);

    if (!launch) {
      launch = api("/api/scenarios").then((items) => {
        const scenario = items.find((item) => item.id === preset);
        if (!scenario) throw new Error("Сценарий не найден. Вернитесь в каталог и выберите другой.");
        return api("/api/sessions", {
          method: "POST",
          body: {
            mode: "scenario",
            scenario_id: scenario.id,
            preset: scenario.id,
            role: scenario.roles?.player || "Участник переговоров",
            opponent_role: scenario.roles?.opponent || scenario.opponent || "Собеседник",
            problem: scenario.problem || scenario.context || "",
            goal: scenario.goal || "",
            difficulty: scenario.difficulty || "medium",
          },
        });
      });
      scenarioLaunches.set(launchKey, launch);
    }

    launch.then((session) => {
      if (!active) return;
      // Catalog launches are personal practice. Corporate assignments are started
      // through their assignment endpoint and keep their protected company route.
      navigate(`/play/${session.id}`, {
        replace: true,
        state: { ...location.state, returnTo: companyId ? `/business/${encodeURIComponent(companyId)}/learning/scenarios` : location.state?.returnTo },
      });
    }).catch((cause) => {
      if (active) setError(cause.message);
    });

    return () => { active = false; };
  }, [companyId, launchKey, location.state, navigate, preset]);

  return <section className="glass scenario-launch-state" role={error ? "alert" : "status"} aria-live="polite">
    <h1>{error ? "Не удалось начать сценарий" : "Открываем переговоры…"}</h1>
    <p>{error || "Готовим диалог и условия выбранного сценария."}</p>
    {error && <button className="primary-button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Повторить</button>}
  </section>;
}
