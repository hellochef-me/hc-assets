import { guard, json, failure } from "@/lib/server/http";
import { previewSource } from "@/lib/server/backend";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    return json(await previewSource());
  } catch (e) {
    return failure(e);
  }
}
