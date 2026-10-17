import { Navigate, useParams } from "react-router-dom";
import { businessPracticePath } from "../business/navigation.js";

export default function JobPractice() {
  const { companyId } = useParams();
  return <Navigate to={companyId ? `${businessPracticePath(companyId, "ai")}/prepare?kind=job` : "/ai/prepare?kind=job"} replace />;
}
