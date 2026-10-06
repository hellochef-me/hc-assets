import { guard, json, failure } from "@/lib/server/http";
export async function POST(r: Request) {
  try {
    guard(r);
    return json(
      {
        error:
          "Photo recognition is not connected in this preview. Enter details from the label or try the fictional sample.",
      },
      503,
    );
  } catch (e) {
    return failure(e);
  }
}
