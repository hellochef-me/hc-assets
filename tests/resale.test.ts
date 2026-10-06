import { test } from "node:test";
import assert from "node:assert/strict";
import { resaleScenarios } from "../lib/resale";
import type { ResaleEvidence } from "../lib/server/integrations";
const empty: ResaleEvidence = {
  comparables: [],
  rangeAED: null,
  asOf: null,
  limitations: [],
};
test("indicative scenarios use rough explicit factors while leaving verified source prices and evidence unchanged", () => {
  const evidence = { ...empty, rangeAED: { low: 1000, high: 1500 } };
  const before = JSON.stringify(evidence);
  const scenarios = resaleScenarios(evidence);
  assert.deepEqual(
    scenarios.map(({ low, high }) => ({ low, high })),
    [
      { low: 800, high: 1500 },
      { low: 500, high: 1125 },
      { low: 100, high: 450 },
    ],
  );
  assert.match(scenarios[2].assumptions, /AED 0/);
  assert.equal(JSON.stringify(evidence), before);
  assert.deepEqual(resaleScenarios(empty), []);
});
test("model best guesses retain their good-condition anchor and never become verified comparables", () => {
  const evidence: ResaleEvidence = {
    ...empty,
    indicative: {
      goodWorkingAED: { low: 600, high: 900 },
      estimatedAt: "2026-10-06T00:00:00Z",
      basis: "model-estimate",
      reasoning: "Unknown configuration",
      assumptions: [],
    },
  };
  assert.deepEqual(
    resaleScenarios(evidence).map(({ low, high }) => ({ low, high })),
    [
      { low: 600, high: 900 },
      { low: 300, high: 675 },
      { low: 60, high: 275 },
    ],
  );
  assert.deepEqual(evidence.comparables, []);
  assert.equal(evidence.rangeAED, null);
});
