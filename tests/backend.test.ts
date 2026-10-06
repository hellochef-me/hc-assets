import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  existingSheetId,
  importedSnapshot,
  previewSource,
  assertWritable,
  intelligence,
} from "../lib/server/backend";
import { inventoryHeaders, historyHeaders } from "../lib/server/sheets";
import { reserveAiRequest } from "../lib/server/ai-budget";
async function temporary(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "hc-backend-test-"));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("authorized snapshot decoding preserves originals and labels timestamped read-only source", () =>
  temporary(async (directory) => {
    const row = inventoryHeaders.map(
      (h) =>
        ({
          id: "ORIGINAL",
          assetName: "Fictional test",
          serialNumber: "S-1",
          purchaseCurrency: "JPY",
          purchasePrice: "199.20",
        })[h as "id"] || "",
    );
    await writeFile(
      path.join(directory, "readonly-sheet.json"),
      JSON.stringify({
        spreadsheetId: existingSheetId,
        readAt: "2026-10-06T00:00:00Z",
        tables: [
          [inventoryHeaders, row],
          [historyHeaders],
          [
            ["Name", "Department"],
            ["Fictional person", "Test"],
          ],
        ],
      }),
    );
    const value = await importedSnapshot(directory);
    assert.equal(value?.assets[0].id, "ORIGINAL");
    assert.equal(value?.assets[0].purchaseCurrency, "JPY");
    assert.equal(value?.assets[0].location, "");
    assert.equal(value?.source?.readOnly, true);
    assert.equal(value?.source?.kind, "sheet-snapshot");
    assert.equal((await previewSource(directory)).kind, "sheet-snapshot");
  }));
test("missing snapshot permits demo, corrupt snapshot fails closed without fake fallback", () =>
  temporary(async (directory) => {
    assert.equal(await importedSnapshot(directory), null);
    assert.equal((await previewSource(directory)).kind, "demo");
    await writeFile(path.join(directory, "readonly-sheet.json"), "broken");
    await assert.rejects(
      previewSource(directory),
      /Fictional data was not substituted/,
    );
  }));
test("live-readonly blocks writes and AI; staging forbids the production Sheet ID", async () => {
  const previous = process.env.HC_ASSETS_BACKEND,
    id = process.env.HC_ASSETS_SPREADSHEET_ID;
  try {
    process.env.HC_ASSETS_BACKEND = "live-readonly";
    await assert.rejects(assertWritable(), /read only/);
    await assert.rejects(intelligence(), /not connected/);
    process.env.HC_ASSETS_BACKEND = "staging";
    process.env.HC_ASSETS_SPREADSHEET_ID = existingSheetId;
    await assert.rejects(
      previewSource(),
      /Production test writes are prohibited/,
    );
  } finally {
    if (previous === undefined) delete process.env.HC_ASSETS_BACKEND;
    else process.env.HC_ASSETS_BACKEND = previous;
    if (id === undefined) delete process.env.HC_ASSETS_SPREADSHEET_ID;
    else process.env.HC_ASSETS_SPREADSHEET_ID = id;
  }
});
test("AI allowance persists attempts across restart and resets minute/day independently", () =>
  temporary(async (directory) => {
    const now = Date.parse("2026-10-06T00:00:00Z");
    await reserveAiRequest(directory, { daily: 2, minute: 1 }, now);
    await assert.rejects(
      reserveAiRequest(directory, { daily: 2, minute: 1 }, now),
      /allowance/,
    );
    await reserveAiRequest(directory, { daily: 2, minute: 1 }, now + 60000);
    await assert.rejects(
      reserveAiRequest(directory, { daily: 2, minute: 1 }, now + 120000),
      /allowance/,
    );
    await reserveAiRequest(directory, { daily: 2, minute: 1 }, now + 86400000);
    assert.equal(
      JSON.parse(await readFile(path.join(directory, "ai-budget.json"), "utf8"))
        .daily,
      1,
    );
  }));
test("approved OCR works independently of Sheet writes and resale configuration; credential presence alone never enables it", async () => {
  const names = [
    "HC_ASSETS_BACKEND",
    "OPENAI_API_KEY",
    "HC_ASSETS_OPENAI_MODEL",
    "HC_ASSETS_SEARCH_MODEL",
    "HC_ASSETS_AI_ENABLED",
    "HC_ASSETS_OCR_ENABLED",
    "HC_ASSETS_RESALE_ENABLED",
    "HC_ASSETS_WRITES_ENABLED",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    process.env.HC_ASSETS_BACKEND = "live-readonly";
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    process.env.HC_ASSETS_OPENAI_MODEL = "synthetic-vision";
    for (const name of names.slice(3)) delete process.env[name];
    assert.equal((await previewSource()).ocrEnabled, false);
    await assert.rejects(intelligence(), /not connected/);
    process.env.HC_ASSETS_OCR_ENABLED = "approved";
    const source = await previewSource();
    assert.equal(source.ocrEnabled, true);
    assert.equal(source.resaleEnabled, false);
    assert.equal(source.readOnly, true);
    await intelligence("ocr"); // Constructs a provider, makes no paid call.
    await assert.rejects(intelligence("resale"), /not connected/);
    await assert.rejects(assertWritable(), /read only/);
    process.env.HC_ASSETS_BACKEND = "live";
    assert.equal((await previewSource()).readOnly, true);
    process.env.HC_ASSETS_WRITES_ENABLED = "approved";
    assert.equal((await previewSource()).readOnly, false);
  } finally {
    for (const [name, value] of previous)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
test("active/corrupt AI budget locks fail closed", () =>
  temporary(async (directory) => {
    await mkdir(path.join(directory, "ai-budget.lock"));
    await assert.rejects(reserveAiRequest(directory), /busy/);
    await rm(path.join(directory, "ai-budget.lock"), { recursive: true });
    await writeFile(path.join(directory, "ai-budget.json"), "broken");
    await assert.rejects(reserveAiRequest(directory), /requires review/);
  }));
