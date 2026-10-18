import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { safeBusinessNext } from "./navigation.js";

// Every corporate role enters through the same shared account flow. Membership
// determines what the user can do after authentication.
export default function BusinessAccess() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = location.pathname.endsWith("/register") || params.get("mode") === "register" ? "register" : "login";
  const invitation = params.get("invitation");
  const target = invitation ? `/business/workspaces?invitation=${encodeURIComponent(invitation)}` : safeBusinessNext(params.get("next"), "/business/continue");
  if (!ready) return <p role="status">Открываем кабинет…</p>;
  return <Navigate to={user ? target : `/?${new URLSearchParams({ auth: mode, next: target, portal: "company" })}`} replace />;
}
