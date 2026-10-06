import "server-only";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  Asset,
  Snapshot,
  Movement,
  assetInput,
  editAssetInput,
  hasValidStorageLocation,
  createInput,
  editInput,
  movementInput,
  movementState,
  needsReview,
  serialIdentity,
} from "../model";
import { fixtures } from "../fixtures";
export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
    public assetId?: string,
  ) {
    super(message);
  }
}
interface State extends Snapshot {
  requests: Record<string, { hash: string; asset: Asset }>;
}
// Whole snapshot + audit event + idempotency receipt are one atomic rename.
// Lock directory serializes ALL local writers, including separate Node processes.
export class LocalStore {
  constructor(private directory: string) {}
  private get file() {
    return path.join(this.directory, "inventory.json");
  }
  private async load(): Promise<State> {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { ...fixtures(), requests: {} };
      throw new StoreError(
        "Local inventory could not be read. Nothing was changed.",
        503,
      );
    }
  }
  async snapshot(): Promise<Snapshot> {
    const s = await this.load();
    return { assets: s.assets, people: s.people, history: s.history };
  }
  async commit(
    kind: "create" | "edit" | "move",
    input: unknown,
    id?: string,
  ): Promise<Asset> {
    const parsed = (
      kind === "create"
        ? createInput
        : kind === "edit"
          ? editInput
          : movementInput
    ).safeParse(input);
    if (!parsed.success)
      throw new StoreError(
        parsed.error.issues[0]?.message || "Invalid request.",
      );
    const data = parsed.data,
      hash = createHash("sha256")
        .update(JSON.stringify({ kind, id, data }))
        .digest("hex");
    await mkdir(this.directory, { recursive: true });
    const lock = path.join(this.directory, "writer.lock");
    try {
      await mkdir(lock);
    } catch {
      throw new StoreError(
        "Another save is in progress. Wait a moment and retry.",
        409,
      );
    }
    let temp = "";
    try {
      const s = await this.load(),
        receipt = s.requests[data.requestId];
      if (receipt) {
        if (receipt.hash !== hash)
          throw new StoreError(
            "This save reference was used for different changes. Reopen the form.",
            409,
          );
        return receipt.asset;
      }
      const old = s.assets.find((a) => a.id === id);
      if (kind !== "create" && !old)
        throw new StoreError("Asset not found.", 404);
      if (
        kind !== "create" &&
        old!.version !== (data as { expectedVersion: number }).expectedVersion
      )
        throw new StoreError(
          "This asset changed while you were editing. Reload it before saving.",
          409,
          id,
        );
      const now = new Date().toISOString();
      let a: Asset;
      let action: string = kind === "create" ? "Created" : "Edited",
        notes = "";
      if (kind === "move") {
        const m = movementInput.parse(data);
        if (m.assignee && !s.people.some((p) => p.name === m.assignee))
          throw new StoreError("Choose a person from the directory.");
        try {
          a = {
            ...old!,
            ...movementState(old!, m),
            version: old!.version + 1,
            updatedAt: now,
          };
        } catch (e) {
          throw new StoreError((e as Error).message);
        }
        action = m.action;
        notes = m.notes;
      } else if (kind === "edit" && "notes" in data) {
        a = {
          ...old!,
          notes: data.notes,
          version: old!.version + 1,
          updatedAt: now,
        };
        action = "Notes updated";
        notes = data.notes;
      } else {
        const value = (kind === "edit" ? editAssetInput : assetInput).parse(
          (data as { asset: unknown }).asset,
        );
        if (
          !hasValidStorageLocation({
            location: value.location,
            assignee: old?.assignee || "",
          })
        )
          throw new StoreError(
            "Choose Engineering Area or Locker when the asset is unassigned.",
          );
        const serial = serialIdentity(value.serial);
        const duplicate =
          serial &&
          s.assets.find(
            (x) => x.id !== id && serialIdentity(x.serial) === serial,
          );
        if (duplicate)
          throw new StoreError(
            "That serial number belongs to an existing asset. Open it instead.",
            409,
            duplicate.id,
          );
        a = {
          ...value,
          id: old?.id || `DEMO-${randomUUID()}`,
          assignee: old?.assignee || "",
          status:
            old?.status === "Retired"
              ? "Retired"
              : old?.status === "Repair"
                ? "Repair"
                : old?.assignee
                  ? "Assigned"
                  : needsReview(value)
                    ? "Needs review"
                    : "Available",
          version: (old?.version || 0) + 1,
          createdAt: old?.createdAt || now,
          updatedAt: now,
        };
      }
      const stateOf = (v?: Asset) => ({
        assignee: v?.assignee || "",
        location: v?.location || "",
        status: v?.status || "",
      });
      const event: Movement = {
        id: randomUUID(),
        assetId: a.id,
        action,
        actor: "Demo operator",
        at: now,
        from: stateOf(old),
        to: stateOf(a),
        notes,
      };
      s.assets = old
        ? s.assets.map((x) => (x.id === a.id ? a : x))
        : [a, ...s.assets];
      s.history = [event, ...s.history];
      s.requests[data.requestId] = { hash, asset: a };
      temp = path.join(this.directory, `${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(s), { flag: "wx", mode: 0o600 });
      await rename(temp, this.file);
      return a;
    } finally {
      if (temp) await rm(temp, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}
const demoNamespace = process.env.HC_ASSETS_DEMO_SUBDIRECTORY || "";
if (demoNamespace && !/^[a-zA-Z0-9_-]{1,80}$/.test(demoNamespace))
  throw new Error("Invalid demo store namespace.");
export const store = new LocalStore(
  path.join(process.cwd(), ".local", demoNamespace),
);
