"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  ArrowLeft,
  ScanLine,
  Sun,
  Check,
  Trash2,
  FileText,
} from "lucide-react";
import {
  Asset,
  AssetInput,
  assetInput,
  blankAsset,
  display,
  findBySerial,
} from "@/lib/model";
import {
  ApiError,
  compressPhoto,
  fetchSnapshot,
  saveAsset,
} from "@/lib/client";
import { Button, Notice, Device } from "./ui";
import { AssetFields } from "./asset-fields";
const draftKey = "hcassets.demo.registration.v2";
export function Scan({ manual = false }: { manual?: boolean }) {
  const router = useRouter();
  const [asset, setAsset] = useState<AssetInput>(blankAsset),
    [step, setStep] = useState(manual ? 1 : 0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [duplicate, setDuplicate] = useState(""),
    [matches, setMatches] = useState<Asset[]>([]),
    [preparing, setPreparing] = useState(false),
    [saving, setSaving] = useState(false),
    [checking, setChecking] = useState(false),
    [unknownConfirmed, setUnknownConfirmed] = useState(false),
    [draftWarning, setDraftWarning] = useState("");
  const photoInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null),
    operation = useRef(0),
    receipt = useRef({ payload: "", id: "" });
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.asset && typeof draft.step === "number") {
          // Restore an interrupted browser session after hydration; never copy live data.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setAsset({ ...blankAsset(), ...draft.asset });
          setStep(draft.step);
          setUnknownConfirmed(!!draft.unknownConfirmed);
          receipt.current = draft.receipt || { payload: "", id: "" };
        }
      }
    } catch {
      setDraftWarning(
        "Your previous draft could not be restored. Start a fresh registration.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          asset,
          step,
          unknownConfirmed,
          receipt: receipt.current,
        }),
      );
    } catch {
      // Storage can fail in restricted browser sessions; expose that failure.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftWarning(
        "This browser could not preserve the draft on refresh. Keep this page open until you save.",
      );
    }
  }, [asset, step, ready, unknownConfirmed]);
  useEffect(() => {
    if (!preparing && !saving && !checking) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [preparing, saving, checking]);
  async function photos(files: FileList | null) {
    if (!files?.length) return;
    const token = ++operation.current;
    setPreparing(true);
    setError("");
    try {
      if (files.length + asset.photos.length > 3)
        throw new Error(
          "Keep up to three photos: label, device and accessories.",
        );
      const data = await Promise.all(Array.from(files).map(compressPhoto));
      if (token !== operation.current) return;
      setAsset((a) => ({ ...a, photos: [...a.photos, ...data] }));
      setStep(1);
    } catch (e) {
      if (token === operation.current) setError((e as Error).message);
    } finally {
      if (token === operation.current) setPreparing(false);
      if (photoInput.current) photoInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }
  function cancelPhoto() {
    operation.current++;
    setPreparing(false);
    setError("");
  }
  async function continueReview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDuplicate("");
    setMatches([]);
    if (asset.serial && !asset.serialChecked) {
      setError(
        "Check the serial against the device label before finding an asset.",
      );
      return;
    }
    if (!asset.serial && !unknownConfirmed) {
      setError(
        "Confirm the serial is unknown, or enter and check it from the label.",
      );
      return;
    }
    setChecking(true);
    try {
      const snapshot = await fetchSnapshot();
      const found = findBySerial(snapshot.assets, asset.serial);
      if (found.length === 1) {
        sessionStorage.removeItem(draftKey);
        router.push(`/assets/${encodeURIComponent(found[0].id)}`);
        return;
      }
      if (found.length > 1) {
        setMatches(found);
        setError(
          "Multiple existing records have this serial. Choose a record to inspect; no records were merged.",
        );
        return;
      }
      const parsed = assetInput.safeParse(asset);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  async function save() {
    setError("");
    setDuplicate("");
    const payload = JSON.stringify(asset);
    if (receipt.current.payload !== payload)
      receipt.current = { payload, id: crypto.randomUUID() };
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          asset,
          step,
          unknownConfirmed,
          receipt: receipt.current,
        }),
      );
    } catch {
      /* in-page receipt still protects retry */
    }
    setSaving(true);
    try {
      const { asset: saved } = await saveAsset(asset, receipt.current.id);
      sessionStorage.removeItem(draftKey);
      router.push(`/assets/${encodeURIComponent(saved.id)}?saved=1`);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.assetId) setDuplicate(e.assetId);
    } finally {
      setSaving(false);
    }
  }
  function sample(existing: boolean) {
    setAsset({
      ...blankAsset(),
      name: "MacBook Pro 14",
      brand: "Apple",
      model: "MacBook Pro 14",
      serial: existing ? "DEMO-C02X148" : "DEMO-NEW-LABEL",
      serialChecked: false,
    });
    setUnknownConfirmed(false);
    setStep(1);
    setError("");
  }
  if (!ready) return <div className="loading">Restoring registration…</div>;
  return (
    <div className="page scan-page">
      <div className="scan-top">
        <Link href="/" className="back-link">
          <ArrowLeft />
          Inventory
        </Link>
        <span className="demo-badge">Demo registration</span>
      </div>
      <ol className="steps" aria-label="Registration progress">
        {["Capture", "Review", "Confirm"].map((s, i) => (
          <li
            key={s}
            className={step >= i ? "complete" : ""}
            aria-current={step === i ? "step" : undefined}
          >
            <span>{step > i ? <Check /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {draftWarning && <Notice warning>{draftWarning}</Notice>}
      {error && (
        <Notice warning>
          {error}
          {duplicate && (
            <Link
              className="inline-link"
              href={`/assets/${encodeURIComponent(duplicate)}`}
            >
              Open existing asset →
            </Link>
          )}
        </Notice>
      )}
      {matches.length > 1 && (
        <section className="card">
          <h2>Choose an existing record</h2>
          {matches.map((a) => (
            <Link
              key={a.id}
              className="duplicate-record"
              href={`/assets/${encodeURIComponent(a.id)}`}
            >
              {a.name} · {a.id}
              <br />
              {a.assignee || "Unassigned"} · {a.location}
            </Link>
          ))}
        </section>
      )}
      {step === 0 ? (
        <section className="capture-stage">
          <div className="scan-heading">
            <p className="eyebrow">LET’S GET IT REGISTERED</p>
            <h1>Start with the label.</h1>
            <p>
              Capture the serial number clearly. Already registered? We’ll open
              the asset.
            </p>
            <span className="light-tip">
              <Sun />
              Good lighting helps
            </span>
          </div>
          <div className="camera-stage">
            <div className="capture-frame">
              <ScanLine />
              <p>Keep the whole label in view</p>
              <small>Use your phone camera or choose a photo</small>
            </div>
            <div className="capture-controls">
              <Button
                variant="secondary"
                aria-label="Upload photo"
                onClick={() => photoInput.current?.click()}
                disabled={preparing}
              >
                <ImagePlus />
                Upload
              </Button>
              <Button
                className="shutter"
                aria-label="Take photo"
                onClick={() => cameraInput.current?.click()}
                disabled={preparing}
              >
                <Camera />
              </Button>
              <Button
                variant="quiet"
                disabled={preparing}
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
              >
                Enter
                <br />
                manually
              </Button>
            </div>
          </div>
          <input
            hidden
            ref={cameraInput}
            aria-label="Camera photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => void photos(e.target.files)}
          />
          <input
            hidden
            ref={photoInput}
            aria-label="Upload asset photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => void photos(e.target.files)}
          />
          {preparing && (
            <Notice>
              Preparing your photo…{" "}
              <Button variant="quiet" onClick={cancelPhoto}>
                Cancel
              </Button>
            </Notice>
          )}
          <p className="capture-help">
            JPG, PNG or WebP · Up to 3 photos · 20 MB per original
            <br />
            Photo recognition is not connected. You can review and enter label
            details.
          </p>
          <div className="demo-samples">
            <small>Explore with a fictional label</small>
            <Button variant="secondary" onClick={() => sample(true)}>
              Find existing sample
            </Button>
            <Button variant="quiet" onClick={() => sample(false)}>
              Register new sample
            </Button>
          </div>
        </section>
      ) : step === 1 ? (
        <section className="review-stage" key="review">
          <div className="scan-heading">
            <h1>Review the label.</h1>
            <p>You check the details. Unknowns can stay unknown.</p>
          </div>
          <div className="review-photo-strip">
            {asset.photos.length ? (
              asset.photos.map((p, i) => (
                <div key={p}>
                  <img src={p} alt={`Asset photo ${i + 1}`} />
                  <button
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() =>
                      setAsset({
                        ...asset,
                        photos: asset.photos.filter((_, index) => index !== i),
                      })
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              ))
            ) : (
              <span>
                <FileText />
                No photo attached
              </span>
            )}
          </div>
          <Notice>
            Enter details you can read from the device. Recognition is
            unavailable in this local demo.
          </Notice>
          <form onSubmit={continueReview}>
            <AssetFields
              asset={asset}
              setAsset={setAsset}
              nameRequired={false}
            />
            {!asset.serial && (
              <label className="check unknown-check">
                <input
                  type="checkbox"
                  checked={unknownConfirmed}
                  onChange={(e) => setUnknownConfirmed(e.target.checked)}
                />
                Serial is missing or unreadable. Save as Unknown and review
                later.
              </label>
            )}
            <div className="sticky-actions">
              <Button disabled={checking}>
                {checking ? "Finding asset…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={checking}
                onClick={() => {
                  setStep(0);
                  setError("");
                  setMatches([]);
                }}
              >
                Back to capture
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <section className="confirm-stage" key="confirm">
          <div className="scan-heading">
            <h1>Ready to register.</h1>
            <p>Confirm this new asset before saving.</p>
          </div>
          <div className="card confirmation">
            <div className="confirm-asset">
              <Device asset={asset} />
              <div>
                <h2>{asset.name}</h2>
                <span>{asset.category} · New demo record</span>
              </div>
            </div>
            <dl>
              <div>
                <dt>Brand / model</dt>
                <dd>
                  {display(asset.brand)} / {display(asset.model)}
                </dd>
              </div>
              <div>
                <dt>Serial number</dt>
                <dd className="serial">{display(asset.serial)}</dd>
              </div>
              <div>
                <dt>Specifications</dt>
                <dd>{display(asset.specs)}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{asset.condition}</dd>
              </div>
              <div>
                <dt>Accessories</dt>
                <dd>{asset.accessories || "Not checked"}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{asset.location}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>Unassigned</dd>
              </div>
              <div>
                <dt>Purchase cost</dt>
                <dd>
                  {asset.purchaseCost
                    ? `${asset.purchaseCurrency || "Unknown currency"} ${asset.purchaseCost}`
                    : "Unknown"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="card review-checklist">
            <h2>Review checklist</h2>
            <p>
              {asset.serialChecked ? <Check /> : <FileText />}Serial:{" "}
              {asset.serialChecked ? "Checked" : "Unknown"}
            </p>
            <p>
              {asset.specsChecked ? <Check /> : <FileText />}Specifications:{" "}
              {asset.specsChecked ? "Verified" : "Unknown"}
            </p>
            <p>
              {asset.conditionChecked ? <Check /> : <FileText />}Condition:{" "}
              {asset.conditionChecked ? "Inspected" : "Unknown"}
            </p>
            <Notice>
              Unverified fields stay Unknown. Battery health is not assessed.
            </Notice>
          </div>
          <Notice warning>Nothing is saved until the server confirms.</Notice>
          <div className="sticky-actions">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving asset…" : "Save asset"}
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setStep(1);
                setError("");
              }}
            >
              Back to review
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
