"use client";
import { Select } from "./select";
import { useRef, useState } from "react";
import {
  Asset,
  Person,
  movements,
  movementInput,
  locations,
  isStorageLocation,
} from "@/lib/model";
import { request } from "@/lib/client";
import { useSource } from "./source-context";
import { Button, Dialog, Field, Notice } from "./ui";
export function MoveDialog({
  asset,
  people,
  open,
  onClose,
  onSaved,
}: {
  asset: Asset;
  people: Person[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { source } = useSource();
  const [action, setAction] = useState<(typeof movements)[number]>(
      asset.assignee ? "Transfer" : "Assign",
    ),
    [assignee, setAssignee] = useState(""),
    [location, setLocation] = useState(
      isStorageLocation(asset.location) ? asset.location : "",
    ),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const locationOptional =
    ["Assign", "Transfer"].includes(action) && Boolean(assignee.trim());
  const receipt = useRef({ payload: "", id: "" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      action,
      assignee: ["Assign", "Transfer"].includes(action) ? assignee : "",
      location,
      notes,
      expectedVersion: asset.version,
    };
    const payload = JSON.stringify(input);
    if (receipt.current.payload !== payload)
      receipt.current = { payload, id: crypto.randomUUID() };
    const parsed = movementInput.safeParse({
      ...input,
      requestId: receipt.current.id,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await request(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      title="Move or assign"
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={save}>
        <p className="muted-text">
          {asset.name} · {asset.id}
        </p>
        <Field label="Movement">
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            {movements.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        {["Assign", "Transfer"].includes(action) && (
          <Field label="Assign to">
            <Select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              required
            >
              <option value="">Choose a person</option>
              {people.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Destination"
          hint={
            locationOptional
              ? "Storage location is optional while assigned to someone."
              : "Unassigned equipment must be stored in Engineering Area or Locker."
          }
        >
          <Select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required={!locationOptional}
          >
            <option value="">
              {locationOptional
                ? "No storage location — with assignee"
                : "Choose a storage location"}
            </option>
            {locations.map((location) => (
              <option key={location}>{location}</option>
            ))}
          </Select>
        </Field>
        <Field label="Movement notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
        <Notice>
          {action === "Retire"
            ? "Retirement is final in this preview."
            : `${asset.assignee || "Unassigned"} · ${asset.location} → ${["Assign", "Transfer"].includes(action) ? assignee || "Choose person" : "Unassigned"} · ${location}`}
          <br />
          Recorded as{" "}
          {source?.kind === "demo"
            ? "Demo operator"
            : "Local operator (authentication deferred)"}{" "}
          with server time.
        </Notice>
        {error && <Notice warning>{error}</Notice>}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={saving}>
            {saving ? "Saving…" : "Confirm movement"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
