"use client";
import {
  Camera,
  Keyboard,
  LoaderCircle,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "./ui";
export function ScanStatus({
  photo,
  serial,
  lookup,
  issue,
  onManual,
  onRetry,
}: {
  photo?: string;
  serial: string;
  lookup: boolean;
  issue: string;
  onManual: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="scan-status" aria-labelledby="scan-status-title">
      <h1 id="scan-status-title" tabIndex={-1}>
        {issue
          ? "We couldn’t finish this scan."
          : lookup
            ? "Checking inventory…"
            : "Reading the label…"}
      </h1>
      <p className="screen-intro">
        {issue
          ? "Try a clearer photo, or enter the serial from the device."
          : lookup
            ? "Looking for an existing record."
            : "Looking for brand, model and serial number."}
      </p>
      <div className="scan-status-card" aria-busy={!issue}>
        {lookup ? (
          <div className="lookup-serial">
            <ScanLine />
            <small>Serial number</small>
            <strong>{serial || "Unknown"}</strong>
          </div>
        ) : photo ? (
          <img
            className="reading-photo"
            src={photo}
            alt="Temporary label being read"
          />
        ) : (
          <div className="reading-placeholder">
            <ScanLine />
          </div>
        )}
        {issue ? (
          <div className="scan-issue" role="alert">
            <TriangleAlert />
            <p>{issue}</p>
          </div>
        ) : (
          <div role="status" className="reading-progress">
            <LoaderCircle className="reading-spinner" />
            <span>
              {lookup ? "Checking existing assets" : "Reading visible details"}
            </span>
          </div>
        )}
      </div>
      <div className="scan-status-actions">
        {issue && (
          <Button onClick={onRetry}>
            <Camera />
            Try another photo
          </Button>
        )}
        <Button variant="secondary" onClick={onManual}>
          <Keyboard />
          {issue ? "Enter manually" : "Cancel and enter manually"}
        </Button>
      </div>
      <p className="fine-print">
        Label photos are temporary and are not saved.
      </p>
    </section>
  );
}
