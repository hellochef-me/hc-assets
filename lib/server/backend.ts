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
import { OpenAiAssetIntelligence } from "./openai-intelligence";
import { budgetedFetch } from "./ai-budget";
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
  if (!["auto", "demo", "live-readonly", "staging"].includes(value))
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
export async function previewSource(
  directory?: string,
): Promise<PreviewSource> {
  const backend = selected();
  if (backend === "staging" || backend === "live-readonly")
    return {
      kind: backend,
      label: backend === "staging" ? "Staging Sheet" : "Live Sheet · read only",
      readOnly: backend === "live-readonly",
      checkedAt: null,
      aiEnabled:
        backend === "staging" &&
        process.env.HC_ASSETS_AI_ENABLED === "approved" &&
        !!process.env.OPENAI_API_KEY &&
        !!process.env.HC_ASSETS_OPENAI_MODEL &&
        !!process.env.HC_ASSETS_SEARCH_MODEL,
    };
  if (backend === "auto") {
    const imported = await importedSnapshot(directory);
    if (imported?.source) return imported.source;
  }
  return {
    kind: "demo",
    label: "Local demo",
    readOnly: false,
    checkedAt: null,
    aiEnabled: false,
  };
}
let token: GoogleServiceAccountToken | undefined;
function googleToken() {
  token ??= new GoogleServiceAccountToken({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "",
  });
  return token.accessToken();
}
export async function backendSnapshot(): Promise<Snapshot> {
  const source = await previewSource();
  if (source.kind === "sheet-snapshot") return (await importedSnapshot())!;
  if (source.kind === "demo") return { ...(await store.snapshot()), source };
  const id =
    source.kind === "live-readonly"
      ? existingSheetId
      : process.env.HC_ASSETS_SPREADSHEET_ID!;
  if (source.kind === "staging")
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
  const gateway = new ControlledSheetGateway({
    url: process.env.HC_ASSETS_GATEWAY_URL || "",
    signingSecret: process.env.HC_ASSETS_GATEWAY_SECRET || "",
    spreadsheetId: process.env.HC_ASSETS_SPREADSHEET_ID || "",
  });
  return gateway.commit(
    action,
    data,
    "Local operator (authentication deferred)",
    id,
  );
}
export async function intelligence() {
  const source = await previewSource();
  if (!source.aiEnabled)
    throw new StoreError(
      "Live AI is not connected. Secure server configuration and spending approval are required. Enter label details manually.",
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
