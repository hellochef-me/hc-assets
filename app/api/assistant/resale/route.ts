import { body, guard, json } from "@/lib/server/http";
import { backendSnapshot, intelligence } from "@/lib/server/backend";
import {
  assistantFailure,
  assistantResaleInput,
  assistantSource,
  fictionalResale,
} from "@/lib/server/assistant-intelligence";
import { StoreError } from "@/lib/server/store";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    guard(request);
    const input = assistantResaleInput.parse(await body(request));
    const source = await assistantSource();
    const asset = (await backendSnapshot()).assets.find(
      (a) => a.id === input.assetId,
    );
    if (!asset) throw new StoreError("Asset no longer exists.", 404);
    if (source.kind === "demo")
      return json({
        evidence: fictionalResale(),
        mode: "demo",
        notice:
          "Fictional fixed demo range. No current prices were researched and no real asset was valued.",
      });
    const provider = await intelligence("resale");
    const identity = {
      brand: asset.brand,
      model: asset.model,
      specs: asset.specs,
      condition: asset.condition,
    };
    return json({
      evidence: await (input.operation === "estimate"
        ? provider.estimate(identity)
        : provider.resale(identity)),
      mode: input.operation,
      notice:
        input.operation === "estimate"
          ? "Low confidence model planning estimate. No current market search was performed."
          : "Market research uses independently checked asking-price evidence when available. Estimates remain separately labelled.",
    });
  } catch (error) {
    return assistantFailure(error);
  }
}
