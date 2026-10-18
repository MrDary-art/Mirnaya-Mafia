import { Navigate, useLocation, useParams } from "react-router-dom";
import { businessPracticePath } from "../business/navigation.js";

export default function AiMode() {
  const { companyId } = useParams();
  const { search } = useLocation();
  const aiBase = companyId ? businessPracticePath(companyId, "ai") : "/ai";
  return <Navigate to={`${aiBase}/prepare${search}`} replace />;
}
