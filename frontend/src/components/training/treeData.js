export const UNAVAILABLE_FINALS = new Set(["hr_empathy_final", "hr_difficult_final", "sales_interests_final", "sales_objections_final"]);
export function displayState(node) { return UNAVAILABLE_FINALS.has(node.id) ? "locked_content" : node.state; }
export function childrenOf(nodes, id) { return nodes.filter((node) => node.parent_id === id); }
export function progressFor(nodes, professionId) { const leaves = childrenOf(nodes, professionId).flatMap((skill) => childrenOf(nodes, skill.id)); const done = leaves.filter((node) => ["completed", "mastered"].includes(displayState(node))).length; return { done, total: leaves.length, percent: leaves.length ? Math.round((done / leaves.length) * 100) : 0 }; }
