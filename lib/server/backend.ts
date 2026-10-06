import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type PreviewSource, type Snapshot, type Asset } from "../model";
import { store, StoreError } from "./store";
import {
  decodeInventory,
  decodeHistory,
  decodeEmployees,
  ReadOnlySheetAdapter,
} from "./sheets";
import { GoogleServiceAccountToken } from "./google-auth";
import { ControlledSheetGateway } from "./sheet-gateway";
import { ControlledSheetReader } from "./sheet-snapshot";
import { DirectSheetWriter } from "./direct-sheet-writer";
import { OpenAiAssetIntelligence } from "./openai-intelligence";
import { budgetedFetch } from "./ai-budget";
import { hosted, acquireHostedWriter } from "./hosted-coordination";
export const existingSheetId = "1ZeV0krMc_ZeH2e-iOd9ft5jMvGwNcCtu4SPYYXI0x_A";
const importedSchema = z
  .object({
    spreadsheetId: z.literal(existingSheetId),
    readAt: z.string().datetime(),
    tables: z
      .array(z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))))
      .length(3),
  })
  .strict();
export async function importedSnapshot(
  directory = path.join(process.cwd(), ".local"),
): Promise<Snapshot | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(directory, "readonly-sheet.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StoreError("The real Sheet snapshot could not be read.", 503);
  }
  try {
    const value = importedSchema.parse(JSON.parse(raw));
    return {
      assets: decodeInventory(value.tables[0]),
      history: decodeHistory(value.tables[1]),
      people: decodeEmployees(value.tables[2]),
      source: {
        kind: "sheet-snapshot",
        label: "Real Sheet snapshot",
        readOnly: true,
        checkedAt: value.readAt,
        aiEnabled: false,
      },
    };
  } catch {
    throw new StoreError(
      "The real Sheet snapshot is invalid. Fictional data was not substituted.",
      503,
    );
  }
}
function selected() {
  const value = process.env.HC_ASSETS_BACKEND || "auto";
  if (!["auto", "demo", "live-readonly", "live", "staging"].includes(value))
    throw new StoreError("Unsupported inventory configuration.", 503);
  if (
    value === "staging" &&
    (!process.env.HC_ASSETS_SPREADSHEET_ID ||
      process.env.HC_ASSETS_SPREADSHEET_ID === existingSheetId)
  )
    throw new StoreError(
      "Configure an isolated staging Sheet. Production test writes are prohibited.",
      503,
    );
  return value;
}
function aiCapabilities() {
  const key = !!process.env.OPENAI_API_KEY;
  const ocrEnabled =
    key &&
    (process.env.HC_ASSETS_OCR_ENABLED || process.env.HC_ASSETS_AI_ENABLED) ===
      "approved" &&
    !!process.env.HC_ASSETS_OPENAI_MODEL;
  const resaleEnabled =
    key &&
    (process.env.HC_ASSETS_RESALE_ENABLED ||
      process.env.HC_ASSETS_AI_ENABLED) === "approved" &&
    !!process.env.HC_ASSETS_SEARCH_MODEL;
  return { ocrEnabled, resaleEnabled, aiEnabled: ocrEnabled || resaleEnabled };
}
export async function previewSource(
  directory?: string,
): Promise<PreviewSource> {
  const backend = selected();
  if (
    backend === "staging" ||
    backend === "live-readonly" ||
    backend === "live"
  )
    return {
      kind: backend,
      accessMode: hosted() ? "public" : "local",
      label:
        backend === "staging"
          ? "Staging Sheet"
          : backend === "live"
            ? "Live Sheet"
            : "Live Sheet · read only",
      readOnly:
        backend === "live-readonly" ||
        process.env.HC_ASSETS_WRITES_ENABLED !== "approved",
      checkedAt: null,
      ...aiCapabilities(),
    };
  if (backend === "auto") {
    const imported = await importedSnapshot(directory);
    if (imported?.source) return { ...imported.source, ...aiCapabilities() };
  }
  return {
    kind: "demo",
    label: "Local demo",
    readOnly: false,
    checkedAt: null,
    ...aiCapabilities(),
  };
}
let token: GoogleServiceAccountToken | undefined;
let writeToken: GoogleServiceAccountToken | undefined;
function googleToken() {
  token ??= new GoogleServiceAccountToken({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "",
  });
  return token.accessToken();
}
function googleWriteToken() {
  writeToken ??= new GoogleServiceAccountToken({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "",
    scope: "readwrite",
  });
  return writeToken.accessToken();
}
export async function backendSnapshot(): Promise<Snapshot> {
  const source = await previewSource();
  if (source.kind === "sheet-snapshot")
    return { ...(await importedSnapshot())!, source };
  if (source.kind === "demo") return { ...(await store.snapshot()), source };
  const id =
    source.kind === "live-readonly" || source.kind === "live"
      ? existingSheetId
      : process.env.HC_ASSETS_SPREADSHEET_ID!;
  if (source.kind === "staging" || source.kind === "live")
    return {
      ...(await new ControlledSheetReader(id, googleToken).snapshot()),
      source: { ...source, checkedAt: new Date().toISOString() },
    };
  const reader = new ReadOnlySheetAdapter(id, googleToken);
  const [inventory, history, people] = await Promise.all([
    reader.read("Inventory"),
    reader.read("assignment_history"),
    reader.read("Employees"),
  ]);
  return {
    assets: decodeInventory(inventory),
    history: decodeHistory(history),
    people: decodeEmployees(people),
    source: { ...source, checkedAt: new Date().toISOString() },
  };
}
export async function assertWritable() {
  const source = await previewSource();
  if (source.readOnly)
    throw new StoreError(
      "Real inventory is read only. Saves and movements are disabled until the controlled writer is approved and configured.",
      403,
    );
  return source;
}
export async function backendCommit(
  action: "create" | "edit" | "move",
  data: unknown,
  id?: string,
): Promise<Asset> {
  const source = await assertWritable();
  if (source.kind === "demo") return store.commit(action, data, id);
  const writer = process.env.HC_ASSETS_WRITER || "direct";
  if (writer === "direct")
    return new DirectSheetWriter(
      source.kind === "live"
        ? existingSheetId
        : process.env.HC_ASSETS_SPREADSHEET_ID!,
      googleWriteToken,
      fetch,
      undefined,
      hosted() ? acquireHostedWriter : undefined,
    ).commit(
      action,
      data,
      hosted()
        ? "Public visitor (sign-in deferred)"
        : "Local operator (authentication deferred)",
      id,
    );
  if (writer !== "gateway")
    throw new StoreError("Unsupported Sheet writer configuration.", 503);
  const gateway = new ControlledSheetGateway({
    url: process.env.HC_ASSETS_GATEWAY_URL || "",
    signingSecret: process.env.HC_ASSETS_GATEWAY_SECRET || "",
    spreadsheetId:
      source.kind === "live"
        ? existingSheetId
        : process.env.HC_ASSETS_SPREADSHEET_ID || "",
  });
  return gateway.commit(
    action,
    data,
    "Local operator (authentication deferred)",
    id,
  );
}
export async function intelligence(task: "ocr" | "resale" = "ocr") {
  const source = await previewSource();
  if (!(task === "ocr" ? source.ocrEnabled : source.resaleEnabled))
    throw new StoreError(
      task === "resale"
        ? "Resale research is disabled. Its server research configuration must be enabled before checking market sources."
        : "Photo OCR is not connected. Enter readable label details manually.",
      503,
    );
  return new OpenAiAssetIntelligence(
    {
      apiKey: process.env.OPENAI_API_KEY || "",
      visionModel: process.env.HC_ASSETS_OPENAI_MODEL || "",
      searchModel: process.env.HC_ASSETS_SEARCH_MODEL || "",
    },
    async (url, init) =>
      String(url) === "https://api.openai.com/v1/responses"
        ? budgetedFetch(url, init)
        : fetch(url, init),
  );
}
