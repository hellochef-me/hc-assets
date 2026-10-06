import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DirectSheetWriter } from "../lib/server/direct-sheet-writer";
import { decodeControlledSnapshot } from "../lib/server/sheet-snapshot";
import { blankAsset } from "../lib/model";
import { storedAsset } from "../lib/server/sheet-gateway";
import { fixtures } from "../lib/fixtures";
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
    location: "Engineering Area",
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
    const moved = await w.client().commit(
      "move",
      {
        requestId: randomUUID(),
        expectedVersion: 1,
        action: "Assign",
        assignee: "Fixture Person",
        location: "Locker",
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

test("direct writer refuses unsupported locations before transport and preserves stored legacy locations", async () => {
  const writer = await setup();
  try {
    await assert.rejects(
      writer
        .client()
        .commit(
          "create",
          { ...input(), asset: { ...input().asset, location: "Elsewhere" } },
          "Local test operator",
        ),
      /Choose Engineering Area or Locker/,
    );
    await assert.rejects(
      writer.client().commit(
        "move",
        {
          requestId: randomUUID(),
          expectedVersion: 1,
          action: "Assign",
          assignee: "Fixture Person",
          location: "Elsewhere",
          notes: "",
        },
        "Local test operator",
        "legacy-id",
      ),
      /Choose Engineering Area or Locker/,
    );
    assert.equal(writer.mock.calls(), 0);
    assert.equal(writer.mock.tables[0].length, 1);
    assert.equal(writer.mock.tables[1].length, 1);
    assert.equal(writer.mock.tables[5].length, 1);
    const legacy = { ...fixtures().assets[0], location: "Legacy office" };
    assert.equal(storedAsset.parse(legacy).location, "Legacy office");
  } finally {
    await writer.clean();
  }
});

for (const transport of ["direct", "gateway"] as const)
  test(`${transport} Sheet writer permits blank assigned locations and requires storage on return`, async () => {
    const writer = await setup();
    try {
      const client =
        transport === "direct" ? writer.client() : writer.mock.client();
      let asset = await client.commit("create", input(), "Local test operator");
      const move = (action: string, assignee: string, location: string) => ({
        requestId: randomUUID(),
        expectedVersion: asset.version,
        action,
        assignee,
        location,
        notes: "Optional storage",
      });
      asset = await client.commit(
        "move",
        move("Assign", "Fixture Person", ""),
        "Local test operator",
        asset.id,
      );
      assert.equal(asset.location, "");
      asset = await client.commit(
        "edit",
        {
          requestId: randomUUID(),
          expectedVersion: asset.version,
          asset: { ...input().asset, location: "" },
        },
        "Local test operator",
        asset.id,
      );
      assert.equal(asset.assignee, "Fixture Person");
      await assert.rejects(
        client.commit(
          "move",
          move("Return", "", ""),
          "Local test operator",
          asset.id,
        ),
        /Choose Engineering Area or Locker/,
      );
      asset = await client.commit(
        "move",
        move("Return", "", "Locker"),
        "Local test operator",
        asset.id,
      );
      assert.equal(asset.assignee, "");
      await assert.rejects(
        client.commit(
          "edit",
          {
            requestId: randomUUID(),
            expectedVersion: asset.version,
            asset: { ...input().asset, location: "" },
          },
          "Local test operator",
          asset.id,
        ),
        /Invalid asset/,
      );
      const snapshot = decodeControlledSnapshot(writer.mock.tables.slice(0, 5));
      assert.equal(snapshot.assets[0].location, "Locker");
      assert.equal(snapshot.history.length, 4);
      assert.equal(writer.mock.calls(), 4);
    } finally {
      await writer.clean();
    }
  });

for (const transport of ["direct", "gateway"] as const)
  test(`${transport} notes-only saves preserve every other legacy column and replay lost acknowledgements`, async () => {
    const writer = await setup();
    try {
      const client =
        transport === "direct" ? writer.client() : writer.mock.client();
      const original = [
        "legacy-notes-id",
        "original_category",
        "Original asset",
        "Dell",
        "Latitude 5440",
        "UNREVIEWED-DUPLICATE",
        "Original CPU",
        "16",
        "512",
        "2023",
        "00042.00",
        "USD",
        "original date",
        "original_condition",
        "",
        "spare",
        "Existing\nnotes",
        "original creation",
        "original update",
      ];
      writer.mock.tables[0].push([...original]);
      writer.mock.tables[0].push(
        original.map((value, index) =>
          index === 0 ? "other-legacy-id" : value,
        ),
      );
      const command = {
        notes: "Replacement\n" + "x".repeat(1950),
        expectedVersion: 1,
        requestId: randomUUID(),
      };
      writer.mock.lose();
      await assert.rejects(
        client.commit("edit", command, "Fictional operator", original[0]),
        /unconfirmed/,
      );
      const saved = await client.commit(
        "edit",
        command,
        "Fictional operator",
        original[0],
      );
      assert.equal(saved.notes, command.notes);
      assert.equal(saved.location, "");
      assert.equal(saved.serialChecked, false);
      assert.equal(writer.mock.calls(), 1);
      writer.mock.tables[0][1].forEach((value, index) => {
        if (index !== 16 && index !== 18) assert.equal(value, original[index]);
      });
      assert.deepEqual(
        writer.mock.tables[0][2],
        original.map((value, index) =>
          index === 0 ? "other-legacy-id" : value,
        ),
      );
      assert.equal(writer.mock.tables[1][1][8], "Notes updated");
      await assert.rejects(
        client.commit(
          "edit",
          { ...command, requestId: randomUUID() },
          "Fictional operator",
          original[0],
        ),
        /changed/,
      );
      await assert.rejects(
        client.commit(
          "edit",
          {
            ...command,
            notes: "x".repeat(2001),
            expectedVersion: 2,
            requestId: randomUUID(),
          },
          "Fictional operator",
          original[0],
        ),
        /2,000/,
      );
      await assert.rejects(
        client.commit(
          "edit",
          {
            ...command,
            asset: input().asset,
            expectedVersion: 2,
            requestId: randomUUID(),
          },
          "Fictional operator",
          original[0],
        ),
      );
      assert.equal(writer.mock.calls(), 1);
      const cleared = await client.commit(
        "edit",
        { notes: "", expectedVersion: 2, requestId: randomUUID() },
        "Fictional operator",
        original[0],
      );
      assert.equal(cleared.notes, "");
      assert.equal(writer.mock.calls(), 2);
      assert.equal(writer.mock.tables[1].length, 3);
    } finally {
      await writer.clean();
    }
  });
