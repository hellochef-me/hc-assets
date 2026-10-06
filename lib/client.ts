import type { Asset, AssetInput, Snapshot } from "./model";
export class ApiError extends Error {
  constructor(
    message: string,
    public assetId?: string,
    public status?: number,
  ) {
    super(message);
  }
}
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
    });
  } catch {
    throw new ApiError(
      "Connection interrupted. Your draft is preserved. Retry to confirm the result.",
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. The save is not confirmed.",
    );
  }
  if (!r.ok || data?.error)
    throw new ApiError(
      data?.error || "The request failed.",
      data?.assetId,
      r.status,
    );
  return data;
}
export const fetchSnapshot = () => request<Snapshot>("/api/inventory");
export const saveAsset = (asset: AssetInput, requestId: string) =>
  request<{ asset: Asset }>("/api/inventory", {
    method: "POST",
    body: JSON.stringify({ asset, requestId }),
  });
export async function compressPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPG, PNG or WebP photo. Convert HEIC to JPG if needed.",
    );
  if (file.size > 20000000) throw new Error("Use a photo smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * ratio;
    canvas.height = bitmap.height * ratio;
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.75);
    if (data.length > 900000)
      throw new Error(
        "This photo is too large. Try a closer crop or lower resolution.",
      );
    return data;
  } finally {
    bitmap.close();
  }
}
