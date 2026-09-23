const KEY = "arena_learning_tree_navigation";

export function branchFor(nodes, nodeId) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return {};
  if (node.type === "profession") return { professionId: node.id };
  if (node.type === "skill") return { professionId: node.parent_id, skillId: node.id };
  const skill = nodes.find((item) => item.id === node.parent_id);
  return { professionId: skill?.parent_id, skillId: skill?.id, nodeId: node.id };
}

export function readTreeNavigation(search = "") {
  const params = new URLSearchParams(search);
  const fromUrl = { professionId: params.get("profession") || undefined, skillId: params.get("skill") || undefined, nodeId: params.get("node") || undefined };
  if (fromUrl.professionId || fromUrl.skillId || fromUrl.nodeId) return fromUrl;
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function saveTreeNavigation(value) { sessionStorage.setItem(KEY, JSON.stringify(value)); }

export function treeUrl(value = {}) {
  const params = new URLSearchParams();
  if (value.professionId) params.set("profession", value.professionId);
  if (value.skillId) params.set("skill", value.skillId);
  if (value.nodeId) params.set("node", value.nodeId);
  const query = params.toString();
  return `/training/tree${query ? `?${query}` : ""}`;
}

export function recommendedNode(nodes) {
  return nodes.find((node) => node.type === "training" && node.state === "available") || nodes.find((node) => node.type === "profession");
}
