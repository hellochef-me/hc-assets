import { AskIT } from "@/components/ask-it";
import { previewSource } from "@/lib/server/backend";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const source = await previewSource();
  if (source.kind !== "demo" && !source.assistantEnabled) notFound();
  const params = await searchParams;
  return <AskIT key={params.asset || "new"} assetId={params.asset || ""} />;
}
