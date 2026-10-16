import { api } from "../../api.js";

export const labApi = {
  catalog: () => api("/api/lab"),
  trainer: (id = "red-zone") => api(`/api/lab/${id}`),
  start: (trainerId, caseId) => api(`/api/lab/${trainerId}/cases/${caseId}/runs`, { method: "POST" }),
  run: (runId) => api(`/api/lab/runs/${runId}`),
  act: (runId, body) => api(`/api/lab/runs/${runId}/act`, { method: "POST", body }),
  restart: (runId, revision) => api(`/api/lab/runs/${runId}/restart`, { method: "POST", body: { revision } }),
};
