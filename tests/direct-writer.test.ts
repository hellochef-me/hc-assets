import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DirectSheetWriter } from "../lib/server/direct-sheet-writer";
import { decodeControlledSnapshot } from "../lib/server/sheet-snapshot";
import { blankAsset } from "../lib/model";
import { writerMock } from "./helpers/writer";
async function setup() {
  const mock = await writerMock();
  const directory = await mkdtemp(path.join(tmpdir(), "hc-direct-writer-"));
  return {
    mock,
    directory,
    client: () =>
      new DirectSheetWriter(
        "fictional-sheet",
        async () => "fictional-approved-token",
        mock.restFetcher,
        directory,
      ),
    clean: () => rm(directory, { recursive: true, force: true }),
  };
}
const input = () => ({
  requestId: randomUUID(),
  asset: {
    ...blankAsset(),
    name: "Fictional reviewed asset",
    location: "Test storage",
    serial: "TEST-1",
    serialChecked: true,
  },
});
test("BC-style direct writer confirms atomic Sheet state/history, replays lost response, rejects duplicates and stale versions", async () => {
  const w = await setup();
  try {
    const command = input();
    w.mock.lose();
    await assert.rejects(
      w.client().commit("create", command, "Local test operator"),
      /unconfirmed/,
    );
    const asset = await w
      .client()
      .commit("create", command, "Local test operator");
    assert.equal(w.mock.calls(), 1);
    await assert.rejects(
      w
        .client()
        .commit(
          "create",
          { ...input(), requestId: randomUUID() },
          "Local test operator",
        ),
      /already exists/,
    );
    await assert.rejects(
      w
        .client()
        .commit(
          "edit",
          { requestId: randomUUID(), expectedVersion: 2, asset: command.asset },
          "Local test operator",
          asset.id,
        ),
      /changed/,
    );
    const moved = await w
      .client()
      .commit(
        "move",
        {
          requestId: randomUUID(),
          expectedVersion: 1,
          action: "Assign",
          assignee: "Fixture Person",
          location: "Test desk",
          notes: "Verified fake movement",
        },
        "Local test operator",
        asset.id,
      );
    const saved = decodeControlledSnapshot(w.mock.tables.slice(0, 5));
    assert.equal(moved.version, 2);
    assert.equal(saved.assets[0].id, asset.id);
    assert.equal(saved.history.length, 2);
    assert.equal(saved.history[0].to.assignee, "Fixture Person");
    assert.equal(w.mock.calls(), 2);
  } finally {
    await w.clean();
  }
});
test("direct writer freezes every later command after uncertain pending intent; never automatically resubmits", async () => {
  const w = await setup();
  try {
    w.mock.suspend();
    await assert.rejects(
      w.client().commit("create", input(), "Local test operator"),
      /unconfirmed/,
    );
    await assert.rejects(
      w
        .client()
        .commit(
          "create",
          { ...input(), asset: { ...input().asset, serial: "DIFFERENT" } },
          "Local test operator",
        ),
      /paused for reconciliation/,
    );
    assert.equal(w.mock.calls(), 0);
  } finally {
    await w.clean();
  }
});
test("direct writer refuses missing schema and an existing process lock before domain writes", async () => {
  const w = await setup();
  try {
    w.mock.tables[3][0][0] = "wrong";
    await assert.rejects(
      w.client().commit("create", input(), "Local test operator"),
      /headers need review/,
    );
    const lock = path.join(
      w.directory,
      `sheet-writer-${createHash("sha256").update("fictional-sheet").digest("hex").slice(0, 20)}.lock`,
    );
    await mkdir(lock);
    await assert.rejects(
      w.client().commit("create", input(), "Local test operator"),
      /busy or needs recovery/,
    );
    assert.equal(w.mock.calls(), 0);
  } finally {
    await w.clean();
  }
});
