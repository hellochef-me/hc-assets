import { body, guard, json } from "@/lib/server/http";
import {
  assistantFailure,
  interpretAssistant,
} from "@/lib/server/assistant-intelligence";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request);
    return json(await interpretAssistant(await body(request)));
  } catch (error) {
    return assistantFailure(error);
  }
}
