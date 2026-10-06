import { Scan } from "@/components/scan";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string }>;
}) {
  const params = await searchParams;
  return <Scan manual={params.manual === "1"} />;
}
