import assert from "node:assert/strict";
import test from "node:test";
import { communityHref, communitySection } from "./communityNavigation.js";

test("community sections preserve direct chat links and ignore malformed identifiers", () => {
  assert.equal(communitySection(""), "posts");
  assert.equal(communitySection("?section=friends"), "friends");
  assert.equal(communitySection("?section=collections"), "collections");
  assert.equal(communitySection("?section=notifications"), "notifications");
  assert.equal(communitySection("?chat=42"), "messages");
  assert.equal(communitySection("?chat=-42"), "posts");
  assert.equal(communitySection("?section=unexpected&chat=0"), "posts");
  assert.equal(communitySection("?section=posts&chat=42"), "posts");
});

test("switching community sections keeps feed filters but removes an inactive chat", () => {
  const target = communityHref("friends", { search: "?q=%D1%82%D0%B5%D0%BC%D0%B0&scope=following&chat=42" });
  const params = new URL(target, "http://localhost").searchParams;
  assert.equal(params.get("q"), "тема");
  assert.equal(params.get("scope"), "following");
  assert.equal(params.get("section"), "friends");
  assert.equal(params.has("chat"), false);
  assert.equal(communityHref("posts", { search: "?section=messages&chat=42" }), "/feed");
  assert.equal(communityHref("collections"), "/feed?section=collections");
  assert.equal(communityHref("notifications"), "/feed?section=notifications");
});

test("profile messages stay in profile and identifiers never become URL markup", () => {
  assert.equal(communityHref("messages", { base: "/profile", chatId: 12 }), "/profile?section=messages&chat=12");
  assert.equal(communityHref("messages", { chatId: "12&admin=1" }), "/feed?section=messages");
  assert.equal(communityHref("posts", { base: "https://example.com" }), "/feed");
});
