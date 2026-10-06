import { test } from "node:test";
import assert from "node:assert/strict";
import { BlobPreconditionFailedError } from "@vercel/blob";
import {
  acquireHostedWriter,
  reserveHostedAiRequest,
  type CoordinationStorage,
} from "../lib/server/hosted-coordination";
import { guard } from "../lib/server/http";
import { DirectSheetWriter } from "../lib/server/direct-sheet-writer";
import { writerMock } from "./helpers/writer";
import { blankAsset, assetInput, thumbnailPhoto } from "../lib/model";
import { randomUUID } from "node:crypto";

test("label evidence never becomes a thumbnail without an explicitly selected device photo; cover identity persists in Sheet receipts", async () => {
  const label = "data:image/png;base64,bGFiZWw=";
  const device = "data:image/png;base64,ZGV2aWNl";
  assert.equal(thumbnailPhoto({ photos: [label] }), null);
  assert.equal(
    thumbnailPhoto({ photos: [label, device], coverPhotoIndex: 1 }),
    device,
  );
  const mock = await writerMock(),
    { storage } = memory();
  const client = new DirectSheetWriter(
    "fictional-sheet",
    async () => "fictional-token",
    mock.restFetcher,
    "/unwritable",
    () => acquireHostedWriter(storage),
  );
  const draft = {
    ...blankAsset(),
    name: "Fictional cover test",
    location: "Locker",
    photos: [label, device],
    coverPhotoIndex: 1,
  };
  const command = { requestId: randomUUID(), asset: draft };
  const saved = await client.commit("create", command, "Fictional operator");
  assert.equal(saved.coverPhotoIndex, 1);
  assert.equal(thumbnailPhoto(saved), device);
  assert.equal(
    (await client.commit("create", command, "Fictional operator"))
      .coverPhotoIndex,
    1,
  );
  assert.equal(
    assetInput.safeParse({ ...draft, coverPhotoIndex: 2 }).success,
    false,
  );
});

function memory() {
  const values = new Map<string, { value: unknown; etag: string }>();
  let version = 0;
  const storage: CoordinationStorage = {
    async read(key) {
      return structuredClone(values.get(key) || null);
    },
    async write(key, value, etag) {
      if (values.get(key)?.etag !== etag)
        throw new BlobPreconditionFailedError();
      const next = String(++version);
      values.set(key, { value: structuredClone(value), etag: next });
      return next;
    },
  };
  return { storage, values };
}
test("hosted mutex admits one concurrent holder, never expires or steals a terminated holder, and releases conditionally", async () => {
  const { storage } = memory();
  const result = await Promise.allSettled(
    Array.from({ length: 12 }, () => acquireHostedWriter(storage)),
  );
  const winners = result.filter((x) => x.status === "fulfilled");
  assert.equal(winners.length, 1);
  await assert.rejects(
    acquireHostedWriter(storage),
    /running or needs recovery/,
  );
  if (winners[0].status === "fulfilled") await winners[0].value();
  const release = await acquireHostedWriter(storage);
  await release();
});
test("hosted budget reserves concurrently without exceeding limits, resets windows and refuses ambiguous storage results before paid calls", async () => {
  const { storage, values } = memory();
  const limits = { daily: 4, minute: 4 };
  const now = Date.parse("2026-10-06T10:00:00Z");
  const results = await Promise.allSettled(
    Array.from({ length: 16 }, () =>
      reserveHostedAiRequest(limits, storage, now),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 4);
  assert.equal(
    (values.get("coordination/ai-budget.json")!.value as { daily: number })
      .daily,
    4,
  );
  await assert.rejects(
    reserveHostedAiRequest(limits, storage, now + 60_000),
    /allowance has been reached/,
  );
  await reserveHostedAiRequest(limits, storage, now + 86_400_000);
  const broken = {
    ...storage,
    async write() {
      throw new Error("lost acknowledgement");
    },
  };
  await assert.rejects(
    reserveHostedAiRequest(limits, broken, now + 86_400_000),
    /No provider request was sent/,
  );
});
test("public production guard accepts only approved custom HTTPS domain and same-origin changes", () => {
  const before = {
    env: process.env.VERCEL_ENV,
    access: process.env.HC_ASSETS_PUBLIC_ACCESS,
  };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.HC_ASSETS_PUBLIC_ACCESS = "approved";
    guard(new Request("https://assets.hellochef.me/api/inventory"));
    guard(
      new Request("https://assets.hellochef.me/api/inventory", {
        method: "POST",
        headers: { origin: "https://assets.hellochef.me" },
      }),
    );
    for (const r of [
      new Request("https://evil.example/api/inventory"),
      new Request("http://assets.hellochef.me/api/inventory"),
      new Request("https://assets.hellochef.me/api/inventory", {
        method: "POST",
      }),
      new Request("https://assets.hellochef.me/api/inventory", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    ])
      assert.throws(() => guard(r));
    process.env.HC_ASSETS_PUBLIC_ACCESS = "disabled";
    assert.throws(() =>
      guard(new Request("https://assets.hellochef.me/api/inventory")),
    );
  } finally {
    if (before.env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before.env;
    if (before.access === undefined) delete process.env.HC_ASSETS_PUBLIC_ACCESS;
    else process.env.HC_ASSETS_PUBLIC_ACCESS = before.access;
  }
});
test("hosted direct writer uses shared mutex instead of local disk and preserves confirmed receipt replay", async () => {
  const { storage } = memory(),
    mock = await writerMock();
  const client = new DirectSheetWriter(
    "fictional-sheet",
    async () => "fictional-token",
    mock.restFetcher,
    "/unwritable",
    () => acquireHostedWriter(storage),
  );
  const command = {
    requestId: randomUUID(),
    asset: {
      ...blankAsset(),
      name: "Fictional hosted fixture",
      location: "Locker",
      serial: "HOSTED-TEST",
      serialChecked: true,
    },
  };
  mock.lose();
  await assert.rejects(
    client.commit("create", command, "Public visitor (sign-in deferred)"),
    /unconfirmed/,
  );
  const saved = await client.commit(
    "create",
    command,
    "Public visitor (sign-in deferred)",
  );
  assert.equal(saved.name, command.asset.name);
  assert.equal(mock.calls(), 1);
});
