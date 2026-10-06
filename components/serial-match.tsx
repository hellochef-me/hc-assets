"use client";
import Link from "next/link";
import { Check, Camera, TriangleAlert, ArrowRight } from "lucide-react";
import { type Asset } from "@/lib/model";
import { AssetIdentityCard } from "./asset-visual";
import { Button } from "./ui";
function ComparedSerial({ value, other }: { value: string; other: string }) {
  let start = 0;
  while (
    start < Math.min(value.length, other.length) &&
    value[start].toLowerCase() === other[start].toLowerCase()
  )
    start++;
  let end = value.length,
    otherEnd = other.length;
  while (
    end > start &&
    otherEnd > start &&
    value[end - 1].toLowerCase() === other[otherEnd - 1].toLowerCase()
  ) {
    end--;
    otherEnd--;
  }
  return (
    <strong>
      {value.slice(0, start)}
      <mark>{value.slice(start, end)}</mark>
      {value.slice(end)}
    </strong>
  );
}
export function SerialMatch({
  exact,
  candidates,
  scanned,
  reviewed,
  onReview,
  onOpen,
  onRetry,
  onContinue,
}: {
  exact: boolean;
  candidates: Asset[];
  scanned: string;
  reviewed: string[];
  onReview: (ids: string[]) => void;
  onOpen: () => void;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const allReviewed = candidates.every((a) => reviewed.includes(a.id));
  return (
    <section className="serial-match-screen" aria-labelledby="match-heading">
      <h1 id="match-heading" tabIndex={-1}>
        {exact
          ? "This device is already registered."
          : "Could this be the same device?"}
      </h1>
      <span className={`match-chip ${exact ? "exact" : "possible"}`}>
        {exact ? <Check /> : <TriangleAlert />}
        {exact ? "Exact serial match" : "Check the serial"}
      </span>
      <p className="screen-intro">
        {exact
          ? "Open its record to update details or change the owner."
          : "Compare the serial on the physical label before creating another record."}
      </p>
      {candidates.map((a) => (
        <div className="match-candidate" key={a.id}>
          {!exact && (
            <div className="serial-comparison">
              <div>
                <span>Scanned</span>
                <ComparedSerial value={scanned} other={a.serial} />
              </div>
              <div>
                <span>Existing</span>
                <ComparedSerial value={a.serial} other={scanned} />
              </div>
            </div>
          )}
          <AssetIdentityCard
            asset={a}
            compact={!exact || candidates.length > 1}
          />
          <Link
            className="button primary"
            href={`/assets/${encodeURIComponent(a.id)}`}
            onClick={onOpen}
          >
            {exact ? "Open existing asset" : "Open matching asset"}
            <ArrowRight />
            <span className="sr-only"> {a.serial}</span>
          </Link>
        </div>
      ))}
      <Button variant="secondary" onClick={onRetry}>
        <Camera />
        {exact ? "Scan another device" : "Read label again"}
      </Button>
      {exact ? (
        <p className="fine-print">No new record will be created.</p>
      ) : (
        <div className="different-device">
          <h2>Different device?</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={allReviewed}
              onChange={(e) =>
                onReview(e.target.checked ? candidates.map((a) => a.id) : [])
              }
            />
            I compared these records and checked the physical label. This is a
            different device.
          </label>
          <Button disabled={!allReviewed} onClick={onContinue}>
            Continue as new device
          </Button>
          <p className="fine-print">An exact duplicate cannot be created.</p>
        </div>
      )}
    </section>
  );
}
