import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { businessPath } from "./navigation.js";
import "./business.css";

export default function BusinessResolver() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const invitation = params.get("invitation");

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    api("/api/company/context")
      .then((data) => {
        if (!active) return;
        if (invitation) {
          navigate(`/business/workspaces?invitation=${encodeURIComponent(invitation)}`, { replace: true });
          return;
        }
        const companies = (data.companies || []).filter((company) => company.status === "ACTIVE");
        if (companies.length === 1) navigate(businessPath(companies[0].company_id), { replace: true });
        else if (companies.length > 1 || data.pending_invitations?.length) navigate("/business/workspaces", { replace: true });
        else navigate("/business/create", { replace: true });
      })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [ready, user, invitation, navigate]);

  if (!ready) return <div className="business-standalone"><BusinessBrand /><p role="status">Открываем кабинет компании…</p></div>;
  if (!user) return <Navigate to="/business/login?next=%2Fbusiness%2Fcontinue" replace />;
  if (error) return <div className="business-standalone"><BusinessBrand /><h1>Не удалось открыть кабинет</h1><p role="alert">{error}</p><div className="business-actions"><button className="primary-button" onClick={() => { setError(""); window.location.reload(); }}>Повторить</button><Link className="subtle-button" to="/business">На страницу для компаний</Link></div></div>;
  return <div className="business-standalone"><BusinessBrand /><p role="status">Подбираем рабочее пространство…</p></div>;
}
