"use client";
import { Button, Notice } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <Notice warning>
        The page could not be loaded. Your saved demo inventory is preserved.
      </Notice>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
