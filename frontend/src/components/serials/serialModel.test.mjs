import test from "node:test";
import assert from "node:assert/strict";
import { backgroundPosition, characterFor, choiceDisabledReason, choicePrice, latestRun, nextEpisode, portraitPosition, sceneHasEnding, sceneLines, speakerLabel, storyTheme, withoutAgeLabel } from "./serialModel.js";

test("permanently unlocked scene remains playable with an empty wallet", () => {
  const unlocked = { id: "rehearsal", cost: 3, owned: true, available: true };
  assert.equal(choicePrice(unlocked), 0);
  assert.equal(choiceDisabledReason(unlocked, 0), "");
  assert.match(choiceDisabledReason({ ...unlocked, owned: false }, 2), /ещё 1/);
});

test("stars cannot bypass the story requirements for an unlocked choice", () => {
  assert.equal(choiceDisabledReason({ cost: 3, owned: true, available: false, locked_reason: "Лера не согласилась на эту встречу" }, 100), "Лера не согласилась на эту встречу");
  assert.equal(choiceDisabledReason({ cost: 0, available: true }, 0), "");
});

test("continue picks the next available main episode and keeps bonus separate", () => {
  const payload = { run: { episode_id: "one" }, episodes: [
    { id: "one", completed: true }, { id: "bonus", bonus: true, available: true },
    { id: "two", available: true }, { id: "three", available: false },
  ] };
  assert.equal(nextEpisode(payload).id, "two");
  assert.equal(nextEpisode({ ...payload, run: { episode_id: "three" } }), undefined);
});

test("restored saves sort by server timestamp rather than slot number", () => {
  assert.equal(latestRun({ slots: [{ id: "older", slot: 3, updated_at: "2026-10-14T12:00:00" }, { id: "current", slot: 1, updated_at: "2026-10-15T12:00:00" }] }).id, "current");
  assert.equal(latestRun({ slots: [] }), undefined);
});

test("dialogues identify author-defined speakers and recognise uncommitted endings", () => {
  const story = { characters: [{ id: "teacher", name: "Анна Сергеевна", portrait: 3 }] };
  assert.equal(speakerLabel(story, "teacher"), "Анна Сергеевна");
  assert.equal(speakerLabel(story, "you"), "Вы");
  assert.equal(speakerLabel(story, "narrator"), "");
  assert.equal(characterFor(story, "teacher").portrait, 3);
  assert.equal(sceneHasEnding({ ending: { title: "Перенос" } }), true);
  assert.deepEqual(sceneLines({ dialogue: [{ speaker: "you", text: "Обсудим?" }] }), [{ speaker: "you", text: "Обсудим?" }]);
});

test("all authored categories and art aliases map to the shipped atlases", () => {
  assert.equal(storyTheme({ id: "after_school", category: "Школа" }), "school");
  assert.equal(storyTheme({ id: "first_steps" }), "first_steps");
  assert.equal(backgroundPosition("work"), backgroundPosition("office"));
  assert.equal(backgroundPosition("bedroom"), backgroundPosition("home"));
  assert.equal(portraitPosition(0), "0% 0%");
  assert.equal(portraitPosition(23), "100% 100%");
});

test("reader labels omit numeric age markers", () => {
  assert.equal(withoutAgeLabel("Ученик, 16 лет"), "Ученик");
  assert.equal(withoutAgeLabel("Подросток, 17 лет, собирающий портфолио"), "Подросток, собирающий портфолио");
  assert.equal(withoutAgeLabel("Алина, 22 года; работает дома"), "Алина, работает дома");
  assert.equal(withoutAgeLabel("16+"), "");
});
