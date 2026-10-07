import { z } from "zod";

export const assistantIntents = [
  "register",
  "search",
  "edit",
  "move",
  "resale",
  "help",
] as const;
export type AssistantIntent = (typeof assistantIntents)[number];
export const assistantInput = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Describe what you need help with.")
      .max(2000),
    context: z
      .object({ selectedAssetId: z.string().trim().min(1).max(400).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type AssistantInput = z.infer<typeof assistantInput>;
export interface AssistantInterpretation {
  intent: AssistantIntent;
  query: string;
  reply: string;
  mode: "guided" | "ai";
}

export function assistantReply(intent: AssistantIntent, selected = false) {
  switch (intent) {
    case "register":
      return "Let's prepare an asset draft. Add photos or enter its label details, then review everything before saving.";
    case "search":
      return "I'll help you find matching assets. Choose a result to continue.";
    case "edit":
      return selected
        ? "Review the selected asset's details and choose the fields to update before saving."
        : "Find the asset you want to update, then review its details before saving.";
    case "move":
      return selected
        ? "Choose an assignment, return, or movement for the selected asset, then review before saving."
        : "Find the asset to assign, return, or move, then review its destination before saving.";
    case "resale":
      return selected
        ? "Choose a quick planning estimate or current market research for the selected asset."
        : "Find an asset, then choose a quick planning estimate or current market research.";
    default:
      return "I can help register, find, update, assign or move an asset, and explore resale value. Tell me what you need.";
  }
}

/** Classifies a request only. Every actual change remains a reviewed form action. */
export function guidedInterpretation(
  input: AssistantInput,
): AssistantInterpretation {
  const message = input.message.normalize("NFKC").replace(/\s+/g, " ").trim();
  let intent: AssistantIntent = "help";
  if (
    /\b(ignore (?:all |previous |system )*instructions|system prompt|api[ _-]?key|password|delete|erase|execute|run code)\b/i.test(
      message,
    )
  )
    intent = "help";
  else if (
    /\b(resale|resell|sell|valuation|worth|estimate|market research|price)\b/i.test(
      message,
    )
  )
    intent = "resale";
  else if (
    /\b(register|add|create|scan|new asset|new device|record a new)\b/i.test(
      message,
    )
  )
    intent = "register";
  else if (
    /\b(assign|reassign|unassign|return|move|transfer|retire|repair|hand over)\b/i.test(
      message,
    )
  )
    intent = "move";
  else if (/\b(edit|update|change|correct|fix|amend)\b/i.test(message))
    intent = "edit";
  else if (
    /\b(find|search|show|list|look up|locate|who has|where is|where's|do we have)\b/i.test(
      message,
    )
  )
    intent = "search";
  let query = "";
  if (["search", "edit", "move", "resale"].includes(intent)) {
    query = message
      .replace(
        /^(?:please\s+)?(?:can you\s+|could you\s+|i want to\s+|i need to\s+)?(?:find|search(?: for)?|show(?: me)?|list|look up|locate|who has|where is|where's|do we have|edit|update|change|correct|fix|amend|assign|reassign|unassign|return|move|transfer|retire|repair|resale(?: value)?(?: of| for)?|estimate(?: the)?(?: resale)?(?: value)?(?: of| for)?|what is|what's)\s*/i,
        "",
      )
      .replace(/\b(?:worth|resale value|please)\b/gi, "")
      .replace(/^[\s"']+|[\s?!.,"']+$/g, "")
      .trim()
      .slice(0, 400);
    if (
      /^(?:all\s+)?(?:assets?|inventory|equipment|it assets?|this|this asset|the selected asset)$/i.test(
        query,
      )
    )
      query = "";
  }
  return {
    intent,
    query,
    reply: assistantReply(intent, !!input.context?.selectedAssetId),
    mode: "guided",
  };
}
