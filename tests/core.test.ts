import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore, StoreError } from "../lib/server/store";
import {
  blankAsset,
  assetInput,
  findBySerial,
  serialIdentity,
  inputOf,
  movementState,
  movementInput,
} from "../lib/model";
import { fixtures } from "../lib/fixtures";
import {
  decodeInventory,
  decodeHistory,
  decodeEmployees,
  inventoryHeaders,
  ReadOnlySheetAdapter,
} from "../lib/server/sheets";
import { guard, body, failure } from "../lib/server/http";
const intake = (serial = "NEW-001") => ({
  ...blankAsset(),
  name: "Test equipment",
  serial,
  serialChecked: !!serial,
});
async function local(fn: (s: LocalStore, dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "hc-assets-test-"));
  try {
    await fn(new LocalStore(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("serial identity trims and ignores case, preserves meaningful internal characters", () => {
  assert.equal(serialIdentity("  Ab-123  "), "ab-123");
  assert.notEqual(serialIdentity("AB 123"), serialIdentity("AB123"));
  assert.notEqual(serialIdentity("AB-123"), serialIdentity("AB123"));
  assert.equal(findBySerial(fixtures().assets, " demo-c02x148 ").length, 1);
  assert.equal(findBySerial(fixtures().assets, "").length, 0);
});
test("legacy serial duplicates remain explicit multiple matches", () => {
  const a = fixtures().assets[0];
  assert.equal(
    findBySerial(
      [a, { ...a, id: "legacy-other", serial: " demo-c02x148 " }],
      a.serial,
    ).length,
    2,
  );
});
test("unsupported condition/specs cannot be claimed as verified", () => {
  assert.equal(
    assetInput.safeParse({ ...intake(), condition: "Good" }).success,
    false,
  );
  assert.equal(
    assetInput.safeParse({ ...intake(), specs: "16 GB" }).success,
    false,
  );
  assert.equal(assetInput.safeParse(intake()).success, true);
  assert.equal(
    assetInput.safeParse({ ...intake(), serialChecked: false }).success,
    false,
  );
});
test("confirmed creates persist with audit, request receipt and unknown state", () =>
  local(async (s, dir) => {
    const asset = await s.commit("create", {
      asset: intake(),
      requestId: randomUUID(),
    });
    const reloaded = await new LocalStore(dir).snapshot();
    assert.equal(reloaded.assets[0].id, asset.id);
    assert.equal(asset.condition, "Unknown");
    assert.equal(asset.status, "Needs review");
    assert.equal(reloaded.history[0].action, "Created");
    assert.equal(reloaded.history[0].actor, "Demo operator");
    assert.ok(reloaded.history[0].at);
    assert.equal(
      Object.keys(
        JSON.parse(await readFile(path.join(dir, "inventory.json"), "utf8"))
          .requests,
      ).length,
      1,
    );
  }));
test("lost-response retry returns same receipt across server restart, no duplicate audit", () =>
  local(async (s, dir) => {
    const input = { asset: intake(), requestId: randomUUID() };
    const first = await s.commit("create", input);
    const retry = await new LocalStore(dir).commit("create", input);
    assert.deepEqual(first, retry);
    assert.equal(
      (await s.snapshot()).history.filter((e) => e.assetId === first.id).length,
      1,
    );
    await assert.rejects(
      s.commit("create", { ...input, asset: intake("OTHER") }),
      /different changes/,
    );
  }));
test("creates and edits enforce serial uniqueness without changing other records", () =>
  local(async (s) => {
    await assert.rejects(
      s.commit("create", {
        asset: intake(" demo-c02x148 "),
        requestId: randomUUID(),
      }),
      (e: unknown) =>
        e instanceof StoreError && e.status === 409 && e.assetId === "DEMO-001",
    );
    const a = fixtures().assets[1];
    await assert.rejects(
      s.commit(
        "edit",
        {
          asset: { ...inputOf(a), serial: "DEMO-C02X148" },
          expectedVersion: 1,
          requestId: randomUUID(),
        },
        a.id,
      ),
      /existing asset/,
    );
    assert.equal(
      (await s.snapshot()).assets.find((x) => x.id === a.id)!.version,
      1,
    );
  }));
test("simultaneous creates serialize; retry cannot insert duplicate", () =>
  local(async (s, dir) => {
    const a = { asset: intake(), requestId: randomUUID() },
      b = { asset: intake(" new-001 "), requestId: randomUUID() };
    const results = await Promise.allSettled([
      s.commit("create", a),
      new LocalStore(dir).commit("create", b),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results[0].status === "rejected" ? a : b;
    await assert.rejects(s.commit("create", failed), /existing asset/);
    assert.equal(
      findBySerial((await s.snapshot()).assets, "NEW-001").length,
      1,
    );
  }));
test("stale edits fail and matching edit retries remain idempotent", () =>
  local(async (s) => {
    const a = fixtures().assets[0],
      input = {
        asset: { ...inputOf(a), notes: "Updated" },
        expectedVersion: 1,
        requestId: randomUUID(),
      };
    const first = await s.commit("edit", input, a.id);
    assert.equal(first.id, a.id);
    assert.equal(first.createdAt, a.createdAt);
    assert.equal(first.version, 2);
    await assert.rejects(
      s.commit("edit", { ...input, requestId: randomUUID() }, a.id),
      /changed while/,
    );
    assert.deepEqual(await s.commit("edit", input, a.id), first);
  }));
test("transfer, return, repair, retire record full state and forbid later movements", () =>
  local(async (s) => {
    let a = fixtures().assets[0];
    for (const [action, assignee, location, status] of [
      ["Transfer", "Maya Chen", "Engineering Area", "Assigned"],
      ["Return", "", "Engineering Area", "Available"],
      ["Repair", "", "Engineering Area", "Repair"],
      ["Retire", "", "Engineering Area", "Retired"],
    ]) {
      a = await s.commit(
        "move",
        {
          action,
          assignee,
          location,
          notes: "Manual check",
          expectedVersion: a.version,
          requestId: randomUUID(),
        },
        a.id,
      );
      assert.equal(a.status, status);
    }
    const history = (await s.snapshot()).history.filter(
      (e) => e.assetId === a.id,
    );
    assert.equal(history[0].from.status, "Repair");
    assert.equal(history[0].to.status, "Retired");
    assert.equal(history[0].notes, "Manual check");
    await assert.rejects(
      s.commit(
        "move",
        {
          action: "Assign",
          assignee: "Nora Ellis",
          location: "Locker",
          notes: "",
          expectedVersion: a.version,
          requestId: randomUUID(),
        },
        a.id,
      ),
      /Retired/,
    );
  }));
test("bad movement is rejected with no partial timeline", () =>
  local(async (s) => {
    const a = fixtures().assets[1];
    await assert.rejects(
      s.commit(
        "move",
        {
          action: "Assign",
          assignee: "Not a person",
          location: "Engineering Area",
          notes: "",
          expectedVersion: 1,
          requestId: randomUUID(),
        },
        a.id,
      ),
      /directory/,
    );
    assert.equal((await s.snapshot()).history.length, 2);
    assert.equal(
      movementState(a, {
        action: "Assign",
        assignee: "Nora Ellis",
        location: "Engineering Area",
        notes: "",
        expectedVersion: 1,
        requestId: randomUUID(),
      }).status,
      "Assigned",
    );
  }));
test("corrupt store and existing writer lock fail closed", () =>
  local(async (s, dir) => {
    await writeFile(path.join(dir, "inventory.json"), "not-json");
    await assert.rejects(
      s.commit("create", { asset: intake(), requestId: randomUUID() }),
      /could not be read/,
    );
    assert.equal(
      await readFile(path.join(dir, "inventory.json"), "utf8"),
      "not-json",
    );
    await mkdir(path.join(dir, "writer.lock"));
    await assert.rejects(
      s.commit("create", { asset: intake(), requestId: randomUUID() }),
      /Another save/,
    );
  }));
test("Sheet decoding preserves IDs, original values, currency and unknowns", () => {
  const row = inventoryHeaders.map(
    (h) =>
      (
        ({
          id: "original-17",
          serialNumber: "A-12 B",
          purchaseCurrency: "USD",
          purchasePrice: "42.50",
          status: "spare",
          assetName: "Existing",
          notes: "=SUM(A1:A2)",
        }) as Record<string, string>
      )[h] || "",
  );
  const a = decodeInventory([inventoryHeaders, row])[0];
  assert.equal(a.id, "original-17");
  assert.equal(a.serial, "A-12 B");
  assert.equal(a.condition, "Unknown");
  assert.equal(a.location, "");
  assert.equal(a.purchaseCurrency, "USD");
  assert.equal(a.purchaseCost, "42.50");
  assert.equal(a.raw!.notes, "=SUM(A1:A2)");
  assert.throws(
    () => decodeInventory([inventoryHeaders, row, row]),
    /Duplicate asset ID/,
  );
  assert.equal(
    decodeHistory([
      ["id", "assetId", "changedAt"],
      ["h", "original-17", ""],
    ])[0].from.location,
    "Unknown",
  );
  assert.deepEqual(
    decodeEmployees([
      ["Name", "Department"],
      ["Fictional employee", "IT"],
    ]),
    [{ name: "Fictional employee", department: "IT" }],
  );
});
test("read-only Sheet adapter validates HTTP and payload without writes", async () => {
  let method;
  const adapter = new ReadOnlySheetAdapter(
    "fictional-sheet",
    async () => "test-token",
    async (_url, init) => {
      method = init?.method;
      return Response.json({ values: [["id"], ["x"]] });
    },
  );
  assert.deepEqual(await adapter.read("Inventory"), [["id"], ["x"]]);
  assert.equal(method, undefined);
  await assert.rejects(
    new ReadOnlySheetAdapter(
      "fictional",
      async () => "",
      async () => new Response("no", { status: 403 }),
    ).read("Inventory"),
    /403/,
  );
  await assert.rejects(
    new ReadOnlySheetAdapter(
      "fictional",
      async () => "",
      async () => Response.json({ error: "not values" }),
    ).read("Inventory"),
    /Unexpected/,
  );
});
test("local guard, origin rejection, body limits and safe errors", async () => {
  guard(new Request("http://localhost:3405/api/inventory"));
  assert.throws(
    () => guard(new Request("https://public.example/api/inventory")),
    /private local/,
  );
  assert.throws(
    () =>
      guard(
        new Request("http://localhost:3405/api/inventory", {
          headers: { origin: "https://other.example" },
        }),
      ),
    /origin/,
  );
  await assert.rejects(
    body(
      new Request("http://localhost", {
        method: "POST",
        body: "{",
        headers: { "Content-Type": "application/json" },
      }),
    ),
    /JSON/,
  );
  await assert.rejects(
    body(
      new Request("http://localhost", {
        method: "POST",
        body: "a".repeat(3000001),
        headers: { "Content-Type": "application/json" },
      }),
    ),
    /too large/,
  );
  assert.equal(
    (await failure(new Error("secret-provider-detail")).json()).error.includes(
      "secret",
    ),
    false,
  );
});
test("Sheet aliases cannot overwrite identity and unknown currency is preserved", () => {
  assert.throws(
    () =>
      decodeInventory([
        ["id", "ID"],
        ["a", "b"],
      ]),
    /Duplicate Sheet headers/,
  );
  const a = decodeInventory([
    ["id", "purchaseCurrency", "purchasePrice"],
    ["keep-id", "JPY", "400"],
  ])[0];
  assert.equal(a.purchaseCurrency, "JPY");
  assert.equal(a.raw!.purchaseCurrency, "JPY");
});
test("Next internal loopback URL uses verified incoming Host for origin checking", () => {
  guard(
    new Request("http://localhost:3405/api/inventory", {
      headers: { host: "127.0.0.1:3405", origin: "http://127.0.0.1:3405" },
    }),
  );
  assert.throws(
    () =>
      guard(
        new Request("http://localhost:3405/api/inventory", {
          headers: { host: "public.example", origin: "http://public.example" },
        }),
      ),
    /private local/,
  );
});

test("create, edit and movement commands reject other storage locations without changing records", () =>
  local(async (store) => {
    const before = await store.snapshot();
    const asset = before.assets[1];
    for (const location of [
      "",
      "Unknown",
      "Workshop",
      "IT storage",
      "engineering area",
      "Locker ",
    ]) {
      assert.equal(
        assetInput.safeParse({ ...intake(), location }).success,
        false,
      );
      assert.equal(
        movementInput.safeParse({
          action: "Assign",
          assignee: "Nora Ellis",
          location,
          notes: "",
          expectedVersion: 1,
          requestId: randomUUID(),
        }).success,
        location === "",
      );
    }
    await assert.rejects(
      store.commit("create", {
        asset: { ...intake(), location: "Elsewhere" },
        requestId: randomUUID(),
      }),
      /Choose Engineering Area or Locker/,
    );
    await assert.rejects(
      store.commit(
        "edit",
        {
          asset: { ...inputOf(asset), location: "Elsewhere" },
          expectedVersion: 1,
          requestId: randomUUID(),
        },
        asset.id,
      ),
      /Choose Engineering Area or Locker/,
    );
    await assert.rejects(
      store.commit(
        "move",
        {
          action: "Assign",
          assignee: "Nora Ellis",
          location: "Elsewhere",
          notes: "",
          expectedVersion: 1,
          requestId: randomUUID(),
        },
        asset.id,
      ),
      /Choose Engineering Area or Locker/,
    );
    assert.deepEqual(await store.snapshot(), before);
    for (const location of ["Engineering Area", "Locker"]) {
      assert.equal(
        assetInput.safeParse({ ...intake(), location }).success,
        true,
      );
    }
  }));

test("location is optional only while assigned; edits use current server assignment and unassigning requires storage", () =>
  local(async (store) => {
    let asset = await store.commit("create", {
      asset: intake("OPTIONAL-LOCATION"),
      requestId: randomUUID(),
    });
    const move = (action: string, assignee: string, location: string) => ({
      action,
      assignee,
      location,
      notes: "Storage check",
      expectedVersion: asset.version,
      requestId: randomUUID(),
    });
    await assert.rejects(
      store.commit("move", move("Assign", "", ""), asset.id),
      /Choose Engineering Area or Locker/,
    );
    asset = await store.commit(
      "move",
      move("Assign", "Nora Ellis", ""),
      asset.id,
    );
    assert.equal(asset.location, "");
    assert.equal(asset.assignee, "Nora Ellis");
    asset = await store.commit(
      "edit",
      {
        asset: { ...inputOf(asset), notes: "Still with assignee" },
        expectedVersion: asset.version,
        requestId: randomUUID(),
      },
      asset.id,
    );
    const before = await store.snapshot();
    for (const action of ["Return", "Repair", "Retire"])
      await assert.rejects(
        store.commit("move", move(action, "Nora Ellis", ""), asset.id),
        /Choose Engineering Area or Locker/,
      );
    assert.deepEqual(await store.snapshot(), before);
    asset = await store.commit(
      "move",
      move("Transfer", "Maya Chen", ""),
      asset.id,
    );
    assert.equal(asset.location, "");
    asset = await store.commit("move", move("Return", "", "Locker"), asset.id);
    assert.equal(asset.location, "Locker");
    assert.equal(asset.assignee, "");
    await assert.rejects(
      store.commit(
        "edit",
        {
          asset: { ...inputOf(asset), location: "" },
          expectedVersion: asset.version,
          requestId: randomUUID(),
        },
        asset.id,
      ),
      /Choose Engineering Area or Locker/,
    );
  }));

test("API validation reports bad inputs as 400 without implying an uncertain write", () => {
  const result = assetInput.safeParse({ ...intake(), location: "Elsewhere" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(failure(result.error).status, 400);
});
