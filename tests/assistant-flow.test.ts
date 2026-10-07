import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtures } from "../lib/fixtures";
import { inputOf, type Asset } from "../lib/model";
import {
  changedFields,
  createAssistantCommand,
  freshAssistant,
  identityMatches,
  matchingEmployees,
  persistAssistant,
  restoreAssistant,
  searchAssets,
  selectAssistantAsset,
  type AssistantDraft,
} from "../lib/assistant-flow";

const snapshot = () => fixtures();
function registration(): AssistantDraft {
  const d = freshAssistant();
  return {
    ...d,
    stage: "review",
    checkedSerial: "FICTIONAL-NEW-001",
    asset: {
      ...d.asset,
      name: "Fictional new laptop",
      serial: "FICTIONAL-NEW-001",
      serialChecked: true,
      location: "Locker",
    },
  };
}
function editing(id = "DEMO-002"): AssistantDraft {
  const selected = snapshot().assets.find((asset) => asset.id === id)!;
  const d = selectAssistantAsset(selected);
  return {
    ...d,
    stage: "review",
    asset: { ...d.asset, notes: "Reviewed edit" },
  };
}
function mutateStored(
  d: AssistantDraft,
  change: (value: {
    version: number;
    expiresAt: number;
    draft: AssistantDraft;
  }) => void,
) {
  const value = JSON.parse(persistAssistant(d));
  change(value);
  return JSON.stringify(value);
}

test("command requires explicit review and current serial confirmation", () => {
  assert.throws(
    () =>
      createAssistantCommand(
        { ...registration(), stage: "options" },
        snapshot(),
        randomUUID(),
      ),
    /Review/,
  );
  assert.throws(
    () =>
      createAssistantCommand(
        { ...registration(), checkedSerial: "OLD-SERIAL" },
        snapshot(),
        randomUUID(),
      ),
    /current serial/,
  );
  const d = registration();
  d.asset.serial = "";
  d.asset.serialChecked = false;
  d.checkedSerial = null;
  assert.throws(
    () => createAssistantCommand(d, snapshot(), randomUUID()),
    /unavailable/,
  );
  d.unknownConfirmed = true;
  assert.equal(
    createAssistantCommand(d, snapshot(), randomUUID()).method,
    "POST",
  );
});

test("fresh commands recheck exact serial races and unreviewed possible matches", () => {
  const d = registration(),
    fresh = snapshot();
  fresh.assets.push({
    ...fresh.assets[0],
    id: "racing-device",
    serial: d.asset.serial,
  });
  assert.throws(
    () => createAssistantCommand(d, fresh, randomUUID()),
    /already belongs/,
  );
  const similar = registration();
  similar.asset.serial = "DEMO-DL544O";
  similar.checkedSerial = similar.asset.serial;
  assert.ok(identityMatches(similar, snapshot().assets).possible.length);
  assert.throws(
    () => createAssistantCommand(similar, snapshot(), randomUUID()),
    /possible serial matches/,
  );
  similar.reviewedMatchIds = identityMatches(
    similar,
    snapshot().assets,
  ).possible.map((asset) => asset.id);
  assert.equal(
    createAssistantCommand(similar, snapshot(), randomUUID()).method,
    "POST",
  );
});

test("edits reject a changed serial conflict while preserving inherited legacy duplicates", () => {
  const d = editing();
  d.asset.serial = snapshot().assets[0].serial;
  d.checkedSerial = d.asset.serial;
  assert.throws(
    () => createAssistantCommand(d, snapshot(), randomUUID()),
    /already belongs/,
  );
  const inherited = editing(),
    fresh = snapshot();
  fresh.assets.push({
    ...fresh.assets[0],
    id: "legacy-duplicate",
    serial: inherited.asset.serial,
  });
  assert.equal(
    createAssistantCommand(inherited, fresh, randomUUID()).method,
    "PATCH",
  );
});

test("employee validation rejects removed or ambiguous new owners but allows unrelated existing edits", () => {
  const d = registration();
  d.assignee = "Nora Ellis";
  d.asset.location = "";
  const fresh = snapshot();
  fresh.people = [];
  assert.throws(
    () => createAssistantCommand(d, fresh, randomUUID()),
    /current directory/,
  );
  fresh.people = [
    { name: "Nora Ellis", department: "Design" },
    { name: " nora  ellis ", department: "Operations" },
  ];
  assert.equal(matchingEmployees(fresh.people, "NORA ELLIS").length, 2);
  assert.throws(
    () => createAssistantCommand(d, fresh, randomUUID()),
    /ambiguous/,
  );
  const existing = editing("DEMO-001");
  assert.equal(
    createAssistantCommand(
      existing,
      { ...snapshot(), people: [] },
      randomUUID(),
    ).method,
    "PATCH",
  );
  existing.assignee = "Leo Hart";
  assert.throws(
    () => createAssistantCommand(existing, snapshot(), randomUUID()),
    /movement/,
  );
});

test("movement validates new owners and preserves reviewed source version", () => {
  const d = editing("DEMO-001");
  d.mode = "move";
  d.action = "Transfer";
  d.assignee = "Leo Hart";
  d.asset.location = "";
  d.movementNotes = "Checked handover";
  const command = createAssistantCommand(d, snapshot(), randomUUID());
  assert.equal(command.body.expectedVersion, 1);
  assert.equal(command.body.notes, "Checked handover");
  assert.equal(command.body.assignee, "Leo Hart");
  assert.throws(
    () =>
      createAssistantCommand(d, { ...snapshot(), people: [] }, randomUUID()),
    /current directory/,
  );
  d.action = "Return";
  d.assignee = "";
  d.asset.location = "Locker";
  assert.equal(
    createAssistantCommand(d, { ...snapshot(), people: [] }, randomUUID()).body
      .action,
    "Return",
  );
});

test("changed details use selected revision and reject stale, missing and no-op edits", () => {
  const d = editing(),
    fresh = snapshot();
  fresh.assets.find((asset) => asset.id === d.selected!.id)!.version = 2;
  assert.throws(
    () => createAssistantCommand(d, fresh, randomUUID()),
    /changed while/,
  );
  assert.throws(
    () =>
      createAssistantCommand(d, { ...snapshot(), assets: [] }, randomUUID()),
    /no longer exists/,
  );
  const noChange = selectAssistantAsset(snapshot().assets[1]);
  noChange.stage = "review";
  assert.throws(
    () => createAssistantCommand(noChange, snapshot(), randomUUID()),
    /No details/,
  );
  noChange.asset.name = ` ${noChange.asset.name} `;
  assert.throws(
    () => createAssistantCommand(noChange, snapshot(), randomUUID()),
    /No details/,
  );
  assert.deepEqual(changedFields(inputOf(d.selected!), d.asset), ["notes"]);
  assert.equal(
    createAssistantCommand(d, snapshot(), randomUUID()).body.expectedVersion,
    d.selected!.version,
  );
});

test("pending commands are detached immutable payloads and retry the exact original ID and version", () => {
  const d = editing();
  const requestId = randomUUID();
  const command = createAssistantCommand(d, snapshot(), requestId);
  const original = JSON.stringify(command);
  assert.ok(Object.isFrozen(command));
  assert.ok(Object.isFrozen(command.body));
  assert.ok(Object.isFrozen(command.body.asset));
  assert.throws(() => {
    (command.body.asset as { notes: string }).notes = "Mutated pending payload";
  }, TypeError);
  d.pending = command;
  const restored = restoreAssistant(persistAssistant(d))!;
  const retry = createAssistantCommand(
    restored,
    { assets: [], people: [], history: [] },
    randomUUID(),
  );
  assert.equal(JSON.stringify(retry), original);
  assert.equal(retry.body.requestId, requestId);
  assert.equal(retry.body.expectedVersion, 1);
  d.asset.notes = "Later local mutation";
  assert.equal(JSON.stringify(command), original);
  assert.throws(
    () => createAssistantCommand(d, snapshot(), randomUUID()),
    /does not match/,
  );
});

test("restore validates command destination, method, reviewed payload, assignment and expected version", () => {
  const d = editing();
  d.pending = createAssistantCommand(d, snapshot(), randomUUID());
  for (const change of [
    (v: { draft: AssistantDraft }) => {
      v.draft.pending!.url = "https://untrusted.example/write";
    },
    (v: { draft: AssistantDraft }) => {
      v.draft.pending!.method = "POST";
    },
    (v: { draft: AssistantDraft }) => {
      (v.draft.pending!.body.asset as { notes: string }).notes = "Hidden write";
    },
    (v: { draft: AssistantDraft }) => {
      v.draft.pending!.body.expectedVersion = 9;
    },
    (v: { draft: AssistantDraft }) => {
      v.draft.selected!.id = "another-record";
    },
    (v: { draft: AssistantDraft }) => {
      v.draft.assignee = "New undisplayed owner";
    },
  ])
    assert.throws(
      () => restoreAssistant(mutateStored(d, change)),
      /saved operation|movement/,
    );
  const create = registration();
  create.pending = createAssistantCommand(create, snapshot(), randomUUID());
  assert.throws(
    () =>
      restoreAssistant(
        mutateStored(create, (v) => {
          v.draft.pending!.body.assignee = "Nora Ellis";
        }),
      ),
    /does not match/,
  );
});

test("unfinished draft expiry never discards an unresolved save operation", () => {
  const d = registration();
  const expired = mutateStored(d, (v) => {
    v.expiresAt = 100;
  });
  assert.equal(restoreAssistant(expired, 101), null);
  d.pending = createAssistantCommand(d, snapshot(), randomUUID());
  const saved = mutateStored(d, (v) => {
    v.expiresAt = 100;
    v.draft.stage = "saved";
  });
  const restored = restoreAssistant(saved, 101)!;
  assert.equal(restored.stage, "review");
  assert.ok(restored.pending);
  assert.equal(restored.pending!.body.requestId, d.pending.body.requestId);
});

test("draft restore rejects invalid booleans and selected record contexts", () => {
  const d = editing();
  for (const change of [
    (v: { draft: AssistantDraft }) => {
      (v.draft.asset as unknown as { serialChecked: string }).serialChecked =
        "yes";
    },
    (v: { draft: AssistantDraft }) => {
      (v.draft.selected as unknown as { id: number }).id = 7;
    },
    (v: { draft: AssistantDraft }) => {
      (v.draft.selected as unknown as { status: string }).status = "Invented";
    },
  ])
    assert.throws(() => restoreAssistant(mutateStored(d, change)));
});

test("specification and accessory lines retain order and boundaries through review, restore and submission", () => {
  const d = editing();
  d.asset.specs = "Intel Core i5\n16 GB RAM\n256 GB SSD";
  d.asset.specsChecked = true;
  d.asset.accessories = "USB-C charger\nCarry sleeve\nHDMI cable";
  d.pending = createAssistantCommand(d, snapshot(), randomUUID());
  assert.deepEqual(changedFields(inputOf(d.selected!), d.asset), [
    "specs",
    "accessories",
    "notes",
  ]);
  const restored = restoreAssistant(persistAssistant(d))!;
  const submitted = restored.pending!.body.asset as {
    specs: string;
    accessories: string;
  };
  assert.equal(submitted.specs, d.asset.specs);
  assert.equal(submitted.accessories, d.asset.accessories);
  assert.equal(restored.asset.specs, d.asset.specs);
  assert.equal(restored.asset.accessories, d.asset.accessories);
});

test("selection detaches source photos and search accepts plural categories and all boilerplate", () => {
  const fresh = snapshot(),
    asset: Asset = {
      ...fresh.assets[1],
      photos: ["data:image/png;base64,AAAA"],
      coverPhotoIndex: 0,
    };
  const d = selectAssistantAsset(asset);
  d.asset.photos.push("data:image/png;base64,BBBB");
  assert.equal(asset.photos.length, 1);
  assert.equal(d.selected!.photos.length, 1);
  assert.equal(searchAssets(fresh.assets, "show all laptops").length, 3);
  assert.equal(searchAssets(fresh.assets, "monitors")[0].category, "Monitor");
  assert.equal(
    searchAssets(fresh.assets, "all assets").length,
    fresh.assets.length,
  );
  assert.equal(searchAssets(fresh.assets, "demo-dl5440")[0].id, "DEMO-002");
});
