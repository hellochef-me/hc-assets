import { guard, json, failure } from "@/lib/server/http";
export async function POST(r: Request) {
  try {
    guard(r);
    return json(
      {
        error:
          "Live resale research is not connected. No market estimate or comparables have been fabricated.",
      },
      503,
    );
  } catch (e) {
    return failure(e);
  }
}
