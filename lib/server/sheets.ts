import "server-only";
import { Asset, Movement, Person, blankAsset } from "../model";
export const inventoryHeaders = [
  "id",
  "category",
  "assetName",
  "manufacturer",
  "model",
  "serialNumber",
  "cpu",
  "ramGb",
  "diskGb",
  "modelYear",
  "purchasePrice",
  "purchaseCurrency",
  "purchaseDate",
  "condition",
  "assignedTo",
  "status",
  "notes",
  "createdAt",
  "updatedAt",
];
export const historyHeaders = [
  "id",
  "assetId",
  "assetName",
  "serialNumber",
  "fromAssignedTo",
  "toAssignedTo",
  "changedAt",
  "changedBy",
  "source",
];
const aliases: Record<string, string> = {
  ID: "id",
  Category: "category",
  "Asset Name": "assetName",
  Manufacturer: "manufacturer",
  Model: "model",
  "Serial Number": "serialNumber",
  CPU: "cpu",
  "RAM (GB)": "ramGb",
  "Storage (GB)": "diskGb",
  "Model Year": "modelYear",
  "Purchase Price": "purchasePrice",
  Currency: "purchaseCurrency",
  "Purchase Date": "purchaseDate",
  Condition: "condition",
  "Assigned To": "assignedTo",
  Status: "status",
  Notes: "notes",
  "Created At": "createdAt",
  "Updated At": "updatedAt",
};
export function records(values: unknown[][]): Record<string, string>[] {
  if (!values.length) throw new Error("Sheet has no header row.");
  const headers = values[0].map((v) => aliases[String(v)] || String(v));
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate Sheet headers require review.");
  return values
    .slice(1)
    .filter((row) => row.some((v) => v !== "" && v !== null && v !== undefined))
    .map((row) =>
      Object.fromEntries(
        headers.map((h, i) => [aliases[h] || h, String(row[i] ?? "")]),
      ),
    );
}
export function decodeInventory(values: unknown[][]): Asset[] {
  const rows = records(values);
  const ids = new Set<string>();
  return rows.map((r) => {
    if (!r.id) throw new Error("Asset row has no ID. Import stopped.");
    if (ids.has(r.id)) throw new Error("Duplicate asset ID. Import stopped.");
    ids.add(r.id);
    const knownCondition: Record<string, Asset["condition"]> = {
      new: "New",
      good: "Good",
      fair: "Fair",
      damaged: "Damaged",
    };
    const knownCategory: Record<string, Asset["category"]> = {
      laptop: "Laptop",
      phone: "Phone",
      monitor: "Monitor",
      peripheral: "Peripheral",
      tablet: "Tablet",
    };
    const knownStatus: Record<string, Asset["status"]> = {
      in_use: "Assigned",
      spare: "Available",
      retired: "Retired",
      repair: "Repair",
    };
    return {
      ...blankAsset(),
      id: r.id,
      name: r.assetName || r.model || "Unnamed asset",
      brand: r.manufacturer || "",
      model: r.model || "",
      serial: r.serialNumber || "",
      category: knownCategory[r.category?.toLowerCase()] || "Other",
      specs: [
        r.cpu,
        r.ramGb ? `${r.ramGb} GB RAM` : "",
        r.diskGb ? `${r.diskGb} GB storage` : "",
      ]
        .filter(Boolean)
        .join(" / "),
      condition: knownCondition[r.condition?.toLowerCase()] || "Unknown",
      location: r.location || "",
      assignee: r.assignedTo || "",
      status: knownStatus[r.status?.toLowerCase()] || "Needs review",
      purchaseCost: r.purchasePrice || "",
      purchaseCurrency: r.purchaseCurrency || "",
      purchaseDate: r.purchaseDate || "",
      notes: r.notes || "",
      createdAt: r.createdAt || "",
      updatedAt: r.updatedAt || "",
      version: 1,
      raw: r,
    };
  });
}
export function decodeHistory(values: unknown[][]): Movement[] {
  return records(values).map((r) => ({
    id: r.id,
    assetId: r.assetId,
    action: r.source || "Legacy assignment",
    actor: r.changedBy || "Unknown actor",
    at: r.changedAt || "",
    from: {
      assignee: r.fromAssignedTo || "",
      location: "Unknown",
      status: "Unknown",
    },
    to: {
      assignee: r.toAssignedTo || "",
      location: "Unknown",
      status: "Unknown",
    },
    notes: "Imported legacy event. Location and status were not recorded.",
  }));
}
export function decodeEmployees(values: unknown[][]): Person[] {
  return values
    .slice(1)
    .filter((r) => String(r[0] ?? "").trim())
    .map((r) => ({
      name: String(r[0]).trim(),
      department: String(r[1] ?? ""),
    }));
}
// Explicit dependency injection: this adapter is NEVER selected by the preview.
// No credentials, OAuth, header mutations, writes or tab creation are implemented.
export class ReadOnlySheetAdapter {
  constructor(
    private spreadsheetId: string,
    private accessToken: () => Promise<string>,
    private fetcher: typeof fetch = fetch,
  ) {}
  async read(
    tab: "Inventory" | "assignment_history" | "Employees",
  ): Promise<unknown[][]> {
    const token = await this.accessToken();
    const response = await this.fetcher(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`'${tab}'!A:ZZ`)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(`Sheet read failed (${response.status}).`);
    const data = await response.json();
    if (
      !Array.isArray(data.values) ||
      !data.values.every((r: unknown) => Array.isArray(r))
    )
      throw new Error("Unexpected Sheet response.");
    return data.values;
  }
}
