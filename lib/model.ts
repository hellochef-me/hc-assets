import { z } from "zod";
export const categories = [
  "Laptop",
  "Phone",
  "Tablet",
  "Monitor",
  "Peripheral",
  "Other",
] as const;
export const statuses = [
  "Available",
  "Assigned",
  "Needs review",
  "Repair",
  "Retired",
] as const;
export const conditions = [
  "Unknown",
  "New",
  "Good",
  "Fair",
  "Damaged",
] as const;
export const movements = [
  "Assign",
  "Transfer",
  "Return",
  "Repair",
  "Retire",
] as const;
const text = z.string().trim().max(400);
const photo = z
  .string()
  .max(900000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
export const assetInput = z
  .object({
    name: text.min(1, "Enter an asset name."),
    category: z.enum(categories),
    brand: text,
    model: text,
    serial: text,
    specs: text,
    condition: z.enum(conditions),
    accessories: text,
    location: text.min(1, "Choose a location."),
    notes: z.string().trim().max(2000),
    purchaseCost: z.string().regex(/^$|^\d{1,9}(\.\d{1,2})?$/),
    purchaseCurrency: z.string().trim().max(10),
    purchaseDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    photos: z.array(photo).max(3),
    serialChecked: z.boolean(),
    specsChecked: z.boolean(),
    conditionChecked: z.boolean(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.serial && !a.serialChecked)
      ctx.addIssue({
        code: "custom",
        path: ["serialChecked"],
        message: "Check the serial number before saving.",
      });
    if (a.specs && !a.specsChecked)
      ctx.addIssue({
        code: "custom",
        path: ["specsChecked"],
        message: "Verify specifications on the device, or leave them Unknown.",
      });
    if (a.condition !== "Unknown" && !a.conditionChecked)
      ctx.addIssue({
        code: "custom",
        path: ["conditionChecked"],
        message: "Inspect the device before setting a condition.",
      });
  });
export type AssetInput = z.infer<typeof assetInput>;
export interface Asset extends AssetInput {
  id: string;
  status: (typeof statuses)[number];
  assignee: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  raw?: Record<string, string>;
}
export interface Person {
  name: string;
  department: string;
}
export interface Movement {
  id: string;
  assetId: string;
  action: string;
  actor: string;
  at: string;
  from: { assignee: string; location: string; status: string };
  to: { assignee: string; location: string; status: string };
  notes: string;
}
export interface Snapshot {
  assets: Asset[];
  people: Person[];
  history: Movement[];
}
export const movementInput = z
  .object({
    action: z.enum(movements),
    assignee: text,
    location: text.min(1),
    notes: z.string().trim().max(2000),
    expectedVersion: z.number().int().positive(),
    requestId: z.string().uuid(),
  })
  .strict();
export const editInput = z
  .object({
    asset: assetInput,
    expectedVersion: z.number().int().positive(),
    requestId: z.string().uuid(),
  })
  .strict();
export const createInput = z
  .object({ asset: assetInput, requestId: z.string().uuid() })
  .strict();
export function blankAsset(): AssetInput {
  return {
    name: "",
    category: "Laptop",
    brand: "",
    model: "",
    serial: "",
    specs: "",
    condition: "Unknown",
    accessories: "",
    location: "IT storage",
    notes: "",
    purchaseCost: "",
    purchaseCurrency: "AED",
    purchaseDate: "",
    photos: [],
    serialChecked: false,
    specsChecked: false,
    conditionChecked: false,
  };
}
export const display = (v: string) => v || "Unknown";
export const serialIdentity = (v: string) => v.trim().toLowerCase();
export function needsReview(a: AssetInput) {
  return !a.serial || !a.specs || a.condition === "Unknown";
}
export function movementState(
  a: Asset,
  change: z.infer<typeof movementInput>,
): Pick<Asset, "assignee" | "location" | "status"> {
  if (a.status === "Retired")
    throw new Error("Retired assets cannot be moved.");
  if (
    (change.action === "Assign" || change.action === "Transfer") &&
    !change.assignee
  )
    throw new Error("Choose a person for this movement.");
  if (change.action === "Assign" && a.assignee)
    throw new Error("This asset is already assigned. Use Transfer.");
  if (change.action === "Transfer" && !a.assignee)
    throw new Error("This asset is unassigned. Use Assign.");
  if (change.action === "Return" && !a.assignee)
    throw new Error("This asset is already unassigned.");
  return {
    location: change.location,
    assignee: ["Assign", "Transfer"].includes(change.action)
      ? change.assignee
      : "",
    status:
      change.action === "Repair"
        ? "Repair"
        : change.action === "Retire"
          ? "Retired"
          : ["Assign", "Transfer"].includes(change.action)
            ? "Assigned"
            : needsReview(a)
              ? "Needs review"
              : "Available",
  };
}

export function findBySerial(assets: Asset[], serial: string) {
  const identity = serialIdentity(serial);
  return identity
    ? assets.filter((a) => serialIdentity(a.serial) === identity)
    : [];
}

export function inputOf(a: Asset): AssetInput {
  const base = blankAsset();
  return Object.fromEntries(
    Object.keys(base).map((k) => [k, a[k as keyof AssetInput]]),
  ) as AssetInput;
}
