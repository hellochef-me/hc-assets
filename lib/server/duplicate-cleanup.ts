import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { decodeControlledSnapshot } from "./sheet-snapshot";
import type { Asset, Movement } from "../model";
import { similarSerial, serialIdentity } from "../serial.mjs";

// Operator-only: no route exposes consolidation. Caller holds the same hosted
// mutex as production and saves the original six tables before applying this plan.
export function planDuplicateConsolidation(input: {
  tables: string[][][];
  sheetIds: Record<string, number>;
  sourceId: string;
  targetId: string;
  sourceSerial: string;
  targetSerial: string;
  sourceVersion: number;
  targetVersion: number;
  labelVerified: boolean;
  requestId: string;
  now?: string;
}) {
  const { tables, sheetIds, sourceId, targetId } = input;
  if (sourceId === targetId) throw new Error("Choose two separate records.");
  if (
    JSON.stringify(tables[5]?.[0]) !==
    JSON.stringify(["requestId", "digest", "part", "json"])
  )
    throw new Error("Receipt schema needs review.");
  const commands = new Map<string, string[][]>();
  for (const row of tables[5].slice(1)) {
    if (!row[0]) continue;
    const rows = commands.get(row[0]) || [];
    rows.push(row);
    commands.set(row[0], rows);
  }
  for (const [id, rows] of commands) {
    rows.sort((a, b) => Number(a[2]) - Number(b[2]));
    if (rows.some((r, i) => Number(r[2]) !== i || r[1] !== rows[0][1]))
      throw new Error("Invalid prior receipt.");
    const receipt = JSON.parse(rows.map((r) => r[3]).join(""));
    if (receipt.state !== "committed")
      throw new Error("A pending write must be reconciled first.");
    if (id === input.requestId)
      throw new Error("This cleanup is already committed.");
  }
  const snapshot = decodeControlledSnapshot(tables.slice(0, 5));
  const source = snapshot.assets.find((a) => a.id === sourceId),
    target = snapshot.assets.find((a) => a.id === targetId);
  if (
    !source ||
    !target ||
    source.version !== input.sourceVersion ||
    target.version !== input.targetVersion ||
    source.serial !== input.sourceSerial ||
    target.serial !== input.targetSerial
  )
    throw new Error("Records changed; review again.");
  if (
    !source.serial ||
    !target.serial ||
    !similarSerial(source.serial, target.serial)
  )
    throw new Error("Serials do not identify a supported duplicate candidate.");
  if (
    serialIdentity(source.serial) !== serialIdentity(target.serial) &&
    !input.labelVerified
  )
    throw new Error("A differing serial needs physical label verification.");
  if (source.assignee && source.assignee !== target.assignee)
    throw new Error("Conflicting owners need human review.");
  if (source.mergedFromIds?.length)
    throw new Error("Consolidate nested aliases separately.");
  const now = input.now || new Date().toISOString(),
    actor = "Anthony-approved duplicate cleanup";
  const photos = [...target.photos];
  let coverPhotoIndex = target.coverPhotoIndex ?? null;
  source.photos.forEach((photo, i) => {
    // Label evidence is for reading only; carry across explicitly selected device photos.
    if (i !== source.coverPhotoIndex) return;
    let index = photos.indexOf(photo);
    if (index < 0) {
      index = photos.length;
      photos.push(photo);
    }
    if (coverPhotoIndex === null && i === source.coverPhotoIndex)
      coverPhotoIndex = index;
  });
  if (photos.length > 3)
    throw new Error(
      "Photo evidence exceeds the supported limit; review before consolidation.",
    );
  const note = `Duplicate ${source.id} consolidated; originally recorded serial ${source.serial}. ${input.labelVerified ? "Saved device label confirms " + target.serial + "." : "Matching serial, device and owner reviewed."}`;
  const notes = [
    target.notes,
    source.notes && source.notes !== target.notes ? source.notes : "",
    note,
  ]
    .filter(Boolean)
    .join("\n");
  if (notes.length > 2000) throw new Error("Combined notes require review.");
  const kept: Asset = {
    ...target,
    photos,
    coverPhotoIndex,
    notes,
    serialChecked: input.labelVerified || target.serialChecked,
    mergedFromIds: [...(target.mergedFromIds || []), source.id],
    version: target.version + 1,
    updatedAt: now,
  };
  const archived: Asset = {
    ...source,
    serial: "",
    serialChecked: false,
    assignee: "",
    location: "",
    status: "Retired",
    mergedIntoId: target.id,
    notes:
      `Consolidated into ${target.id}. Original serial: ${source.serial}.\n${source.notes}`.slice(
        0,
        2000,
      ),
    version: source.version + 1,
    updatedAt: now,
  };
  const next = structuredClone(tables);
  const cells = (values: string[]) =>
    values.map((stringValue) => ({ userEnteredValue: { stringValue } }));
  const requests: unknown[] = [];
  const update = (name: string, index: number, values: string[]) =>
    requests.push({
      updateCells: {
        start: { sheetId: sheetIds[name], rowIndex: index, columnIndex: 0 },
        rows: [{ values: cells(values) }],
        fields: "userEnteredValue",
      },
    });
  const append = (name: string, rows: string[][]) =>
    requests.push({
      appendCells: {
        sheetId: sheetIds[name],
        rows: rows.map((values) => ({ values: cells(values) })),
        fields: "userEnteredValue",
      },
    });
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const chunks = (id: string, revision: string, value: unknown) => {
    const s = JSON.stringify(value);
    const rows: string[][] = [];
    for (let start = 0; start < s.length; start += 44000)
      rows.push([
        id,
        revision,
        String(rows.length),
        s.slice(start, start + 44000),
      ]);
    return rows;
  };
  for (const asset of [kept, archived]) {
    const rowIndex = next[0].findIndex((r) => r[0] === asset.id);
    const row = [...next[0][rowIndex]];
    const values: Record<string, string> = {
      serialNumber: asset.serial,
      assignedTo: asset.assignee,
      status: asset.status === "Retired" ? "retired" : row[15],
      notes: asset.notes,
      updatedAt: now,
    };
    for (const [key, value] of Object.entries(values))
      row[next[0][0].indexOf(key)] = value;
    next[0][rowIndex] = row;
    update("Inventory", rowIndex, row);
    for (let i = 1; i < next[3].length; i++)
      if (next[3][i][0] === asset.id) {
        next[3][i] = ["", "", "", ""];
        update("HCAssets_records", i, next[3][i]);
      }
    const metadata = chunks(asset.id, String(asset.version), {
      asset,
      fingerprint: hash(row),
    });
    next[3].push(...metadata);
    append("HCAssets_records", metadata);
  }
  const state = (a: Asset) => ({
    assignee: a.assignee,
    location: a.location,
    status: a.status,
  });
  const event: Movement = {
    id: randomUUID(),
    assetId: target.id,
    action: "Duplicate consolidated",
    actor,
    at: now,
    from: state(target),
    to: state(kept),
    notes: note,
  };
  const full = [event.id, JSON.stringify(event)],
    legacy = [
      event.id,
      target.id,
      target.name,
      target.serial,
      target.assignee,
      kept.assignee,
      now,
      actor,
      event.action,
    ];
  next[4].push(full);
  append("HCAssets_movements", [full]);
  next[1].push(legacy);
  append("assignment_history", [legacy]);
  const digest = hash({
    sourceId,
    targetId,
    sourceVersion: source.version,
    targetVersion: target.version,
  });
  const intent = [
    input.requestId,
    digest,
    "0",
    JSON.stringify({
      state: "pending",
      startedAt: now,
      operation: "duplicate-consolidation",
    }),
  ];
  // Receipt row was appended separately under the mutex before this atomic batch.
  update("HCAssets_commands", tables[5].length, ["", "", "", ""]);
  const receipt = chunks(input.requestId, digest, {
    state: "committed",
    asset: kept,
    archivedId: source.id,
  });
  next[5].push(["", "", "", ""], ...receipt);
  append("HCAssets_commands", receipt);
  decodeControlledSnapshot(next.slice(0, 5));
  return { requests, intent, next, kept, archived };
}
