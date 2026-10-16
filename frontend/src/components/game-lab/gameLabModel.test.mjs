import assert from "node:assert/strict";
import test from "node:test";
import { backgroundPosition, caseAction, characterImage, characterImages, EMOTION_LABELS, shortcutFor, trainerProgress } from "./gameLabModel.js";

test("Game Lab presentation model maps progress and actions", () => {
  assert.equal(trainerProgress(2, 5), 40);
  assert.equal(trainerProgress(0, 0), 0);
  assert.equal(caseAction({}), "Начать кейс");
  assert.equal(caseAction({ run: { status: "active" } }), "Продолжить");
  assert.equal(caseAction({ run: { status: "completed" } }), "Посмотреть результат");
});

test("assets and keyboard shortcuts are deterministic", () => {
  assert.equal(backgroundPosition("office"), "100% 100%");
  assert.equal(backgroundPosition("apartment"), "100% 0%");
  assert.equal(characterImage({ portrait: "viktor" }), "/assets/game-lab/red-zone/viktor.webp");
  assert.equal(characterImage({ portrait: "viktor" }, "receptive"), "/assets/game-lab/red-zone/viktor-receptive.webp");
  assert.equal(characterImage({ portrait: "viktor" }, "escalated"), "/assets/game-lab/red-zone/viktor-escalated.webp");
  assert.equal(characterImage({ portrait: "../../secret" }), "/assets/game-lab/red-zone/secret.webp");
  assert.equal(characterImages({ portrait: "viktor" }).length, 3);
  assert.equal(EMOTION_LABELS.receptive, "Готов услышать");
  assert.equal(shortcutFor(0), "1");
  assert.equal(shortcutFor(9), "");
});
