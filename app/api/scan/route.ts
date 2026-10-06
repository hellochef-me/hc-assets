import { guard, json, failure, body } from "@/lib/server/http";
import { intelligence } from "@/lib/server/backend";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(r: Request) {
  try {
    guard(r);
    const provider = await intelligence();
    const input = z
      .object({
        photos: z
          .array(
            z
              .string()
              .max(900000)
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
          )
          .min(1)
          .max(3),
      })
      .strict()
      .parse(await body(r));
    return json(await provider.extract(input.photos));
  } catch (e) {
    return failure(e);
  }
}
