import { z } from "zod";
import {
  Asset,
  AssetInput,
  Snapshot,
  blankAsset,
  createInput,
  editInput,
  editAssetInput,
  statuses,
  inputOf,
  movementInput,
  movementState,
  findBySerial,
  possibleSerialMatches,
  serialIdentity,
  type Person,
} from "./model";

export const assistantStages = [
  "welcome",
  "capture",
  "serial",
  "confirm-serial",
  "matches",
  "unknown",
  "name",
  "category",
  "ownership",
  "employee",
  "photo",
  "options",
  "field",
  "condition",
  "review",
  "search",
  "asset",
  "movement",
  "destination",
  "movement-note",
  "resale",
  "saved",
] as const;
export type Stage = (typeof assistantStages)[number];
export type EditField =
  | "name"
  | "serial"
  | "brand"
  | "model"
  | "specs"
  | "accessories"
  | "notes"
  | "purchaseCost";
export type Command = {
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
};
export interface AssistantDraft {
  stage: Stage;
  mode: "create" | "edit" | "move";
  asset: AssetInput;
  selected: Asset | null;
  assignee: string;
  action: "Assign" | "Transfer" | "Return" | "Repair" | "Retire";
  movementNotes: string;
  field: EditField;
  query: string;
  checkedSerial: string | null;
  unknownConfirmed: boolean;
  reviewedMatchIds: string[];
  transcript: { question: string; answer: string }[];
  pending: Command | null;
  draftId: string;
}
export function freshAssistant(): AssistantDraft {
  return {
    stage: "welcome",
    mode: "create",
    asset: { ...blankAsset(), location: "" },
    selected: null,
    assignee: "",
    action: "Assign",
    movementNotes: "",
    field: "name",
    query: "",
    checkedSerial: null,
    unknownConfirmed: false,
    reviewedMatchIds: [],
    transcript: [],
    pending: null,
    draftId: "",
  };
}
export function selectAssistantAsset(
  asset: Asset,
  previous = freshAssistant(),
): AssistantDraft {
  const selected = structuredClone(asset);
  return {
    ...previous,
    mode: "edit",
    stage: "asset",
    selected,
    asset: structuredClone(inputOf(selected)),
    assignee: asset.assignee,
    checkedSerial: asset.serial,
    unknownConfirmed: !asset.serial,
    reviewedMatchIds: [],
    pending: null,
    movementNotes: "",
    action: asset.assignee ? "Transfer" : "Assign",
  };
}
export function searchAssets(assets: Asset[], query: string) {
  const exact = findBySerial(assets, query);
  if (exact.length) return exact;
  const terms = query
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .split(/\s+/)
    .map(
      (term) =>
        ({
          laptops: "laptop",
          monitors: "monitor",
          tablets: "tablet",
          peripherals: "peripheral",
          devices: "device",
          assets: "asset",
        })[term] || term,
    )
    .filter(
      (t) =>
        t &&
        ![
          "find",
          "search",
          "show",
          "me",
          "the",
          "a",
          "an",
          "asset",
          "device",
          "for",
          "please",
          "my",
          "all",
          "inventory",
        ].includes(t),
    );
  if (!terms.length) return assets;
  return assets.filter((a) => {
    const haystack = [
      a.name,
      a.model,
      a.brand,
      a.serial,
      a.id,
      a.assignee,
      a.location,
      a.category,
      a.status,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
export function identityMatches(draft: AssistantDraft, assets: Asset[]) {
  const others = assets.filter(
    (a) => draft.mode === "create" || a.id !== draft.selected?.id,
  );
  const exact = findBySerial(others, draft.asset.serial);
  return {
    exact,
    possible: exact.length
      ? []
      : possibleSerialMatches(others, draft.asset.serial),
  };
}
export function changedFields(before: AssetInput, after: AssetInput) {
  const canonical = (value: AssetInput[keyof AssetInput]) =>
    JSON.stringify(typeof value === "string" ? value.trim() : value);
  return (Object.keys(blankAsset()) as (keyof AssetInput)[]).filter(
    (k) => canonical(before[k]) !== canonical(after[k]),
  );
}
const employeeIdentity = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function matchingEmployees(people: Person[], name: string) {
  const identity = employeeIdentity(name);
  return identity
    ? people.filter((person) => employeeIdentity(person.name) === identity)
    : [];
}
function immutableCommand(command: Command): Command {
  function freeze(value: unknown) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(command);
  return command;
}
/** Only assembles the reviewed payload; changing inventory checks run before first transmission. */
function commandFromDraft(d: AssistantDraft, requestId: string): Command {
  if (d.mode === "create" && d.selected)
    throw new Error(
      "Start a new registration before creating a separate asset.",
    );
  if (d.mode === "create")
    return immutableCommand({
      url: "/api/inventory",
      method: "POST",
      body: createInput.parse({
        asset: d.asset,
        assignee: d.assignee,
        reviewedMatchIds: d.reviewedMatchIds,
        requestId,
      }),
    });
  const selected = d.selected;
  if (!selected) throw new Error("Select an existing asset first.");
  if (d.mode === "edit") {
    if (d.assignee !== selected.assignee)
      throw new Error(
        "Use a reviewed movement to change the employee assignment.",
      );
    return immutableCommand({
      url: `/api/assets/${encodeURIComponent(selected.id)}`,
      method: "PATCH",
      body: editInput.parse({
        asset: d.asset,
        expectedVersion: selected.version,
        requestId,
      }),
    });
  }
  const body = movementInput.parse({
    action: d.action,
    assignee: d.assignee,
    location: d.asset.location,
    notes: d.movementNotes,
    expectedVersion: selected.version,
    requestId,
  });
  movementState(selected, body);
  return immutableCommand({
    url: `/api/assets/${encodeURIComponent(selected.id)}`,
    method: "PATCH",
    body,
  });
}
function checkedPending(d: AssistantDraft): Command {
  const pending = d.pending;
  if (!pending) throw new Error("No saved operation to check.");
  const parsed = (
    d.mode === "create"
      ? createInput
      : d.mode === "move"
        ? movementInput
        : editInput
  ).parse(pending.body);
  const expected = commandFromDraft(d, parsed.requestId);
  // A restored operation must describe precisely the change shown in the review.
  if (
    pending.url !== expected.url ||
    pending.method !== expected.method ||
    JSON.stringify(parsed) !== JSON.stringify(expected.body)
  )
    throw new Error(
      "The saved operation does not match this draft. Resolve its original save reference before continuing.",
    );
  return expected;
}
export function createAssistantCommand(
  d: AssistantDraft,
  snapshot: Snapshot,
  requestId: string,
): Command {
  if (d.stage !== "review")
    throw new Error("Review the proposed change before confirming.");
  // A retry must use its original version and payload even if inventory has changed.
  if (d.pending) return checkedPending(d);
  if (d.mode !== "move") {
    if (
      d.asset.serial &&
      d.checkedSerial !== d.asset.serial
    )
      throw new Error("Check the current serial before saving.");
    if (!d.asset.serial && !d.unknownConfirmed)
      throw new Error("Confirm that the serial is unavailable.");
    const matches = identityMatches(d, snapshot.assets);
    const serialChanged =
      d.mode === "create" ||
      serialIdentity(d.asset.serial) !==
        serialIdentity(d.selected?.serial || "");
    if (matches.exact.length && serialChanged)
      throw new Error("This serial already belongs to an existing asset.");
    if (
      d.mode === "create" &&
      matches.possible.some((a) => !d.reviewedMatchIds.includes(a.id))
    )
      throw new Error("Compare the possible serial matches before saving.");
    if (d.mode === "edit" && matches.possible.length && serialChanged)
      throw new Error(
        "Review the possible serial conflict on the existing asset before changing its serial.",
      );
  }
  if (
    d.assignee &&
    (d.mode === "create" ||
      (d.mode === "move" && ["Assign", "Transfer"].includes(d.action)))
  ) {
    const matches = matchingEmployees(snapshot.people, d.assignee);
    if (matches.length > 1)
      throw new Error(
        "This employee name is ambiguous. Correct the directory before assigning equipment.",
      );
    if (matches.length !== 1 || matches[0].name !== d.assignee)
      throw new Error("Choose an employee from the current directory.");
  }
  if (d.selected && d.mode !== "create") {
    const current = snapshot.assets.find(
      (asset) => asset.id === d.selected!.id,
    );
    if (!current)
      throw new Error(
        "Asset no longer exists. Reload inventory before saving.",
      );
    if (current.version !== d.selected.version)
      throw new Error(
        "This asset changed while you were editing. Reload it and review before saving.",
      );
    if (
      d.mode === "edit" &&
      !changedFields(inputOf(d.selected), d.asset).length
    )
      throw new Error("No details have changed. Update a field before saving.");
  }
  return commandFromDraft(d, requestId);
}

export const assistantStorageKey = "hello-assets.ask-it.v1";
export const assistantHandoffKey = "hello-assets.ask-it.handoff.v1";
export const scanStorageKey = "hcassets.demo.registration.v2";
const stored = z
  .object({
    version: z.literal(1),
    expiresAt: z.number(),
    draft: z
      .object({
        stage: z.enum(assistantStages),
        mode: z.enum(["create", "edit", "move"]),
        asset: z.record(z.string(), z.unknown()),
        selected: z.record(z.string(), z.unknown()).nullable(),
        assignee: z.string().max(400),
        action: z.enum(["Assign", "Transfer", "Return", "Repair", "Retire"]),
        movementNotes: z.string().max(2000),
        field: z.enum([
          "name",
          "serial",
          "brand",
          "model",
          "specs",
          "accessories",
          "notes",
          "purchaseCost",
        ]),
        query: z.string().max(2000),
        checkedSerial: z.string().max(400).nullable(),
        unknownConfirmed: z.boolean(),
        reviewedMatchIds: z.array(z.string().min(1).max(400)).max(100),
        transcript: z
          .array(
            z.object({
              question: z.string().max(2000),
              answer: z.string().max(2000),
            }),
          )
          .max(12),
        pending: z
          .object({
            url: z.string(),
            method: z.enum(["POST", "PATCH"]),
            body: z.record(z.string(), z.unknown()),
          })
          .nullable(),
        draftId: z.string().max(100),
      })
      .strict(),
  })
  .strict();
export function restoreAssistant(
  raw: string,
  now = Date.now(),
): AssistantDraft | null {
  const value = stored.parse(JSON.parse(raw));
  // Unresolved saves retain their immutable operation until a confirmed result.
  if (value.expiresAt <= now && !value.draft.pending) return null;
  const d = value.draft as AssistantDraft;
  z.object({ ...editAssetInput.shape, name: z.string().max(400) })
    .strict()
    .parse(d.asset);
  // Strictly validate the asset shape while permitting unfinished name/review checks.
  const candidate = {
    ...d.asset,
    name: d.asset.name || "Draft",
    serialChecked: true,
    specsChecked: true,
    conditionChecked: true,
  };
  editInput.parse({
    asset: candidate,
    expectedVersion: 1,
    requestId: "00000000-0000-4000-8000-000000000001",
  });
  if (d.selected) {
    z.object({
      id: z.string().min(1).max(400),
      version: z.number().int().positive(),
      assignee: z.string().max(400),
      location: z.string().max(400),
      status: z.enum(statuses),
      createdAt: z.string().max(400),
      updatedAt: z.string().max(400),
    })
      .passthrough()
      .parse(d.selected);
    editInput.parse({
      asset: {
        ...inputOf(d.selected),
        location: "Locker",
        serialChecked: true,
        specsChecked: true,
        conditionChecked: true,
      },
      expectedVersion: d.selected.version,
      requestId: "00000000-0000-4000-8000-000000000001",
    });
  }
  if (d.pending) {
    d.pending = checkedPending(d);
    d.stage = "review";
  } else if (d.stage === "saved") d.stage = d.selected ? "asset" : "welcome";
  return d;
}
export function persistAssistant(draft: AssistantDraft) {
  return JSON.stringify({
    version: 1,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    draft,
  });
}
