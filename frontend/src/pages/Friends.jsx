import { Navigate, useLocation } from "react-router-dom";

/** Keep old notifications, room invitations and saved chat links working. */
export default function Friends() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("section", params.get("chat") ? "messages" : "friends");
  return <Navigate replace to={{ pathname: "/feed", search: `?${params.toString()}`, hash: location.hash }} />;
}
