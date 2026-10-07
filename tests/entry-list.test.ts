import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ENTRY_LIST_CHARACTER_LIMIT,
  parseEntryList,
  serializeEntryList,
} from "../lib/entry-list";
import { blankAsset, inputOf } from "../lib/model";
import { LocalStore } from "../lib/server/store";
import { decodeInventory, inventoryHeaders } from "../lib/server/sheets";
import { DirectSheetWriter } from "../lib/server/direct-sheet-writer";
import { decodeControlledSnapshot } from "../lib/server/sheet-snapshot";
import { writerMock } from "./helpers/writer";

test("legacy prose, punctuation, duplicates and literal text are not reinterpreted", () => {
  for (const value of [
    "16 GB / 512 GB",
    "Charger, adapter; spare cable",
    "- legacy note; keep this wording",
    "<script>alert('example')</script>",
  ])
    assert.deepEqual(parseEntryList(value), [value]);
  assert.deepEqual(parseEntryList("Charger\nCharger"), ["Charger", "Charger"]);
  assert.deepEqual(parseEntryList("  Keep spaces  "), ["  Keep spaces  "]);
});

test("explicit line breaks form entries and canonical serialization preserves order", () => {
  assert.deepEqual(parseEntryList("16 GB\r\n512 GB\r\n\n\t\nM2\r2022"), [
    "16 GB",
    "512 GB",
    "M2",
    "2022",
  ]);
  const entries = Object.freeze([" 16 GB ", "", "512 GB\r\nM2", "   "]);
  assert.equal(serializeEntryList(entries), "16 GB\n512 GB\nM2");
  assert.equal(
    serializeEntryList(parseEntryList("16 GB\n512 GB\nM2")),
    "16 GB\n512 GB\nM2",
  );
  assert.deepEqual(parseEntryList(""), []);
  assert.equal(serializeEntryList(["", " "]), "");
});

test("legacy Sheet specifications remain a single entry and raw columns are preserved", () => {
  const values = [
    ["id", "cpu", "ramGb", "diskGb", "notes"],
    ["legacy-id", "M2", "16", "512", "Charger, cable; adapter"],
  ];
  const rows = decodeInventory(values);
  assert.deepEqual(parseEntryList(rows[0].specs), [
    "M2 / 16 GB RAM / 512 GB storage",
  ]);
  assert.equal(rows[0].raw?.notes, values[1][4]);
});

test("mocked direct Sheet writer preserves newline entries in controlled records without changing inventory headers", async () => {
  const mock = await writerMock();
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "hcassets-entry-sheet-"),
  );
  try {
    const writer = new DirectSheetWriter(
      "fictional-sheet",
      async () => "fictional-token",
      mock.restFetcher,
      directory,
    );
    const asset = {
      ...blankAsset(),
      name: "Fictional Sheet list",
      specs: "16 GB RAM\n512 GB storage",
      specsChecked: false,
      accessories: "USB-C charger\nDock",
    };
    const created = await writer.commit(
      "create",
      { asset, requestId: randomUUID() },
      "Test operator",
    );
    const snapshot = decodeControlledSnapshot(mock.tables.slice(0, 5));
    const saved = snapshot.assets.find((a) => a.id === created.id)!;
    assert.equal(saved.specs, asset.specs);
    assert.equal(saved.accessories, asset.accessories);
    assert.deepEqual(mock.tables[0][0], inventoryHeaders);
    assert.equal(mock.tables[0][1].length, inventoryHeaders.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("multiple entries persist, edit and clear through the same local commands without affecting other records", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "hcassets-entry-list-"),
  );
  try {
    const store = new LocalStore(directory);
    const original = await store.snapshot();
    const specs = serializeEntryList(["16 GB RAM", "512 GB storage"]);
    const accessories = serializeEntryList(["USB-C charger", "Dock", "Cable"]);
    const created = await store.commit("create", {
      requestId: randomUUID(),
      asset: {
        ...blankAsset(),
        name: "Fictional list acceptance",
        specs,
        specsChecked: false,
        accessories,
      },
    });
    const persisted = (await new LocalStore(directory).snapshot()).assets.find(
      (a) => a.id === created.id,
    )!;
    assert.equal(persisted.specs, specs);
    assert.equal(persisted.accessories, accessories);
    const edited = await store.commit(
      "edit",
      {
        asset: {
          ...inputOf(persisted),
          specs: serializeEntryList(["32 GB RAM", "512 GB storage"]),
          accessories: "",
        },
        expectedVersion: persisted.version,
        requestId: randomUUID(),
      },
      persisted.id,
    );
    assert.deepEqual(parseEntryList(edited.specs), [
      "32 GB RAM",
      "512 GB storage",
    ]);
    assert.equal(edited.accessories, "");
    const beforeInvalid = await store.snapshot();
    await assert.rejects(
      store.commit(
        "edit",
        {
          asset: {
            ...inputOf(edited),
            accessories: "x".repeat(ENTRY_LIST_CHARACTER_LIMIT + 1),
          },
          expectedVersion: edited.version,
          requestId: randomUUID(),
        },
        edited.id,
      ),
      /400/,
    );
    assert.deepEqual(await store.snapshot(), beforeInvalid);
    for (const asset of original.assets) {
      assert.deepEqual(
        beforeInvalid.assets.find((a) => a.id === asset.id),
        asset,
      );
    }
    assert.deepEqual(beforeInvalid.people, original.people);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
