const SECTIONS = new Set(["posts", "friends", "messages", "collections", "notifications"]);

export function communitySection(search = "") {
  const params = new URLSearchParams(search);
  const section = params.get("section");
  if (SECTIONS.has(section)) return section;
  return /^[1-9]\d*$/.test(params.get("chat") || "") ? "messages" : "posts";
}

export function communityHref(section = "posts", { base = "/feed", search = "", chatId = null } = {}) {
  const next = new URLSearchParams(search);
  const selected = SECTIONS.has(section) ? section : "posts";
  if (selected === "posts") {
    next.delete("section");
    next.delete("q");
    next.delete("user_id");
    next.delete("company_id");
    next.delete("scope");
  } else {
    next.set("section", selected);
  }
  if (selected === "messages" && /^[1-9]\d*$/.test(String(chatId || ""))) next.set("chat", String(chatId));
  else next.delete("chat");
  const query = next.toString();
  return `${base === "/profile" ? "/profile" : "/feed"}${query ? `?${query}` : ""}`;
}
