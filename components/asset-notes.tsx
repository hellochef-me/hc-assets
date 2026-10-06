"use client";
import { useRef, useState } from "react";
import { Pencil, Check } from "lucide-react";
import { type Asset, notesText, type Snapshot } from "@/lib/model";
import { ApiError, request } from "@/lib/client";
import { Button, Field, Notice } from "./ui";

export function AssetNotes({
  asset,
  canWrite,
  onUpdated,
}: {
  asset: Asset;
  canWrite: boolean;
  onUpdated: (asset: Asset) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Asset | null>(null);
  const version = useRef(asset.version);
  const receipt = useRef({ payload: "", id: "" });
  const editButton = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  function finish() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !canWrite || conflict) return;
    const parsed = notesText.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      textarea.current?.focus();
      return;
    }
    const value = { notes: parsed.data, expectedVersion: version.current };
    const payload = JSON.stringify(value);
    if (receipt.current.payload !== payload)
      receipt.current = { payload, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await request<{ asset: Asset }>(
        `/api/assets/${encodeURIComponent(asset.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...value, requestId: receipt.current.id }),
        },
      );
      onUpdated(result.asset);
      setSaved(true);
      finish();
    } catch (error) {
      setError((error as Error).message);
      if (error instanceof ApiError && error.status === 409) setConflict(true);
    } finally {
      setSaving(false);
    }
  }
  async function loadLatest() {
    setSaving(true);
    try {
      const snapshot = await request<Snapshot>("/api/inventory");
      const current = snapshot.assets.find((item) => item.id === asset.id);
      if (!current) throw new Error("This asset no longer exists.");
      onUpdated(current);
      setLatest(current);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="card notes-card" aria-labelledby="asset-notes-heading">
      <div className="notes-heading">
        <div>
          <h2 id="asset-notes-heading">Notes</h2>
          <p className="muted-text">Additional details about this asset.</p>
        </div>
        {!editing && (
          <Button
            ref={editButton}
            variant="secondary"
            disabled={!canWrite}
            onClick={() => {
              setDraft(asset.notes);
              version.current = asset.version;
              receipt.current = { payload: "", id: "" };
              setError("");
              setSaved(false);
              setConflict(false);
              setLatest(null);
              setEditing(true);
            }}
          >
            <Pencil />
            {asset.notes ? "Edit notes" : "Add notes"}
          </Button>
        )}
      </div>
      {editing ? (
        <form onSubmit={save}>
          <Field
            label="Asset notes"
            hint={`${draft.length.toLocaleString("en-GB")} / 2,000 characters. Leave empty to clear notes.`}
          >
            <textarea
              ref={textarea}
              autoFocus
              rows={6}
              value={draft}
              readOnly={saving}
              onChange={(event) => {
                setDraft(event.target.value);
                if (!conflict) setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !saving) {
                  event.preventDefault();
                  finish();
                }
              }}
            />
          </Field>
          {error && <Notice warning>{error}</Notice>}
          {conflict && !latest && (
            <Button
              type="button"
              variant="secondary"
              onClick={loadLatest}
              disabled={saving}
            >
              {saving ? "Loading latest note…" : "Review latest note"}
            </Button>
          )}
          {latest && (
            <div className="notes-conflict">
              <h3>Latest saved note</h3>
              <p className="asset-notes">
                {latest.notes || "No notes added yet."}
              </p>
              <p className="muted-text">
                Your draft above is preserved. Choose which note to keep before
                saving.
              </p>
              <div className="notes-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDraft(latest.notes);
                    version.current = latest.version;
                    setConflict(false);
                    setLatest(null);
                    textarea.current?.focus();
                  }}
                >
                  Use latest note
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    version.current = latest.version;
                    setConflict(false);
                    setLatest(null);
                    textarea.current?.focus();
                  }}
                >
                  Keep my draft
                </Button>
              </div>
            </div>
          )}
          <div className="notes-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={finish}
            >
              Cancel
            </Button>
            <Button disabled={saving || conflict || !canWrite}>
              {saving ? "Saving notes…" : "Save notes"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className={asset.notes ? "asset-notes" : "muted-text"}>
            {asset.notes || "No notes added yet."}
          </p>
          {saved && (
            <p className="notes-confirmed" role="status">
              <Check />
              Notes saved.
            </p>
          )}
        </>
      )}
    </section>
  );
}
