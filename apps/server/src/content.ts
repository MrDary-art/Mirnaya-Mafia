import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario } from "@arena/domain";
import { validateScenario } from "@arena/domain";

export function loadScenarios(root = process.cwd()): Scenario[] {
  const dir = join(root, "packages/content/scenarios");
  const scenarios = readdirSync(dir).filter(name => name.endsWith(".json")).map(name => {
    const scenario = JSON.parse(readFileSync(join(dir, name), "utf8")) as Scenario;
    validateScenario(scenario);
    return scenario;
  });
  if (scenarios.length !== 15) throw Error(`Ожидалось 15 сценариев, найдено ${scenarios.length}`);
  return scenarios;
}
