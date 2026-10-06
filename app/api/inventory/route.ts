import { backendSnapshot, backendCommit } from "@/lib/server/backend";
import { guard, json, body, failure } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    guard(r);
    return json(await backendSnapshot());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    guard(r);
    return json({ asset: await backendCommit("create", await body(r)) }, 201);
  } catch (e) {
    return failure(e);
  }
}
