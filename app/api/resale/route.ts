import { guard, json, failure, body } from "@/lib/server/http";
import { backendSnapshot, intelligence } from "@/lib/server/backend";
import { StoreError } from "@/lib/server/store";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(r: Request) {
  try {
    guard(r);
    const provider = await intelligence("resale");
    const input = z
      .object({ assetId: z.string().min(1).max(400) })
      .strict()
      .parse(await body(r));
    const asset = (await backendSnapshot()).assets.find(
      (a) => a.id === input.assetId,
    );
    if (!asset) throw new StoreError("Asset no longer exists.", 404);
    return json(
      await provider.resale({
        brand: asset.brand,
        model: asset.model,
        specs: asset.specs,
        condition: asset.condition,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
