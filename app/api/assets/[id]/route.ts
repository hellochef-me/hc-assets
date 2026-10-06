import { backendCommit } from "@/lib/server/backend";
import { guard, json, body, failure } from "@/lib/server/http";
export const runtime = "nodejs";
export async function PATCH(
  r: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    guard(r);
    const { id } = await ctx.params;
    const input = await body(r);
    return json({
      asset: await backendCommit(input?.action ? "move" : "edit", input, id),
    });
  } catch (e) {
    return failure(e);
  }
}
