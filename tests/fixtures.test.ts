import test from "node:test";
import assert from "node:assert/strict";
import { fixtures } from "../lib/fixtures";
test("fictional snapshots isolate employee edits and duplicate-name test scenarios", () => {
  const first = fixtures(),
    second = fixtures();
  first.people[0].department = "Changed for a test";
  first.people.push({ name: "Nora Ellis", department: "Engineering" });
  assert.equal(second.people.length, 3);
  assert.equal(second.people[0].department, "Design");
  assert.equal(fixtures().people.length, 3);
  assert.equal(fixtures().people[0].department, "Design");
});
