import { api, apiForm } from "../../api.js";

export function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== "") query.set(key, String(value)); });
  return query.size ? `?${query}` : "";
}
const path = "/api/social";
export const feedApi = {
  list: (params) => api(`${path}/feed${queryString(params)}`),
  post: (id) => api(`${path}/posts/${id}`),
  create: (body) => api(`${path}/posts`, { method: "POST", body }),
  update: (id, body) => api(`${path}/posts/${id}`, { method: "PATCH", body }),
  remove: (id) => api(`${path}/posts/${id}`, { method: "DELETE" }),
  like: (id, active) => api(`${path}/posts/${id}/like`, { method: active ? "POST" : "DELETE" }),
  bookmark: (id, active) => api(`${path}/posts/${id}/bookmark`, { method: active ? "POST" : "DELETE" }),
  likers: (id, params) => api(`${path}/posts/${id}/likes${queryString(params)}`),
  comments: (id, params) => api(`${path}/posts/${id}/comments${queryString(params)}`),
  comment: (id, body) => api(`${path}/posts/${id}/comments`, { method: "POST", body }),
  editComment: (id, text) => api(`${path}/comments/${id}`, { method: "PATCH", body: { text } }),
  removeComment: (id) => api(`${path}/comments/${id}`, { method: "DELETE" }),
  likeComment: (id, active) => api(`${path}/comments/${id}/like`, { method: active ? "POST" : "DELETE" }),
  follow: (id, active, company = false) => api(`${path}/follows/${company ? "companies" : "users"}/${id}`, { method: active ? "POST" : "DELETE" }),
  stats: (id) => api(`${path}/users/${id}/stats`),
  people: (id, kind, params) => api(`${path}/users/${id}/${kind}${queryString(params)}`),
  wall: (id, params) => api(`${path}/users/${id}/posts${queryString(params)}`),
  saved: (params) => api(`${path}/bookmarks${queryString(params)}`),
  repost: (id, body) => api(`${path}/posts/${id}/repost`, { method: "POST", body }),
  share: (id, body) => api(`${path}/posts/${id}/share-message`, { method: "POST", body }),
  vote: (id, optionId) => api(`${path}/posts/${id}/vote`, { method: "POST", body: { option_id: optionId } }),
  report: (targetType, targetId, reason) => api(`${path}/reports`, { method: "POST", body: { target_type: targetType, target_id: targetId, reason } }),
  mute: (id, active) => api(`${path}/mutes/users/${id}`, { method: active ? "POST" : "DELETE" }),
  publishers: () => api(`${path}/publishers`),
  upload: (file, altText = "") => { const data = new FormData(); data.append("file", file); data.append("alt_text", altText); return apiForm(`${path}/media/upload`, data, { method: "POST" }); },
  stories: (params) => api(`${path}/stories${queryString(params)}`),
  story: (id) => api(`${path}/stories/${id}`),
  createStory: (body) => api(`${path}/stories`, { method: "POST", body }),
  removeStory: (id) => api(`${path}/stories/${id}`, { method: "DELETE" }),
  viewStory: (id) => api(`${path}/stories/${id}/view`, { method: "POST" }),
  replyStory: (id, text) => api(`${path}/stories/${id}/reply`, { method: "POST", body: { text } }),
  viewers: (id, params) => api(`${path}/stories/${id}/viewers${queryString(params)}`),
  highlights: (id) => api(`${path}/users/${id}/highlights`),
  highlight: (id) => api(`${path}/highlights/${id}`),
  createHighlight: (body) => api(`${path}/highlights`, { method: "POST", body }),
  updateHighlight: (id, body) => api(`${path}/highlights/${id}`, { method: "PATCH", body }),
  removeHighlight: (id) => api(`${path}/highlights/${id}`, { method: "DELETE" }),
};

export function postChanged(post, fields) {
  window.dispatchEvent(new CustomEvent("arena:feed-post-changed", { detail: { post, fields } }));
}
export function postRemoved(id) { window.dispatchEvent(new CustomEvent("arena:feed-post-removed", { detail: { id } })); }
export function followChanged(id, following, company = false) { window.dispatchEvent(new CustomEvent("arena:feed-follow-changed", { detail: { id, following, company } })); }
export function mergePost(current, updated, fields) {
  if (!fields) return updated;
  const result = { ...current };
  fields.forEach((field) => {
    if (field.startsWith("viewer_state.")) { const key = field.split(".")[1]; result.viewer_state = { ...result.viewer_state, [key]: updated.viewer_state[key] }; }
    else if (field.startsWith("counts.")) { const key = field.split(".")[1]; result.counts = { ...result.counts, [key]: updated.counts[key] }; }
    else result[field] = updated[field];
  });
  return result;
}
