import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { planDuplicateConsolidation } from "../lib/server/duplicate-cleanup";
import { decodeControlledSnapshot } from "../lib/server/sheet-snapshot";
import { inventoryHeaders, historyHeaders } from "../lib/server/sheets";
function sample() {
  const row = (id: string, serial: string, owner: string) =>
    inventoryHeaders.map(
      (h) =>
        ({
          id,
          serialNumber: serial,
          assetName: "Fictional laptop",
          assignedTo: owner,
          status: owner ? "in_use" : "spare",
          manufacturer: "Apple",
          model: "Laptop 14",
          notes: "Original note",
        })[h] || "",
    );
  return [
    [
      inventoryHeaders,
      row("old-id", "QY8C7K1QR9", "Fixture Person"),
      row("new-id", "QYC7K1QR9", ""),
    ],
    [
      historyHeaders,
      [
        "history-id",
        "new-id",
        "Fictional laptop",
        "QYC7K1QR9",
        "",
        "",
        "2026-10-06T00:00:00Z",
        "Test",
        "Created",
      ],
    ],
    [
      ["name", "department"],
      ["Fixture Person", "Demo"],
    ],
    [["id", "version", "part", "json"]],
    [["id", "json"]],
    [["requestId", "digest", "part", "json"]],
  ];
}
const options = () => ({
  tables: sample(),
  sheetIds: {
    Inventory: 0,
    assignment_history: 1,
    Employees: 2,
    HCAssets_records: 3,
    HCAssets_movements: 4,
    HCAssets_commands: 5,
  },
  sourceId: "new-id",
  targetId: "old-id",
  sourceSerial: "QYC7K1QR9",
  targetSerial: "QY8C7K1QR9",
  sourceVersion: 1,
  targetVersion: 1,
  labelVerified: true,
  requestId: randomUUID(),
});
test("cleanup preserves original IDs and history, clears archived serial, retains owner and creates alias", () => {
  const args = options();
  const before = structuredClone(args.tables);
  const plan = planDuplicateConsolidation(args);
  assert.deepEqual(args.tables, before);
  const snapshot = decodeControlledSnapshot(plan.next.slice(0, 5));
  assert.equal(snapshot.assets.length, 1);
  assert.equal(snapshot.assets[0].id, "old-id");
  assert.equal(snapshot.assets[0].assignee, "Fixture Person");
  assert.equal(snapshot.assets[0].serial, "QY8C7K1QR9");
  assert.deepEqual(snapshot.assets[0].mergedFromIds, ["new-id"]);
  assert.deepEqual(snapshot.aliases, { "new-id": "old-id" });
  assert.equal(plan.next[0][2][0], "new-id");
  assert.equal(plan.next[0][2][5], "");
  assert.equal(snapshot.history.length, 2);
  assert.ok(snapshot.history.some((e) => e.assetId === "new-id"));
  assert.equal(plan.intent[0], args.requestId);
});
test("cleanup refuses unverified identity, changed versions, owner conflicts and pending writes", () => {
  assert.throws(
    () => planDuplicateConsolidation({ ...options(), labelVerified: false }),
    /verification/,
  );
  assert.throws(
    () => planDuplicateConsolidation({ ...options(), sourceVersion: 3 }),
    /changed/,
  );
  const owner = options();
  owner.tables[0][2][14] = "Different person";
  assert.throws(() => planDuplicateConsolidation(owner), /Conflicting owners/);
  const pending = options();
  pending.tables[5].push([
    "pending",
    "digest",
    "0",
    JSON.stringify({ state: "pending" }),
  ]);
  assert.throws(() => planDuplicateConsolidation(pending), /pending write/);
});
