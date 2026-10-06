"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  ArrowLeftRight,
  User,
  MapPin,
  Wallet,
  RefreshCw,
  Check,
} from "lucide-react";
import {
  AssetInput,
  editAssetInput,
  display,
  inputOf,
  hasValidStorageLocation,
  locationLabel,
  thumbnailPhoto,
} from "@/lib/model";
import { ApiError, request } from "@/lib/client";
import { useInventory } from "./use-inventory";
import { Button, Badge, Notice, Timeline, Dialog, date } from "./ui";
import { DevicePhoto } from "./device-photo";
import { AssetPortrait, AssetSummary } from "./asset-visual";
import { LabelRescan } from "./label-rescan";
import { AssetFields } from "./asset-fields";
import { MoveDialog } from "./move-dialog";
import { AssetNotes } from "./asset-notes";
import { useSource } from "./source-context";
import type { ResaleEvidence } from "@/lib/server/integrations";
import { resaleScenarios } from "@/lib/resale";
export function Detail({ id }: { id: string }) {
  const router = useRouter();
  const { source, canWrite } = useSource();
  const [researchEvidence, setEvidence] = useState<ResaleEvidence | null>(null);
  const [evidenceIdentity, setEvidenceIdentity] = useState("");
  const { snapshot, error, loading, reload, setSnapshot } = useInventory();
  const asset = snapshot?.assets.find((a) => a.id === id);
  const consolidatedId = snapshot?.aliases?.[id];
  useEffect(() => {
    if (consolidatedId)
      router.replace(`/assets/${encodeURIComponent(consolidatedId)}`);
  }, [consolidatedId, router]);
  const identityKey = JSON.stringify([
    id,
    asset?.brand,
    asset?.model,
    asset?.specs,
  ]);
  const evidence = evidenceIdentity === identityKey ? researchEvidence : null;
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<AssetInput | null>(null),
    [move, setMove] = useState(false),
    [saving, setSaving] = useState(false),
    [preparingPhoto, setPreparingPhoto] = useState(false),
    [readingLabel, setReadingLabel] = useState(false),
    [reviewingEdit, setReviewingEdit] = useState(false),
    [saveError, setSaveError] = useState(""),
    [duplicate, setDuplicate] = useState(""),
    [resaleError, setResaleError] = useState(""),
    [researching, setResearching] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const receipt = useRef({ payload: "", id: "" });
  const submitting = useRef(false);
  const [baseline, setBaseline] = useState<AssetInput | null>(null);
  const editVersion = useRef(0);
  useEffect(() => {
    // Read the local confirmation marker only after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmed(
      new URLSearchParams(window.location.search).get("saved") === "1",
    );
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      !asset ||
      !draft ||
      submitting.current ||
      preparingPhoto ||
      readingLabel
    )
      return;
    if (
      !hasValidStorageLocation({
        location: draft.location,
        assignee: asset.assignee,
      })
    ) {
      setSaveError(
        "Choose Engineering Area or Locker when the asset is unassigned.",
      );
      return;
    }
    const parsed = editAssetInput.safeParse(draft);
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0].message);
      return;
    }
    if (!reviewingEdit) {
      setSaveError("");
      setReviewingEdit(true);
      return;
    }
    submitting.current = true;
    const value = { asset: parsed.data, expectedVersion: editVersion.current },
      payload = JSON.stringify(value);
    if (receipt.current.payload !== payload)
      receipt.current = { payload, id: crypto.randomUUID() };
    setSaving(true);
    setSaveError("");
    setDuplicate("");
    try {
      await request(`/api/assets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...value, requestId: receipt.current.id }),
      });
      setEditing(false);
      setConfirmed(true);
      await reload();
    } catch (e) {
      setSaveError((e as Error).message);
      if (e instanceof ApiError && [400, 409].includes(e.status || 0))
        setReviewingEdit(false);
      if (e instanceof ApiError && e.assetId) setDuplicate(e.assetId);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  async function research() {
    if (researching) return;
    setResearching(true);
    setResaleError("");
    setEvidenceIdentity(identityKey);
    try {
      setEvidence(
        await request<ResaleEvidence>("/api/resale", {
          method: "POST",
          body: JSON.stringify({ assetId: id }),
        }),
      );
    } catch (e) {
      setResaleError((e as Error).message);
    } finally {
      setResearching(false);
    }
  }
  if (error)
    return (
      <div className="page">
        <Notice warning>{error}</Notice>
        <Button onClick={reload}>Retry</Button>
      </div>
    );
  if (loading || consolidatedId)
    return (
      <div className="loading" role="status">
        Loading asset…
      </div>
    );
  if (!asset)
    return (
      <div className="page">
        <h1>Asset not found</h1>
        <Link href="/">Back to inventory</Link>
      </div>
    );
  const events = snapshot!.history.filter(
    (e) => e.assetId === id || asset.mergedFromIds?.includes(e.assetId),
  );
  return (
    <div className="page detail-page">
      <Link href="/" className="back-link">
        <ArrowLeft />
        Inventory <span>/ {asset.id}</span>
      </Link>
      {source?.readOnly && (
        <Notice>
          Real Sheet record · Read only. Existing ID, costs, currency and legacy
          history are preserved. Missing location, battery health and function
          remain Unknown.
        </Notice>
      )}
      {confirmed && canWrite && (
        <div className="confirmed-banner" role="status">
          <Check />
          {source?.kind === "demo"
            ? "Saved in the local demo inventory"
            : "Saved to Google Sheets"}
        </div>
      )}
      <div className="asset-overview card">
        <AssetPortrait asset={asset} />
        <div className="overview-body">
          <div className="page-heading">
            <div>
              <h1>{asset.name}</h1>
              <div className="detail-subtitle">
                <span className="serial">
                  {asset.serial || "Unknown serial"}
                </span>
                <Badge status={asset.status} />
              </div>
            </div>
            <div className="heading-actions">
              <Button
                variant="secondary"
                disabled={!canWrite}
                onClick={() => {
                  setDraft(inputOf(asset));
                  setBaseline(inputOf(asset));
                  editVersion.current = asset.version;
                  setReviewingEdit(false);
                  setEditing(true);
                  setSaveError("");
                }}
              >
                <Pencil />
                Edit details
              </Button>
            </div>
          </div>
          <div className="overview-ownership">
            <div>
              <User />
              <span>
                Assigned to<strong>{asset.assignee || "Unassigned"}</strong>
              </span>
            </div>
            <div>
              <MapPin />
              <span>
                Location<strong>{locationLabel(asset)}</strong>
              </span>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!canWrite || asset.status === "Retired"}
            onClick={() => setMove(true)}
          >
            <ArrowLeftRight />
            {asset.assignee ? "Reassign owner" : "Assign owner"}
          </Button>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <section className="card details-card">
            <h2>Asset details</h2>
            <div className="identity-layout">
              <dl>
                {[
                  ["Category", asset.category],
                  ["Brand", display(asset.brand)],
                  ["Model", display(asset.model)],
                  ["Specifications", display(asset.specs)],
                  ["Condition", asset.condition],
                  ["Accessories", asset.accessories || "Not checked"],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="purchase-line">
              <Wallet />
              <span>Purchase cost</span>
              <strong>
                {asset.purchaseCost
                  ? `${asset.purchaseCurrency || "Unknown currency"} ${Number.isFinite(Number(asset.purchaseCost)) ? Number(asset.purchaseCost).toLocaleString("en-GB") : asset.purchaseCost}`
                  : "Unknown"}
              </strong>
              {asset.purchaseDate && (
                <span>Purchased {date(asset.purchaseDate)}</span>
              )}
            </div>
            <p className="muted-text">
              Battery health and working condition: Unknown
            </p>
          </section>
          <section className="card movement-card">
            <div className="movement-heading">
              <h2>Assignment & movement</h2>{" "}
              <Button
                variant="quiet"
                disabled={!canWrite || asset.status === "Retired"}
                onClick={() => setMove(true)}
              >
                <ArrowLeftRight />
                Move or assign
              </Button>
            </div>
            <Timeline events={events} />
          </section>
        </div>
        <aside className="card resale-card">
          <p className="eyebrow">SEPARATE FROM PURCHASE COST</p>
          <h2>Indicative resale value</h2>
          <div className="resale-value">
            {evidence?.rangeAED
              ? `AED ${evidence.rangeAED.low.toLocaleString("en-GB")}–${evidence.rangeAED.high.toLocaleString("en-GB")}`
              : evidence?.indicative
                ? `AED ${evidence.indicative.goodWorkingAED.low.toLocaleString("en-GB")}–${evidence.indicative.goodWorkingAED.high.toLocaleString("en-GB")}`
                : evidence
                  ? "No verified comparable"
                  : "Not researched"}
          </div>
          <p className="muted-text">
            {evidence?.indicative
              ? "Low-confidence model estimate for good working condition. No matching current listing price was verified."
              : "Listing asking range above; indicative condition scenarios below. Actual battery health and function still need inspection."}
          </p>
          {evidence && resaleScenarios(evidence).length > 0 && (
            <section
              className="resale-scenarios"
              aria-label="Indicative condition scenarios"
            >
              <h3>Best-guess condition scenarios</h3>
              <p className="muted-text">
                {evidence.indicative
                  ? "Based on a model estimate, not current verified comparables."
                  : "Planning estimates adjusted from the sourced asking range, not additional listing prices."}
              </p>
              {resaleScenarios(evidence).map((scenario) => (
                <div className="resale-scenario" key={scenario.label}>
                  <h4>{scenario.label}</h4>
                  <strong>
                    AED {scenario.low.toLocaleString("en-GB")}–
                    {scenario.high.toLocaleString("en-GB")}
                  </strong>
                  <p>{scenario.assumptions}</p>
                </div>
              ))}
              <small>
                {evidence.indicative
                  ? "Fair: roughly 50–75% of the good-condition estimate; faulty/parts: 10–30%."
                  : "Rough planning factors against listings: good 80–100%, fair 50–75%, faulty/parts 10–30%."}{" "}
                These adjustments are assumptions, not a valuation or proof of
                this asset’s condition.
              </small>
              {evidence.indicative && (
                <>
                  <p>{evidence.indicative.reasoning}</p>
                  {evidence.indicative.assumptions.map((assumption, i) => (
                    <small key={i}>{assumption}</small>
                  ))}
                  <small>
                    Estimated {date(evidence.indicative.estimatedAt)} · Low
                    confidence
                  </small>
                </>
              )}
            </section>
          )}
          {!evidence && (
            <div className="resale-empty">
              <RefreshCw />
              <h3>No market sources yet</h3>
              <p>
                {(source?.resaleEnabled ?? source?.aiEnabled)
                  ? "Research this asset’s brand/model for UAE asking prices and indicative condition scenarios."
                  : "Resale research is currently disabled. Photo OCR is configured separately."}
              </p>
            </div>
          )}
          {evidence && (
            <div className="market-evidence">
              <h3>Verified listing evidence</h3>
              <p>
                Checked{" "}
                {evidence.asOf ? date(evidence.asOf) : "No usable dated source"}
              </p>
              {evidence.comparables.map((c) => (
                <p key={c.url}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.title}
                  </a>
                  <br />
                  {c.currency} {c.price.toLocaleString("en-GB")} · {c.region} ·{" "}
                  {c.condition} · Checked {date(c.checkedAt)}
                </p>
              ))}
              {evidence.limitations.map((limitation, i) => (
                <small key={i}>{limitation}</small>
              ))}
            </div>
          )}
          <Notice warning>
            Inspect battery health and working condition before resale.
          </Notice>
          <Button
            variant="secondary"
            onClick={research}
            disabled={
              researching || !(source?.resaleEnabled ?? source?.aiEnabled)
            }
          >
            <RefreshCw />
            {researching
              ? "Researching current listings…"
              : "Research resale value"}
          </Button>
          {resaleError && <Notice warning>{resaleError}</Notice>}
          <small>
            Brand and model are checked against source listings. The serial
            checks existing inventory identity; it does not prove
            specifications, battery health or function. Indicative estimates are
            separate from purchase cost and verified listing prices.
          </small>
        </aside>
      </div>
      <AssetNotes
        key={id}
        asset={asset}
        canWrite={canWrite}
        onUpdated={(saved) => {
          setSnapshot(
            (current) =>
              current && {
                ...current,
                assets: current.assets.map((item) =>
                  item.id === saved.id ? saved : item,
                ),
              },
          );
        }}
      />
      <MoveDialog
        key={`${id}-${asset.version}`}
        asset={asset}
        people={snapshot!.people}
        open={move}
        onClose={() => setMove(false)}
        onSaved={() => {
          setConfirmed(true);
          void reload();
        }}
        onReload={() => {
          setMove(false);
          void reload();
        }}
      />
      <Dialog
        title={reviewingEdit ? "Review changes" : "Edit asset"}
        open={editing}
        onClose={() => {
          if (!saving) setEditing(false);
        }}
      >
        {draft && (
          <form
            key={editing ? "editing" : "closed"}
            onSubmit={save}
            className={`asset-edit-form ${readingLabel ? "is-reading-label" : ""}`}
          >
            <AssetSummary asset={asset} />
            {reviewingEdit ? (
              <div className="edit-review">
                <h3>Changes to be saved</h3>
                {(
                  [
                    ["name", "Asset name"],
                    ["category", "Category"],
                    ["brand", "Brand"],
                    ["model", "Model"],
                    ["serial", "Serial number"],
                    ["specs", "Specifications"],
                    ["condition", "Condition"],
                    ["accessories", "Accessories"],
                    ["location", "Storage location"],
                    ["purchaseCost", "Purchase cost"],
                    ["purchaseCurrency", "Currency"],
                    ["purchaseDate", "Purchase date"],
                    ["notes", "Notes"],
                    ["serialChecked", "Serial checked"],
                    ["specsChecked", "Specifications verified"],
                    ["conditionChecked", "Condition inspected"],
                  ] as const
                )
                  .filter(([key]) => baseline?.[key] !== draft[key])
                  .map(([key, label]) => (
                    <div className="change-row" key={key}>
                      <h4>{label}</h4>
                      <div>
                        <span>
                          <small>Current value</small>
                          {typeof baseline?.[key] === "boolean"
                            ? baseline[key]
                              ? "Yes"
                              : "No"
                            : String(baseline?.[key] || "Unknown")}
                        </span>
                        <ArrowLeftRight />
                        <strong>
                          <small>New value</small>
                          {typeof draft[key] === "boolean"
                            ? draft[key]
                              ? "Yes"
                              : "No"
                            : String(draft[key] || "Unknown")}
                        </strong>
                      </div>
                    </div>
                  ))}
                {thumbnailPhoto(asset) !== thumbnailPhoto(draft) && (
                  <section>
                    <h3>
                      {thumbnailPhoto(draft)
                        ? "New device photo"
                        : "Device photo removed"}
                    </h3>
                    <AssetPortrait asset={draft} />
                  </section>
                )}
                {JSON.stringify(baseline) === JSON.stringify(draft) && (
                  <p>No details have changed.</p>
                )}
                <div className="record-kept">
                  <Check />
                  <div>
                    <strong>Updating {asset.id}</strong>
                    <p>Your existing record and history stay together.</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <LabelRescan
                  enabled={Boolean(source?.ocrEnabled ?? source?.aiEnabled)}
                  onBusy={setReadingLabel}
                  onSerial={(serial) =>
                    setDraft((current) =>
                      current
                        ? { ...current, serial, serialChecked: false }
                        : current,
                    )
                  }
                />
                <h3 className="form-section-title">Device details</h3>
                <AssetFields
                  compact
                  photoControls={
                    <DevicePhoto
                      asset={draft}
                      setAsset={(next) =>
                        setDraft((current) =>
                          current
                            ? typeof next === "function"
                              ? next(current)
                              : next
                            : null,
                        )
                      }
                      onBusy={setPreparingPhoto}
                    />
                  }
                  asset={draft}
                  setAsset={setDraft}
                  assigned={Boolean(asset.assignee.trim())}
                />
                <section className="edit-assignment">
                  <strong>Owner: {asset.assignee || "Unassigned"}</strong>
                  <p>
                    Reassignment is a separate action recorded in movement
                    history.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      saving ||
                      readingLabel ||
                      preparingPhoto ||
                      asset.status === "Retired"
                    }
                    onClick={() => {
                      if (JSON.stringify(baseline) !== JSON.stringify(draft)) {
                        setSaveError(
                          "Save or cancel your detail edits before reassigning the owner.",
                        );
                        return;
                      }
                      setEditing(false);
                      setMove(true);
                    }}
                  >
                    {asset.assignee ? "Reassign owner" : "Assign owner"}
                  </Button>
                </section>
              </>
            )}
            {saveError && (
              <Notice warning>
                {saveError}
                {duplicate && duplicate !== id && (
                  <Link href={`/assets/${encodeURIComponent(duplicate)}`}>
                    Open matching asset
                  </Link>
                )}
                {duplicate === id && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      setEditing(false);
                      void reload();
                    }}
                  >
                    Reload latest asset
                  </Button>
                )}
              </Notice>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  reviewingEdit ? setReviewingEdit(false) : setEditing(false)
                }
              >
                {reviewingEdit ? "Back to edit" : "Cancel"}
              </Button>
              <Button
                disabled={
                  saving ||
                  preparingPhoto ||
                  readingLabel ||
                  (reviewingEdit &&
                    JSON.stringify(baseline) === JSON.stringify(draft))
                }
              >
                {saving
                  ? "Saving changes…"
                  : reviewingEdit
                    ? "Save changes"
                    : "Review changes"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
