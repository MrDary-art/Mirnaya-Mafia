import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { safeBusinessNext } from "./navigation.js";

// Corporate links open the company creator entry in the shared auth component.
export default function BusinessAccess() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = location.pathname.endsWith("/register") || params.get("mode") === "register" ? "register" : "login";
  const invitation = params.get("invitation");
  const portal = invitation ? "personal" : params.get("portal") === "personal" ? "personal" : "company";
  const target = invitation ? `/business/workspaces?invitation=${encodeURIComponent(invitation)}` : safeBusinessNext(params.get("next"), mode === "register" ? "/business/create" : "/business/continue");
  if (!ready) return <p role="status">Открываем кабинет…</p>;
  return <Navigate to={user ? target : `/?${new URLSearchParams({ auth: mode, next: target, portal })}`} replace />;
}
