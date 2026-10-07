"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  ImagePlus,
  MessageCircle,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  X,
  LoaderCircle,
  User,
  Package,
} from "lucide-react";
import {
  type Asset,
  type AssetInput,
  categories,
  conditions,
  inputOf,
  locationLabel,
  thumbnailPhoto,
  movementState,
} from "@/lib/model";
import { ApiError, compressPhoto, fetchSnapshot, request } from "@/lib/client";
import {
  type AssistantDraft,
  type Stage,
  type EditField,
  freshAssistant,
  selectAssistantAsset,
  searchAssets,
  identityMatches,
  createAssistantCommand,
  changedFields,
  assistantStorageKey,
  assistantHandoffKey,
  scanStorageKey,
  restoreAssistant,
  persistAssistant,
  matchingEmployees,
} from "@/lib/assistant-flow";
import type {
  PhotoExtraction,
  ResaleEvidence,
} from "@/lib/server/integrations";
import { resaleScenarios } from "@/lib/resale";
import { useInventory } from "./use-inventory";
import { useSource } from "./source-context";
import { Button, Device, Notice, Badge, date } from "./ui";
import { CameraCapture } from "./camera-capture";
import { EntryListEditor, EntryListDisplay } from "./entry-list";
import "./ask-it.css";

function explain(error: unknown) {
  const value = error as { issues?: { message: string }[]; message?: string };
  return (
    value.issues?.[0]?.message ||
    value.message ||
    "The operation could not be completed. Your draft is preserved."
  );
}
const fieldNames: Record<EditField, string> = {
  name: "Asset name",
  serial: "Serial number",
  brand: "Brand",
  model: "Model",
  specs: "Specifications",
  accessories: "Accessories",
  notes: "Notes",
  purchaseCost: "Purchase cost (AED)",
};
function question(d: AssistantDraft) {
  switch (d.stage) {
    case "welcome":
      return "What would you like to do?";
    case "capture":
      return "Let’s start with the device label.";
    case "serial":
      return "What serial number is on the device?";
    case "confirm-serial":
      return `I have serial ${d.asset.serial}. Does it match the label?`;
    case "matches":
      return "Could this already be in your inventory?";
    case "unknown":
      return "Let’s check for an existing device first.";
    case "name":
      return "What should we call this device?";
    case "category":
      return "What kind of equipment is it?";
    case "ownership":
      return "Who will use this device?";
    case "employee":
      return "Who should be responsible for it?";
    case "photo":
      return "Add a photo of the whole device?";
    case "options":
      return d.mode === "edit"
        ? "What would you like to update?"
        : "The essentials are ready. Anything else to add?";
    case "field":
      return `Let’s update ${fieldNames[d.field].toLowerCase()}.`;
    case "condition":
      return "What condition would you like to record?";
    case "review":
      return d.pending
        ? "Your previous save needs confirmation."
        : "Please check the summary before saving.";
    case "search":
      return "Which asset do you need help with?";
    case "asset":
      return "What would you like to do with this asset?";
    case "movement":
      return "Where is this device going next?";
    case "destination":
      return "Where will the device be stored?";
    case "movement-note":
      return "Add a handover note?";
    case "resale":
      return "Would you like a quick estimate or current market research?";
    case "saved":
      return "Saved successfully.";
  }
}
function Choice({
  children,
  onClick,
  primary = false,
  disabled = false,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`it-choice ${primary ? "is-primary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
      <ChevronRight className="it-choice-arrow" />
    </button>
  );
}
function ContextCard({
  asset,
  assignee,
  status,
}: {
  asset: AssetInput;
  assignee: string;
  status?: string;
}) {
  return (
    <div className="it-context">
      <Device asset={asset} />
      <div>
        <strong>{asset.name || "New device"}</strong>
        <small>{asset.serial || "Serial not confirmed"}</small>
        <small>
          {assignee || "Unassigned"} · {locationLabel({ ...asset, assignee })}
        </small>
      </div>
      {status && <Badge status={status} />}
    </div>
  );
}
function Review({ draft }: { draft: AssistantDraft }) {
  const before = draft.selected,
    next = draft.asset;
  const changes = before
    ? changedFields(inputOf(before), next).filter(
        (k) => !k.endsWith("Checked") && k !== "coverPhotoIndex",
      )
    : [];
  let movement: ReturnType<typeof movementState> | undefined;
  if (draft.mode === "move" && before) {
    try {
      movement = movementState(before, {
        action: draft.action,
        assignee: draft.assignee,
        location: next.location,
        notes: draft.movementNotes,
        expectedVersion: before.version,
        requestId: "",
      });
    } catch {
      /* validation exposes error at confirmation */
    }
  }
  function renderValue(key: keyof AssetInput, asset: AssetInput) {
    if (key === "photos")
      return thumbnailPhoto(asset) ? "Device photo added" : "No device photo";
    if (key === "specs" || key === "accessories")
      return <EntryListDisplay value={asset[key]} emptyLabel="Unknown" />;
    return String(asset[key] || "Unknown");
  }
  return (
    <section className="it-review" aria-label="Review changes">
      <span className="it-draft-label">
        <ClipboardCheck />
        Draft · Not saved
      </span>
      <ContextCard asset={next} assignee={draft.assignee} />
      {draft.mode === "create" ? (
        <dl>
          <div>
            <dt>Category</dt>
            <dd>{next.category}</dd>
          </div>
          <div>
            <dt>Condition</dt>
            <dd>{next.condition}</dd>
          </div>
          <div>
            <dt>Specifications</dt>
            <dd>
              <EntryListDisplay value={next.specs} emptyLabel="Unknown" />
            </dd>
          </div>
          <div>
            <dt>Accessories</dt>
            <dd>
              <EntryListDisplay
                value={next.accessories}
                emptyLabel="Not checked"
              />
            </dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{next.notes || "None"}</dd>
          </div>
        </dl>
      ) : draft.mode === "move" ? (
        <dl className="it-diff">
          <div>
            <dt>Owner</dt>
            <dd>
              {before?.assignee || "Unassigned"}
              <span>→</span>
              <strong>{movement?.assignee || "Unassigned"}</strong>
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {before && locationLabel(before)}
              <span>→</span>
              <strong>{movement && locationLabel(movement)}</strong>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {before?.status}
              <span>→</span>
              <strong>{movement?.status}</strong>
            </dd>
          </div>
          <div>
            <dt>Note</dt>
            <dd>{draft.movementNotes || "None"}</dd>
          </div>
        </dl>
      ) : (
        <dl className="it-diff">
          {changes.map((k) => (
            <div key={k}>
              <dt>{fieldNames[k as EditField] || k}</dt>
              <dd>
                <div>{renderValue(k, inputOf(before!))}</div>
                <span>→</span>
                <div className="it-new-value">{renderValue(k, next)}</div>
              </dd>
            </div>
          ))}
          {!changes.length && <p>No details have changed yet.</p>}
        </dl>
      )}
      {draft.mode === "create" && !next.serial && (
        <p className="it-caution">
          Serial unknown. Identity cannot be conclusively checked.
        </p>
      )}
    </section>
  );
}
export function AskIT({ assetId = "" }: { assetId?: string }) {
  const {
    snapshot,
    loading,
    error: loadError,
    reload,
    setSnapshot,
  } = useInventory();
  const { source, canWrite } = useSource();
  const [draft, setDraft] = useState<AssistantDraft>(freshAssistant);
  const [ready, setReady] = useState(false),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(""),
    [camera, setCamera] = useState<"label" | "device" | null>(null),
    [attachment, setAttachment] = useState(false);
  const [evidence, setEvidence] = useState<ResaleEvidence | null>(null),
    [resaleNotice, setResaleNotice] = useState("");
  const [conflict, setConflict] = useState(false),
    [clearing, setClearing] = useState(false);
  const upload = useRef<HTMLInputElement>(null),
    native = useRef<HTMLInputElement>(null),
    photoPurpose = useRef<"label" | "device">("label");
  const op = useRef(0),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false),
    initialized = useRef(false);
  const current = useRef(draft),
    heading = useRef<HTMLHeadingElement>(null),
    composer = useRef<HTMLInputElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const prompt = question(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      op.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (initialized.current || !snapshot) return;
    initialized.current = true;
    queueMicrotask(() => {
      try {
        const handoff = sessionStorage.getItem(assistantHandoffKey);
        const raw = sessionStorage.getItem(assistantStorageKey);
        let restored = raw ? restoreAssistant(raw) : null;
        if (handoff && !restored?.pending) {
          restored = restoreAssistant(handoff);
          sessionStorage.removeItem(assistantHandoffKey);
        }
        if (restored?.pending) {
          setDraft(restored);
          setError(
            "The previous save was interrupted. Check its result using the same save reference before making another change.",
          );
        } else if (assetId) {
          const selected = snapshot.assets.find(
            (a) => a.id === (snapshot.aliases?.[assetId] || assetId),
          );
          if (selected) setDraft(selectAssistantAsset(selected));
          else
            setError(
              "That asset was not found. Search inventory to choose another.",
            );
        } else if (restored) {
          setDraft(restored);
          if (restored.stage !== "welcome")
            setNotice(
              "Your unfinished conversation was restored on this device.",
            );
        }
      } catch {
        setNotice(
          "The previous draft could not be restored. Start a new conversation.",
        );
      }
      setDraft((d) => ({ ...d, draftId: d.draftId || crypto.randomUUID() }));
      setReady(true);
    });
  }, [snapshot, assetId]);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(assistantStorageKey, persistAssistant(draft));
    } catch {
      queueMicrotask(() =>
        setNotice(
          "This browser cannot preserve the draft on refresh. Keep this page open until saving is confirmed.",
        ),
      );
    }
  }, [draft, ready]);
  useEffect(() => {
    if (!draft.pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.pending]);
  useEffect(() => {
    if (ready) {
      heading.current?.focus({ preventScroll: true });
      stream.current?.scrollTo(0, 0);
    }
  }, [draft.stage, ready]);
  function advance(patch: Partial<AssistantDraft>, answer = "") {
    setError("");
    setText("");
    setNotice("");
    setAttachment(false);
    setDraft((d) => ({
      ...d,
      ...patch,
      transcript: answer
        ? [...d.transcript, { question: question(d), answer }].slice(-12)
        : d.transcript,
    }));
  }
  const go = (stage: Stage, answer = "") => advance({ stage }, answer);
  function cancel() {
    op.current++;
    controller.current?.abort();
    controller.current = null;
    lock.current = false;
    setBusy("");
    setCamera(null);
  }
  function begin() {
    if (draft.pending) return;
    cancel();
    setEvidence(null);
    setResaleNotice("");
    setClearing(false);
    setError("");
    setNotice("");
    setText("");
    setDraft({ ...freshAssistant(), draftId: crypto.randomUUID() });
  }
  function chooseAsset(asset: Asset) {
    setEvidence(null);
    setResaleNotice("");
    setError("");
    setDraft((d) =>
      selectAssistantAsset(asset, {
        ...d,
        transcript: [
          ...d.transcript,
          {
            question: question(d),
            answer: `Selected ${asset.name} · ${asset.serial || asset.id}`,
          },
        ].slice(-12),
      }),
    );
  }
  function editField(field: EditField) {
    advance({ field, stage: "field" });
  }
  function updateAsset(patch: Partial<AssetInput>) {
    setDraft((d) => ({
      ...d,
      asset: { ...d.asset, ...patch },
      ...(Object.hasOwn(patch, "serial")
        ? { checkedSerial: null, reviewedMatchIds: [], unknownConfirmed: false }
        : {}),
    }));
  }
  async function lookup() {
    if (lock.current) return;
    lock.current = true;
    const token = ++op.current;
    setBusy("Checking inventory…");
    setError("");
    try {
      const fresh = await fetchSnapshot();
      if (token !== op.current) return;
      setSnapshot(fresh);
      const next = {
        ...current.current,
        asset: { ...current.current.asset },
        checkedSerial: current.current.asset.serial,
      };
      const matches = identityMatches(next, fresh.assets);
      setDraft({
        ...next,
        stage:
          matches.exact.length || matches.possible.length
            ? "matches"
            : next.mode === "edit"
              ? "options"
              : "name",
      });
      setNotice(
        matches.exact.length || matches.possible.length
          ? ""
          : "No matching serial found.",
      );
    } catch (e) {
      if (token === op.current) setError(explain(e));
    } finally {
      if (token === op.current) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function captured(data: string, purpose: "label" | "device") {
    setCamera(null);
    if (purpose === "device") {
      updateAsset({ photos: [data], coverPhotoIndex: 0 });
      go("photo");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    const token = ++op.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("Reading the label…");
    setError("");
    try {
      const result = await request<{
        extraction: PhotoExtraction;
        notice: string;
        mode: string;
      }>("/api/assistant/scan", {
        method: "POST",
        body: JSON.stringify({ photos: [data] }),
        signal: abort.signal,
      });
      if (token !== op.current) return;
      const e = result.extraction;
      setNotice(result.notice);
      setDraft((d) => ({
        ...d,
        asset: {
          ...d.asset,
          serial: e.serial || "",
          serialChecked: false,
          brand: d.asset.brand || e.brand || "",
          model: d.asset.model || e.model || "",
          name: d.asset.name || [e.brand, e.model].filter(Boolean).join(" "),
          specs: d.asset.specs || e.specs || "",
          specsChecked: d.asset.specs ? d.asset.specsChecked : false,
        },
        checkedSerial: null,
        reviewedMatchIds: [],
        stage: e.serial ? "confirm-serial" : "serial",
      }));
    } catch (e) {
      if (token === op.current) {
        setError(explain(e));
        setDraft((d) => ({ ...d, stage: "capture" }));
      }
    } finally {
      if (token === op.current) {
        lock.current = false;
        setBusy("");
        controller.current = null;
      }
    }
  }
  async function fileSelected(file?: File) {
    if (!file || lock.current) return;
    const token = ++op.current;
    const purpose = photoPurpose.current;
    setBusy("Preparing photo…");
    lock.current = true;
    setError("");
    try {
      const data = await compressPhoto(file);
      if (token !== op.current) return;
      lock.current = false;
      setBusy("");
      await captured(data, purpose);
    } catch (e) {
      if (token === op.current) setError(explain(e));
    } finally {
      if (token === op.current) {
        lock.current = false;
        setBusy("");
      }
      if (upload.current) upload.current.value = "";
      if (native.current) native.current.value = "";
    }
  }
  function uploadPhoto(purpose: "label" | "device") {
    photoPurpose.current = purpose;
    upload.current?.click();
  }
  function serialContinue(value: string) {
    const serial = value.trim();
    if (!serial) {
      go("unknown");
      return;
    }
    advance(
      {
        asset: { ...draft.asset, serial, serialChecked: false },
        checkedSerial: null,
        reviewedMatchIds: [],
        unknownConfirmed: false,
        stage: "confirm-serial",
      },
      serial,
    );
  }
  function review() {
    const proposed = { ...draft, stage: "review" as const };
    try {
      if (!snapshot) throw new Error("Inventory has not loaded.");
      createAssistantCommand(proposed, snapshot, crypto.randomUUID());
      advance({ stage: "review" });
    } catch (e) {
      setError(explain(e));
      if (/changed|version|latest/i.test(explain(e))) setConflict(true);
    }
  }
  async function save() {
    if (lock.current || !snapshot || !canWrite) return;
    let command = draft.pending;
    try {
      command ??= createAssistantCommand(draft, snapshot, crypto.randomUUID());
    } catch (e) {
      setError(explain(e));
      if (/changed|version|latest/i.test(explain(e))) setConflict(true);
      return;
    }
    const saving = { ...draft, pending: command };
    // Persist the immutable command before sending, so an interrupted retry reuses its ID and payload.
    try {
      sessionStorage.setItem(assistantStorageKey, persistAssistant(saving));
    } catch {
      setNotice("Keep this page open until the save result is confirmed.");
    }
    setDraft(saving);
    lock.current = true;
    setBusy(draft.pending ? "Checking save result…" : "Saving your change…");
    setError("");
    setConflict(false);
    try {
      const result = await request<{ asset: Asset }>(command.url, {
        method: command.method,
        body: JSON.stringify(command.body),
      });
      setDraft((d) => ({
        ...selectAssistantAsset(result.asset, d),
        stage: "saved",
        pending: null,
      }));
      setSnapshot((s) =>
        s
          ? {
              ...s,
              assets: [
                result.asset,
                ...s.assets.filter((a) => a.id !== result.asset.id),
              ],
            }
          : s,
      );
    } catch (e) {
      const failure = e as ApiError;
      setError(failure.message);
      if (
        failure.status &&
        [400, 403, 404, 409, 422].includes(failure.status)
      ) {
        setDraft((d) => ({ ...d, pending: null }));
        if (failure.status === 409) {
          if (failure.assetId && failure.code === "duplicate") {
            try {
              const latest = await fetchSnapshot();
              setSnapshot(latest);
              const existing = latest.assets.find(
                (a) => a.id === failure.assetId,
              );
              if (existing) {
                chooseAsset(existing);
                setNotice(
                  "This device was registered before your save completed. We opened its existing record; no new record was created.",
                );
              }
            } catch {
              setError(
                "Another record has this serial. Reload inventory before continuing.",
              );
            }
          } else setConflict(true);
        }
      }
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function refreshConflict() {
    if (!draft.selected) {
      await lookup();
      return;
    }
    setBusy("Loading the latest asset…");
    try {
      const fresh = await fetchSnapshot();
      setSnapshot(fresh);
      const asset = fresh.assets.find((a) => a.id === draft.selected!.id);
      if (!asset)
        throw new Error("Asset no longer exists. Search inventory again.");
      const keys = changedFields(inputOf(draft.selected), draft.asset);
      const merged = inputOf(asset);
      for (const key of keys)
        Object.assign(merged, { [key]: draft.asset[key] });
      const serialChanged = merged.serial !== draft.asset.serial;
      if (serialChanged) merged.serialChecked = false;
      if (merged.specs !== draft.asset.specs) merged.specsChecked = false;
      if (merged.condition !== draft.asset.condition)
        merged.conditionChecked = false;
      setDraft((d) => ({
        ...d,
        selected: asset,
        asset: merged,
        assignee: d.mode === "edit" ? asset.assignee : d.assignee,
        checkedSerial: serialChanged ? null : d.checkedSerial,
        reviewedMatchIds: serialChanged ? [] : d.reviewedMatchIds,
        stage:
          d.mode === "move"
            ? "movement"
            : serialChanged
              ? "confirm-serial"
              : "options",
        pending: null,
      }));
      setConflict(false);
      setError("");
      setNotice(
        "Latest version loaded. Your proposed details are retained; review them again before saving.",
      );
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy("");
    }
  }
  async function research(operation: "estimate" | "research") {
    if (!draft.selected || lock.current) return;
    lock.current = true;
    const token = ++op.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(
      operation === "estimate"
        ? "Preparing indicative scenarios…"
        : "Researching current UAE listings…",
    );
    setError("");
    try {
      const result = await request<{
        evidence: ResaleEvidence;
        notice: string;
      }>("/api/assistant/resale", {
        method: "POST",
        body: JSON.stringify({ assetId: draft.selected.id, operation }),
        signal: abort.signal,
      });
      if (token !== op.current) return;
      setEvidence(result.evidence);
      setResaleNotice(result.notice);
    } catch (e) {
      if (token === op.current) setError(explain(e));
    } finally {
      if (token === op.current) {
        setBusy("");
        lock.current = false;
      }
    }
  }
  function saveEstimate() {
    if (!evidence || !draft.selected) return;
    const rows = resaleScenarios(evidence);
    const memo = [
      draft.asset.notes,
      `Indicative resale (${date(evidence.indicative?.estimatedAt || evidence.asOf || "")}) — ${resaleNotice}`,
      ...rows.map((s) => `${s.label}: AED ${s.low}–${s.high}`),
      "Planning scenarios only. Battery/function require inspection. Purchase cost unchanged.",
    ]
      .filter(Boolean)
      .join("\n");
    if (memo.length > 2000) {
      setError(
        "There is not enough space in notes for this estimate. Edit the existing notes first.",
      );
      return;
    }
    advance({
      mode: "edit",
      asset: { ...draft.asset, notes: memo },
      stage: "review",
    });
  }
  async function interpret(message: string) {
    if (lock.current) return;
    lock.current = true;
    const token = ++op.current;
    setBusy("Finding the next step…");
    setError("");
    try {
      const result = await request<{
        intent: string;
        query: string;
        reply: string;
        mode: string;
      }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          message,
          context: draft.selected
            ? { selectedAssetId: draft.selected.id }
            : undefined,
        }),
      });
      if (token !== op.current) return;
      const stages: Record<string, Stage> = {
        register: "capture",
        search: "search",
        edit: draft.selected ? "options" : "search",
        move: draft.selected ? "movement" : "search",
        resale: draft.selected ? "resale" : "search",
        help: draft.selected ? "asset" : "welcome",
      };
      if (result.intent === "register")
        setDraft((d) => ({
          ...freshAssistant(),
          draftId: crypto.randomUUID(),
          stage: "capture",
          transcript: [
            ...d.transcript,
            { question: question(d), answer: message },
          ].slice(-12),
        }));
      else
        advance(
          {
            stage: stages[result.intent] || "welcome",
            ...(result.intent === "move" && draft.selected
              ? { mode: "move" as const }
              : {}),
            query: result.query,
          },
          message,
        );
      setNotice(result.reply);
    } catch (e) {
      if (token === op.current) setError(explain(e));
    } finally {
      if (token === op.current) {
        setBusy("");
        lock.current = false;
      }
    }
  }
  function typed(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy || draft.pending) return;
    if (draft.stage === "serial") return serialContinue(value);
    if (draft.stage === "capture") {
      if (/^(take|open).*(photo|camera)|^camera$/i.test(value)) {
        setText("");
        setCamera("label");
        return;
      }
      if (/^upload/i.test(value)) {
        setText("");
        uploadPhoto("label");
        return;
      }
      if (/^(enter|type|manual)/i.test(value)) {
        go("serial");
        return;
      }
      serialContinue(value);
      return;
    }
    if (draft.stage === "condition") {
      const condition = conditions.find(
        (c) => c.toLowerCase() === value.toLowerCase(),
      );
      if (!condition) {
        setError(
          "Choose Unknown, New, Good, Fair or Damaged.",
        );
        return;
      }
      advance(
        {
          asset: { ...draft.asset, condition, conditionChecked: false },
          stage: "options",
        },
        condition,
      );
      return;
    }
    if (draft.stage === "photo") {
      if (/^(skip|not now|later|no( thanks)?)(\b|$)/i.test(value)) {
        go("options", value);
        return;
      }
      if (/^(take|open|retake)/i.test(value)) {
        setText("");
        setCamera("device");
        return;
      }
      if (/^upload/i.test(value)) {
        setText("");
        uploadPhoto("device");
        return;
      }
      if (/^(use|keep|yes)/i.test(value) && thumbnailPhoto(draft.asset)) {
        go("options", value);
        return;
      }
      setError("Take or upload a device photo, or type Skip for now.");
      return;
    }
    if (draft.stage === "movement") {
      if (/\b(repair|retire)\b/i.test(value)) {
        advance(
          {
            mode: "move",
            action: /retire/i.test(value) ? "Retire" : "Repair",
            assignee: "",
            stage: "destination",
          },
          value,
        );
        return;
      }
      const location = /\blocker\b/i.test(value)
        ? "Locker"
        : /\bengineering( area)?\b/i.test(value)
          ? "Engineering Area"
          : "";
      if (location && draft.selected?.assignee) {
        advance(
          {
            mode: "move",
            action: "Return",
            assignee: "",
            asset: { ...draft.asset, location },
            stage: "movement-note",
          },
          value,
        );
        return;
      }
      if (location && !draft.selected?.assignee) {
        advance(
          {
            mode: "edit",
            asset: { ...draft.asset, location },
            stage: "options",
          },
          value,
        );
        return;
      }
      if (/^(return|unassign)/i.test(value)) {
        setError(
          "Choose a storage location for the return: Locker or Engineering Area.",
        );
        return;
      }
      advance(
        {
          mode: "move",
          action: draft.selected?.assignee ? "Transfer" : "Assign",
          stage: "employee",
          query: value.replace(
            /^(assign|reassign|transfer)( (it|this))?( to)?\s+/i,
            "",
          ),
        },
        value,
      );
      return;
    }
    if (draft.stage === "confirm-serial") {
      if (/^(no|incorrect|wrong|correct serial)$/i.test(value)) {
        go("serial", value);
        return;
      }
      if (/^(yes|correct|confirm)$/i.test(value)) {
        void lookup();
        setText("");
        return;
      }
      serialContinue(value);
      return;
    }
    if (draft.stage === "name") {
      advance(
        {
          asset: { ...draft.asset, name: value.slice(0, 400) },
          stage: "category",
        },
        value,
      );
      return;
    }
    if (["search", "unknown", "employee"].includes(draft.stage)) {
      advance({ query: value }, value);
      return;
    }
    if (draft.stage === "field") {
      const v =
        draft.field === "purchaseCost" ? value.replace(/^AED\s*/i, "") : value;
      const patch = {
        ...draft.asset,
        [draft.field]: v,
        ...(draft.field === "specs" ? { specsChecked: false } : {}),
        ...(draft.field === "serial" ? { serialChecked: false } : {}),
      };
      advance(
        {
          asset: patch,
          stage: draft.field === "serial" ? "confirm-serial" : "options",
          ...(draft.field === "serial"
            ? { checkedSerial: null, reviewedMatchIds: [] }
            : {}),
        },
        value,
      );
      return;
    }
    if (draft.stage === "ownership" || draft.stage === "destination") {
      const location = /^locker$/i.test(value)
        ? "Locker"
        : /^engineering( area)?$/i.test(value)
          ? "Engineering Area"
          : "";
      if (location) {
        advance(
          {
            assignee: draft.mode === "edit" ? draft.assignee : "",
            asset: { ...draft.asset, location },
            stage:
              draft.mode === "move"
                ? "movement-note"
                : draft.stage === "destination"
                  ? "options"
                  : "photo",
          },
          location,
        );
        return;
      }
      if (draft.stage === "ownership") {
        advance({ stage: "employee", query: value }, value);
        return;
      }
      setError("Choose Locker or Engineering Area for storage.");
      return;
    }
    if (draft.stage === "category") {
      const category = categories.find(
        (c) => c.toLowerCase() === value.toLowerCase(),
      );
      if (category) {
        advance(
          {
            asset: { ...draft.asset, category },
            stage: draft.mode === "edit" ? "options" : "ownership",
          },
          value,
        );
        return;
      }
      setError("Choose one of the equipment categories below.");
      return;
    }
    if (draft.stage === "movement-note") {
      advance({ movementNotes: value, stage: "review" }, value);
      return;
    }
    if (draft.stage === "review") {
      setError(
        "Use the confirmation button to save, or Change something to edit this draft.",
      );
      return;
    }
    if (draft.stage === "options") {
      const match = (Object.entries(fieldNames) as [EditField, string][]).find(
        ([key, name]) =>
          value.toLowerCase().includes(key) ||
          value.toLowerCase().includes(name.toLowerCase()),
      );
      if (match) {
        editField(match[0]);
        return;
      }
      setError(
        "Choose the detail you want to change, then type its value. Your draft is kept.",
      );
      return;
    }
    if (["welcome", "asset", "saved"].includes(draft.stage)) {
      void interpret(value);
      return;
    }
    setError(
      "Choose an option below to continue, or go back to change an answer.",
    );
  }
  function handoffScan(e: React.MouseEvent) {
    if (draft.pending || busy) {
      e.preventDefault();
      setError("Resolve the current operation before switching workflows.");
      return;
    }
    if (draft.mode === "create" && draft.stage !== "welcome") {
      try {
        sessionStorage.setItem(
          scanStorageKey,
          JSON.stringify({
            asset: draft.asset,
            step: 1,
            assignee: draft.assignee,
            unknownConfirmed: draft.unknownConfirmed,
            reviewedMatchIds: [],
            receipt: { payload: "", id: "" },
            draftId: draft.draftId,
          }),
        );
        sessionStorage.removeItem(assistantStorageKey);
      } catch {
        e.preventDefault();
        setError(
          "This browser could not pass the draft to Scan. Finish it here.",
        );
      }
    }
  }
  const matches = snapshot
    ? identityMatches(draft, snapshot.assets)
    : { exact: [], possible: [] };
  const results = snapshot ? searchAssets(snapshot.assets, draft.query) : [];
  const people = (snapshot?.people || []).filter(
    (p) =>
      !draft.query ||
      `${p.name} ${p.department}`
        .toLowerCase()
        .includes(draft.query.toLowerCase()),
  );
  const contextVisible =
    !!draft.selected || !!draft.asset.name || !!draft.asset.serial;
  const choosePerson = (name: string) =>
    advance(
      {
        assignee: name,
        asset: { ...draft.asset, location: "" },
        stage:
          draft.mode === "move"
            ? "movement-note"
            : draft.stage === "destination"
              ? "options"
              : "photo",
      },
      name,
    );
  const optionFields = (Object.keys(fieldNames) as EditField[]).filter(
    (k) => k !== "serial" || draft.mode === "edit",
  );
  const isBlocked = !!busy || !!draft.pending;
  function stageContent() {
    switch (draft.stage) {
      case "welcome":
        return (
          <>
            <Choice
              icon={<Plus />}
              onClick={() => go("capture", "Register a device")}
            >
              Register a device
            </Choice>
            <Choice
              icon={<Search />}
              onClick={() =>
                advance(
                  { stage: "search", query: "" },
                  "Find or update an asset",
                )
              }
            >
              Find or update an asset
            </Choice>
            <Choice
              icon={<ArrowLeftRight />}
              onClick={() =>
                advance({ stage: "search", query: "" }, "Move or reassign")
              }
            >
              Move or reassign
            </Choice>
            <Choice
              icon={<Tag />}
              onClick={() =>
                advance({ stage: "search", query: "" }, "Estimate resale value")
              }
            >
              Estimate resale value
            </Choice>
          </>
        );
      case "capture":
        return (
          <>
            <p className="it-hint">
              Read its serial, then check for an existing record.
            </p>
            <Choice
              primary
              icon={<Camera />}
              onClick={() => setCamera("label")}
            >
              Take label photo
            </Choice>
            <Choice icon={<ImagePlus />} onClick={() => uploadPhoto("label")}>
              Upload label photo
            </Choice>
            <Button variant="quiet" onClick={() => go("serial")}>
              Enter serial manually
            </Button>
            <p className="it-privacy">
              <ShieldCheck />
              Label photos are read, then discarded.
            </p>
          </>
        );
      case "serial":
        return (
          <>
            <p className="it-hint">
              Type the serial below, exactly as it appears on the device.
            </p>
            <Button variant="secondary" onClick={() => go("unknown")}>
              Serial unavailable
            </Button>
            <Button variant="quiet" onClick={() => go("capture")}>
              Read a label instead
            </Button>
          </>
        );
      case "confirm-serial":
        return (
          <>
            <div className="it-serial">
              <ScanLine />
              <strong>{draft.asset.serial}</strong>
              <span>Confirm serial</span>
            </div>
            <Choice primary onClick={() => void lookup()}>
              Yes, check inventory
            </Choice>
            <Choice onClick={() => go("serial")}>Correct serial</Choice>
            <Button variant="quiet" onClick={() => go("capture")}>
              Read label again
            </Button>
          </>
        );
      case "matches":
        return (
          <>
            <span
              className={`it-match ${matches.exact.length ? "exact" : "possible"}`}
            >
              {matches.exact.length
                ? "Exact serial match"
                : "Possible serial match"}
            </span>
            <p className="it-hint">
              {matches.exact.length
                ? "This device is already registered. Choose its existing record."
                : `A similar serial is already registered. Open it, or continue if this is a different device.`}
            </p>
            {[...matches.exact, ...matches.possible].map((a) => (
              <Choice key={a.id} onClick={() => chooseAsset(a)}>
                <ContextCard
                  asset={inputOf(a)}
                  assignee={a.assignee}
                  status={a.status}
                />
              </Choice>
            ))}
            <Choice onClick={() => go("capture")}>Read label again</Choice>
            {!matches.exact.length && draft.mode === "create" && (
              <Choice
                onClick={() => advance({
                  reviewedMatchIds: matches.possible.map((a) => a.id),
                  stage: "name",
                })}
              >
                Continue as a different device
              </Choice>
            )}
            {draft.mode === "edit" && (
              <p className="it-caution">
                Resolve this identity conflict on the existing record before
                changing its serial. No records will be merged.
              </p>
            )}
          </>
        );
      case "unknown":
        return (
          <>
            <p className="it-hint">
              Search by model, owner or equipment name below. Without a serial,
              we cannot conclusively rule out an existing record.
            </p>
            {draft.query &&
              results.slice(0, 6).map((a) => (
                <Choice key={a.id} onClick={() => chooseAsset(a)}>
                  <ContextCard asset={inputOf(a)} assignee={a.assignee} />
                </Choice>
              ))}
            {draft.query && !results.length && (
              <p>No matching equipment found.</p>
            )}
            <Choice
              disabled={!draft.query}
              onClick={() =>
                advance({
                  asset: { ...draft.asset, serial: "", serialChecked: false },
                  checkedSerial: "",
                  unknownConfirmed: true,
                  stage: draft.mode === "edit" ? "options" : "name",
                })
              }
            >
              Continue with unknown serial
            </Choice>
            <Button variant="quiet" onClick={() => go("serial")}>
              Enter a serial instead
            </Button>
          </>
        );
      case "name":
        return (
          <>
            <p className="it-hint">
              Required · Use a clear name, such as Dell Latitude 5440.
            </p>
            {draft.asset.name && (
              <Choice primary onClick={() => go("category", draft.asset.name)}>
                Use {draft.asset.name}
              </Choice>
            )}
            <p className="it-hint">Type the device name below.</p>
          </>
        );
      case "category":
        return (
          <div className="it-choice-grid">
            {categories.map((c) => (
              <Choice
                key={c}
                onClick={() =>
                  advance(
                    {
                      asset: { ...draft.asset, category: c },
                      stage: draft.mode === "edit" ? "options" : "ownership",
                    },
                    c,
                  )
                }
              >
                {c}
              </Choice>
            ))}
          </div>
        );
      case "ownership":
        return (
          <>
            <p className="it-hint">
              Required · Choose an owner or a storage location.
            </p>
            <Choice
              icon={<User />}
              onClick={() => advance({ stage: "employee", query: "" })}
            >
              Assign to someone
            </Choice>
            {(["Locker", "Engineering Area"] as const).map((l) => (
              <Choice
                key={l}
                icon={<Package />}
                onClick={() =>
                  advance(
                    {
                      assignee: "",
                      asset: { ...draft.asset, location: l },
                      stage: "photo",
                    },
                    l,
                  )
                }
              >
                Store in {l}
              </Choice>
            ))}
          </>
        );
      case "employee":
        return (
          <>
            <p className="it-hint">
              Choose a person from the directory, or type a name below to narrow
              the list.
            </p>
            {people.slice(0, 8).map((p, i) => (
              <Choice
                key={`${p.name}-${i}`}
                disabled={
                  matchingEmployees(snapshot!.people, p.name).length > 1
                }
                onClick={() => choosePerson(p.name)}
              >
                <span>
                  {p.name}
                  <small>{p.department}</small>
                </span>
              </Choice>
            ))}
            {people.length > 8 && (
              <p className="it-hint">
                {people.length} people found. Type a more specific name.
              </p>
            )}
            {!people.length && <p>No matching employee. Try another name.</p>}
            <p className="it-hint">
              Duplicate employee names need a directory correction before
              assignment.
            </p>
          </>
        );
      case "photo":
        return (
          <>
            <p className="it-hint">
              Optional · This becomes the inventory thumbnail. Label images are
              never used here.
            </p>
            {thumbnailPhoto(draft.asset) ? (
              <div className="it-photo">
                <img
                  src={thumbnailPhoto(draft.asset)!}
                  alt="Device thumbnail preview"
                />
                <small>Inventory thumbnail · Whole photo, no crop</small>
              </div>
            ) : (
              <div className="it-photo-guide">
                <Device asset={draft.asset} large />
                <strong>Show the whole device</strong>
                <small>
                  Use a plain surface, good light and keep every edge in view.
                </small>
                <span>Photo guide · Your actual photo will appear here</span>
              </div>
            )}
            <Choice
              primary
              icon={<Camera />}
              onClick={() => setCamera("device")}
            >
              {thumbnailPhoto(draft.asset)
                ? "Retake device photo"
                : "Take device photo"}
            </Choice>
            <Choice icon={<ImagePlus />} onClick={() => uploadPhoto("device")}>
              Upload device photo
            </Choice>
            {thumbnailPhoto(draft.asset) ? (
              <>
                <Choice onClick={() => go("options")}>
                  Use this device photo
                </Choice>
                <Button
                  variant="quiet"
                  onClick={() =>
                    updateAsset({ photos: [], coverPhotoIndex: null })
                  }
                >
                  Remove device photo
                </Button>
              </>
            ) : (
              <Button variant="quiet" onClick={() => go("options")}>
                Skip for now
              </Button>
            )}
          </>
        );
      case "options":
        return (
          <>
            <Choice primary icon={<ClipboardCheck />} onClick={review}>
              Review {draft.mode === "create" ? "registration" : "changes"}
            </Choice>
            <div className="it-choice-grid">
              {optionFields.map((f) => (
                <Choice key={f} onClick={() => editField(f)}>
                  {fieldNames[f]}
                </Choice>
              ))}
              <Choice onClick={() => go("condition")}>Condition</Choice>
              {draft.mode === "edit" && (
                <>
                  <Choice onClick={() => go("category")}>Category</Choice>
                  <Choice onClick={() => go("destination")}>
                    Storage location
                  </Choice>
                </>
              )}
              <Choice onClick={() => go("photo")}>Device photo</Choice>
            </div>
            {draft.mode === "create" && (
              <Button variant="quiet" onClick={() => go("ownership")}>
                Change owner or location
              </Button>
            )}
          </>
        );
      case "field":
        return (
          <>
            {draft.field === "specs" || draft.field === "accessories" ? (
              <EntryListEditor
                label={fieldNames[draft.field]}
                value={draft.asset[draft.field]}
                onChange={(value) =>
                  updateAsset({
                    [draft.field]: value,
                    ...(draft.field === "specs" ? { specsChecked: false } : {}),
                  })
                }
              />
            ) : (
              <label className="it-field">
                {fieldNames[draft.field]}
                <textarea
                  value={draft.asset[draft.field]}
                  rows={draft.field === "notes" ? 4 : 2}
                  maxLength={draft.field === "notes" ? 2000 : 400}
                  onChange={(e) =>
                    updateAsset({ [draft.field]: e.target.value })
                  }
                />
              </label>
            )}
            <Choice
              primary
              onClick={() =>
                draft.field === "serial"
                  ? serialContinue(draft.asset.serial)
                  : go("options")
              }
            >
              Use these details
            </Choice>
            <p className="it-hint">
              Changes remain in your draft until you review and confirm.
            </p>
          </>
        );
      case "condition":
        return (
          <>
            <p className="it-hint">
              Photos cannot verify battery health or working condition. Choose
              Unknown if you have not checked.
            </p>
            {conditions.map((c) => (
              <Choice
                key={c}
                onClick={() =>
                  advance(
                    {
                      asset: {
                        ...draft.asset,
                        condition: c,
                        conditionChecked: false,
                      },
                      stage: "options",
                    },
                    c,
                  )
                }
              >
                {c}
              </Choice>
            ))}
          </>
        );
      case "review":
        return (
          <>
            <Review draft={draft} />
            {draft.mode === "move" && (
              <p className="it-hint">
                Adds an event to the asset history.
                {draft.action === "Retire"
                  ? " Retirement cannot be undone in this app."
                  : ""}
              </p>
            )}
            <Choice
              primary
              disabled={!canWrite || conflict}
              onClick={() => void save()}
            >
              {draft.pending
                ? "Check save result"
                : draft.mode === "create"
                  ? "Confirm registration"
                  : draft.mode === "move"
                    ? draft.action === "Transfer"
                      ? "Confirm reassignment"
                      : `Confirm ${draft.action.toLowerCase()}`
                    : "Confirm changes"}
            </Choice>
            {!draft.pending && (
              <Choice
                onClick={() =>
                  go(draft.mode === "move" ? "movement" : "options")
                }
              >
                Change something
              </Choice>
            )}
            <p className="it-privacy">
              <ShieldCheck />
              {draft.pending
                ? "Retry checks the same operation. It will not create a second save."
                : "Nothing is saved until you confirm."}
            </p>
          </>
        );
      case "search":
        return (
          <>
            <p className="it-hint">
              Search by serial, model, owner or location below.
            </p>
            {draft.query && (
              <p className="it-hint">
                {results.length} matching{" "}
                {results.length === 1 ? "asset" : "assets"} · Choose one to
                continue
              </p>
            )}
            {results.slice(0, 8).map((a) => (
              <Choice key={a.id} onClick={() => chooseAsset(a)}>
                <ContextCard
                  asset={inputOf(a)}
                  assignee={a.assignee}
                  status={a.status}
                />
              </Choice>
            ))}
            {!results.length && (
              <p>No matching assets. Try another name or serial.</p>
            )}
            {results.length > 8 && (
              <p className="it-hint">
                Type a more specific search to narrow these results.
              </p>
            )}
          </>
        );
      case "asset":
        return (
          <>
            {draft.selected && (
              <Link
                className="it-choice"
                href={`/assets/${encodeURIComponent(draft.selected.id)}`}
              >
                Open asset
                <ChevronRight />
              </Link>
            )}
            <Choice onClick={() => advance({ mode: "edit", stage: "options" })}>
              Update details
            </Choice>
            <Choice
              disabled={draft.selected?.status === "Retired"}
              onClick={() => advance({ mode: "move", stage: "movement" })}
            >
              Reassign owner or move
            </Choice>
            <Choice onClick={() => go("resale")}>Estimate resale value</Choice>
          </>
        );
      case "movement":
        return (
          <>
            <Choice
              icon={<User />}
              onClick={() =>
                advance({
                  mode: "move",
                  action: draft.selected?.assignee ? "Transfer" : "Assign",
                  stage: "employee",
                  query: "",
                })
              }
            >
              Find an employee
            </Choice>
            {draft.selected?.assignee &&
              (["Locker", "Engineering Area"] as const).map((l) => (
                <Choice
                  key={l}
                  onClick={() =>
                    advance(
                      {
                        mode: "move",
                        action: "Return",
                        assignee: "",
                        asset: { ...draft.asset, location: l },
                        stage: "movement-note",
                      },
                      `Return to ${l}`,
                    )
                  }
                >
                  Return to {l}
                </Choice>
              ))}
            {!draft.selected?.assignee && (
              <Choice
                onClick={() => advance({ mode: "edit", stage: "destination" })}
              >
                Change storage location
              </Choice>
            )}
            <Choice
              onClick={() =>
                advance({
                  mode: "move",
                  action: "Repair",
                  assignee: "",
                  stage: "destination",
                })
              }
            >
              Send for repair
            </Choice>
            <Choice
              onClick={() =>
                advance({
                  mode: "move",
                  action: "Retire",
                  assignee: "",
                  stage: "destination",
                })
              }
            >
              Retire asset
            </Choice>
          </>
        );
      case "destination":
        return (
          <>
            {(["Locker", "Engineering Area"] as const).map((l) => (
              <Choice
                key={l}
                onClick={() =>
                  advance(
                    {
                      assignee: draft.mode === "edit" ? draft.assignee : "",
                      asset: { ...draft.asset, location: l },
                      stage:
                        draft.mode === "move" ? "movement-note" : "options",
                    },
                    l,
                  )
                }
              >
                {l}
              </Choice>
            ))}
            {draft.mode === "edit" && draft.assignee && (
              <Choice
                onClick={() =>
                  advance(
                    {
                      asset: { ...draft.asset, location: "" },
                      stage: "options",
                    },
                    "With assignee",
                  )
                }
              >
                With assignee (no storage location)
              </Choice>
            )}
          </>
        );
      case "movement-note":
        return (
          <>
            <p className="it-hint">
              Optional · Type a handover note, or continue without one.
            </p>
            <Choice primary onClick={() => go("review")}>
              Review movement
            </Choice>
          </>
        );
      case "resale":
        return (
          <>
            {evidence && (
              <section
                className="it-estimate"
                aria-label="Indicative resale scenarios"
              >
                <span className="it-draft-label">
                  <Tag />
                  Indicative · AED
                </span>
                <p>{resaleNotice}</p>
                {resaleScenarios(evidence).map((s) => (
                  <div className="it-price" key={s.label}>
                    <span>{s.label}</span>
                    <strong>
                      AED {s.low.toLocaleString()}–{s.high.toLocaleString()}
                    </strong>
                  </div>
                ))}
                {!resaleScenarios(evidence).length && (
                  <p>No responsible estimate is available for this identity.</p>
                )}
                <details>
                  <summary>Assumptions and market sources</summary>
                  {resaleScenarios(evidence).map((s) => (
                    <p key={s.label}>
                      <strong>{s.label}:</strong> {s.assumptions}
                    </p>
                  ))}
                  {evidence.indicative && (
                    <>
                      <p>{evidence.indicative.reasoning}</p>
                      <p>
                        Estimated {date(evidence.indicative.estimatedAt)} · Low
                        confidence
                      </p>
                      {evidence.indicative.assumptions.map((a, i) => (
                        <p key={i}>{a}</p>
                      ))}
                    </>
                  )}
                  {evidence.comparables.length ? (
                    evidence.comparables.map((c) => (
                      <p key={c.url}>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {c.title}
                        </a>{" "}
                        · {c.currency} {c.price} · Checked {date(c.checkedAt)}
                      </p>
                    ))
                  ) : (
                    <p>No verified market sources.</p>
                  )}
                  {evidence.limitations.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </details>
                <p className="it-hint">
                  Separate from purchase cost. Actual function and battery still
                  need inspection. Fair and faulty scenarios use approximate
                  planning adjustments.
                </p>
                {resaleScenarios(evidence).length > 0 && (
                  <Choice onClick={saveEstimate}>
                    Review saving estimate to notes
                  </Choice>
                )}
              </section>
            )}
            <Choice primary onClick={() => void research("estimate")}>
              Quick indicative estimate
            </Choice>
            <Choice onClick={() => void research("research")}>
              Research current UAE listings
            </Choice>
            <p className="it-hint">
              The serial identifies this inventory record. Brand, model and
              recorded specifications inform the estimate.
            </p>
          </>
        );
      case "saved":
        return (
          <>
            <div className="it-success">
              <Check />
              <strong>Confirmed by inventory</strong>
              <p>
                Your change is saved to{" "}
                {source?.kind === "demo" ? "the local demo" : "inventory"}.
              </p>
            </div>
            {draft.selected && (
              <Link
                className="it-choice"
                href={`/assets/${encodeURIComponent(draft.selected.id)}`}
              >
                Open asset
                <ChevronRight />
              </Link>
            )}
            <Choice onClick={() => go("resale")}>Estimate resale value</Choice>
            <Choice onClick={begin}>Help with another asset</Choice>
          </>
        );
    }
  }
  if (loadError && !snapshot)
    return (
      <div className="page">
        <Notice warning>{loadError}</Notice>
        <Button onClick={() => void reload()}>Retry inventory</Button>
      </div>
    );
  if ((loading && !snapshot) || !ready)
    return (
      <div className="page">
        <Notice>Loading Ask IT and inventory…</Notice>
      </div>
    );
  return (
    <div className="it-page">
      <div className="it-topline">
        <Link href="/">
          <ArrowLeft />
          Inventory
        </Link>
        <span className="it-preview-badge">
          {source?.kind === "demo"
            ? "Fictional local preview"
            : "AI inventory assistant"}
        </span>
      </div>
      <div className="it-workspace">
        <section className="it-conversation" aria-label="Ask IT conversation">
          <header
            className={`it-header ${draft.stage !== "welcome" ? "is-compact" : ""}`}
          >
            <div>
              <span className="it-mark">
                <MessageCircle />
              </span>
              <h1>Ask IT</h1>
              <p>Equipment help, one step at a time.</p>
            </div>
            <Button
              variant="quiet"
              aria-label="Clear conversation"
              disabled={!!draft.pending || !!busy}
              onClick={() => setClearing(true)}
            >
              <Trash2 />
            </Button>
          </header>
          <div className="it-message-stream" ref={stream}>
            {clearing && (
              <Notice>
                Discard this conversation’s unsaved draft?
                <Button onClick={begin}>Discard draft</Button>
                <Button variant="quiet" onClick={() => setClearing(false)}>
                  Keep working
                </Button>
              </Notice>
            )}
            {draft.transcript.length > 0 && (
              <details className="it-history">
                <summary>Earlier answers · {draft.transcript.length}</summary>
                {draft.transcript.map((m, i) => (
                  <div key={i}>
                    <p>{m.question}</p>
                    <p className="it-user-answer">{m.answer}</p>
                  </div>
                ))}
              </details>
            )}
            {contextVisible && draft.stage !== "review" && (
              <div className="it-mobile-context">
                <ContextCard
                  asset={draft.asset}
                  assignee={draft.assignee}
                  status={draft.selected?.status}
                />
              </div>
            )}
            <div className="it-current" aria-live="polite" aria-busy={!!busy}>
              <h2 ref={heading} tabIndex={-1} className="it-bubble">
                {busy || prompt}
              </h2>
              {busy ? (
                <div className="it-working">
                  <LoaderCircle className="it-spinner" />
                  <p>
                    {busy.includes("label")
                      ? "Reading identity only. The label photo will not be saved."
                      : "Please wait for a confirmed result."}
                  </p>
                  {!draft.pending && (
                    <Button variant="secondary" onClick={cancel}>
                      Cancel
                    </Button>
                  )}
                </div>
              ) : (
                <div className="it-options">{stageContent()}</div>
              )}
            </div>
            {notice && <Notice>{notice}</Notice>}
            {error && (
              <Notice warning>
                {error}
                {conflict && (
                  <Button
                    variant="secondary"
                    onClick={() => void refreshConflict()}
                  >
                    Reload latest and review
                  </Button>
                )}
              </Notice>
            )}
            {attachment && !isBlocked && (
              <div className="it-attachment-menu">
                <strong>What is this photo for?</strong>
                <Choice
                  onClick={() => {
                    setAttachment(false);
                    setCamera("label");
                  }}
                >
                  Read a label (temporary)
                </Choice>
                <Choice
                  disabled={
                    draft.stage === "welcome" ||
                    draft.stage === "search" ||
                    !contextVisible
                  }
                  onClick={() => {
                    setAttachment(false);
                    setCamera("device");
                  }}
                >
                  Device thumbnail (saved after review)
                </Choice>
              </div>
            )}
          </div>
          <form className="it-composer" onSubmit={typed}>
            <Button
              variant="quiet"
              type="button"
              aria-label="Attach a photo"
              disabled={isBlocked}
              onClick={() => setAttachment(!attachment)}
            >
              {attachment ? <X /> : <Camera />}
            </Button>
            <input
              ref={composer}
              aria-label="Type your reply"
              placeholder={
                draft.stage === "serial"
                  ? "Type the serial number"
                  : draft.stage === "name"
                    ? "Type the device name"
                    : "Choose a reply, or type your own"
              }
              maxLength={
                draft.stage === "movement-note" ||
                (draft.stage === "field" && draft.field === "notes")
                  ? 2000
                  : 400
              }
              value={text}
              disabled={isBlocked}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              type="submit"
              aria-label="Send reply"
              disabled={isBlocked || !text.trim()}
            >
              <ArrowUp />
            </Button>
          </form>
          <div className="it-conversation-footer">
            {!["welcome", "review", "asset", "options", "saved"].includes(
              draft.stage,
            ) &&
              !isBlocked && (
                <Button
                  variant="quiet"
                  onClick={() => go(draft.selected ? "asset" : "options")}
                >
                  Change an answer
                </Button>
              )}
            <Link
              href={
                draft.mode === "create" && contextVisible
                  ? "/scan?manual=1"
                  : "/scan"
              }
              onClick={handoffScan}
            >
              {draft.mode === "create" && contextVisible
                ? "Continue in Scan"
                : "Use Scan instead"}
            </Link>
            <small>
              AI suggestions need your review · Unfinished drafts expire after
              12 hours; unresolved saves are kept
            </small>
          </div>
        </section>
        <aside className="it-sidebar">
          <span className="it-sidebar-label">YOUR WORKSPACE</span>
          {contextVisible ? (
            <>
              <ContextCard
                asset={draft.asset}
                assignee={draft.assignee}
                status={draft.selected?.status}
              />
              <dl>
                <div>
                  <dt>Specifications</dt>
                  <dd>
                    <EntryListDisplay
                      value={draft.asset.specs}
                      emptyLabel="Not provided"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Accessories</dt>
                  <dd>
                    <EntryListDisplay
                      value={draft.asset.accessories}
                      emptyLabel="Not checked"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{draft.asset.condition}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <div className="it-sidebar-icon">
                <MessageCircle />
              </div>
              <h2>A little help with your equipment.</h2>
              <p>
                Register a device, find what’s already here, or review an
                update—all in one conversation.
              </p>
            </>
          )}
          <div className="it-sidebar-note">
            <ShieldCheck />
            <p>Clear choices. Human review. Every save confirmed.</p>
          </div>
          <Link href="/scan" onClick={handoffScan}>
            <ScanLine />
            Scan is always available
          </Link>
        </aside>
      </div>
      <input
        hidden
        ref={upload}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload Ask IT photo"
        onChange={(e) => void fileSelected(e.target.files?.[0])}
      />
      <input
        hidden
        ref={native}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Capture Ask IT photo"
        onChange={(e) => void fileSelected(e.target.files?.[0])}
      />
      {camera && (
        <CameraCapture
          purpose={camera}
          onCaptured={(data) => void captured(data, camera)}
          onCancel={() => setCamera(null)}
          onUpload={() => {
            const purpose = camera;
            setCamera(null);
            uploadPhoto(purpose);
          }}
          onNativeCapture={() => {
            photoPurpose.current = camera;
            setCamera(null);
            native.current?.click();
          }}
        />
      )}
    </div>
  );
}
