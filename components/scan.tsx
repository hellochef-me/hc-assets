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
  createInput,
  Person,
  possibleSerialMatches,
  serialIdentity,
  blankAsset,
  display,
  findBySerial,
} from "@/lib/model";
import {
  ApiError,
  compressPhoto,
  fetchSnapshot,
  saveAsset,
  request,
} from "@/lib/client";
import { Button, Notice, Device, Field } from "./ui";
import { Select } from "./select";
import { AssetFields } from "./asset-fields";
import { DevicePhoto } from "./device-photo";
import { AssetPortrait } from "./asset-visual";
import { SerialMatch } from "./serial-match";
import { ScanStatus } from "./scan-status";
import { CameraCapture } from "./camera-capture";
import { useSource } from "./source-context";
import type { PhotoExtraction } from "@/lib/server/integrations";
const draftKey = "hcassets.demo.registration.v2";
export function Scan({ manual = false }: { manual?: boolean }) {
  const { source, canWrite } = useSource();
  const ocrEnabled = source?.ocrEnabled ?? source?.aiEnabled ?? false;
  const [cameraOpen, setCameraOpen] = useState(false),
    [recognizing, setRecognizing] = useState(false),
    [recognitionNotice, setRecognitionNotice] = useState(""),
    [recognitionPhase, setRecognitionPhase] = useState<"label" | "lookup">(
      "label",
    ),
    [readIssue, setReadIssue] = useState("");
  const recognition = useRef<{
    generation: number;
    controller?: AbortController;
  }>({ generation: 0 });
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
    [draftWarning, setDraftWarning] = useState(""),
    [assignee, setAssignee] = useState(""),
    [labelPhotos, setLabelPhotos] = useState<string[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [possibleMatches, setPossibleMatches] = useState<Asset[]>([]),
    [reviewedMatchIds, setReviewedMatchIds] = useState<string[]>([]),
    [matchDismissed, setMatchDismissed] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null),
    operation = useRef(0),
    receipt = useRef({ payload: "", id: "" });
  const latestAsset = useRef(asset),
    completed = useRef(false),
    submitting = useRef(false);
  useEffect(() => {
    latestAsset.current = asset;
  }, [asset]);
  useEffect(() => {
    let active = true;
    void fetchSnapshot()
      .then((snapshot) => {
        if (active) setPeople(snapshot.people);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  function clearDraft() {
    completed.current = true;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* navigation remains safe */
    }
  }
  function openExisting(id: string) {
    clearDraft();
    router.replace(`/assets/${encodeURIComponent(id)}`);
  }
  function startFresh() {
    cancelRecognition();
    operation.current++;
    setPreparing(false);
    setAsset(blankAsset());
    setAssignee("");
    setLabelPhotos([]);
    setMatches([]);
    setPossibleMatches([]);
    setMatchDismissed(false);
    setReviewedMatchIds([]);
    setUnknownConfirmed(false);
    setRecognitionNotice("");
    setReadIssue("");
    setError("");
    setStep(0);
    receipt.current = { payload: "", id: "" };
  }
  function changeAsset(next: AssetInput) {
    if (next.serial !== asset.serial) {
      setPossibleMatches([]);
      setMatchDismissed(false);
      setReviewedMatchIds([]);
      setMatches([]);
    }
    setAsset(next);
  }
  useEffect(
    () => () => {
      operation.current++;
      recognition.current.generation++;
      recognition.current.controller?.abort();
    },
    [],
  );
  function cancelRecognition() {
    recognition.current.generation++;
    recognition.current.controller?.abort();
    setRecognizing(false);
  }
  async function readLabel(photoData: string[]) {
    if (!ocrEnabled) {
      setRecognitionNotice(
        "Photo attached. Live OCR is not configured; enter readable label details manually. No AI extraction has been performed.",
      );
      return;
    }
    cancelRecognition();
    const controller = new AbortController();
    const token = recognition.current.generation;
    recognition.current.controller = controller;
    setRecognizing(true);
    setRecognitionPhase("label");
    setReadIssue("");
    setRecognitionNotice("");
    try {
      const extracted = await request<PhotoExtraction>("/api/scan", {
        method: "POST",
        body: JSON.stringify({ photos: photoData }),
        signal: controller.signal,
      });
      if (token !== recognition.current.generation) return;
      setAsset((current) => ({
        ...current,
        brand: current.brand || extracted.brand || "",
        model: current.model || extracted.model || "",
        name:
          current.name ||
          [extracted.brand, extracted.model].filter(Boolean).join(" "),
        serial: current.serial || extracted.serial || "",
        specs: current.specs || extracted.specs || "",
        serialChecked: current.serial ? current.serialChecked : false,
        specsChecked: current.specs ? current.specsChecked : false,
      }));
      setRecognitionNotice(
        "AI label suggestions are ready for human review. Your existing entries were kept. Check the serial and visible specifications; missing fields remain Unknown.",
      );
      const serial = latestAsset.current.serial || extracted.serial || "";
      if (
        latestAsset.current.serial &&
        extracted.serial &&
        serialIdentity(latestAsset.current.serial) !==
          serialIdentity(extracted.serial)
      ) {
        setRecognitionNotice(
          `This photo reads ${extracted.serial}, but the form contains ${latestAsset.current.serial}. Check the physical label and correct the serial, or use Start a new scan for another device.`,
        );
        return;
      }
      if (!serial) {
        setReadIssue(
          "The serial number was missing or unreadable. You can keep the other extracted details and enter it manually.",
        );
        return;
      }
      if (serial) {
        setRecognitionPhase("lookup");
        const snapshot = await fetchSnapshot();
        if (
          token !== recognition.current.generation ||
          (latestAsset.current.serial && latestAsset.current.serial !== serial)
        )
          return;
        setPeople(snapshot.people);
        const found = findBySerial(snapshot.assets, serial);
        if (found.length === 1) {
          setMatches(found);
          setStep(1);
          return;
        }
        if (found.length > 1) {
          setMatches(found);
          setError(
            "Multiple existing records have this serial. Choose a record to inspect; no records were merged.",
          );
        } else
          setPossibleMatches(possibleSerialMatches(snapshot.assets, serial));
      }
    } catch (e) {
      if (token === recognition.current.generation) {
        setReadIssue((e as Error).message);
        setRecognitionNotice("You can continue with manual details.");
      }
    } finally {
      if (token === recognition.current.generation) setRecognizing(false);
    }
  }
  function captured(data: string) {
    setCameraOpen(false);
    if (labelPhotos.length >= 3) {
      setError(
        "Keep up to three photos. Remove an existing photo before adding another.",
      );
      return;
    }
    const photoData = [...labelPhotos, data];
    setLabelPhotos(photoData);
    setStep(1);
    void readLabel(photoData);
  }
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.asset && typeof draft.step === "number") {
          // Restore an interrupted browser session after hydration; never copy live data.
          const cover = draft.asset.coverPhotoIndex;
          const device = Number.isInteger(cover)
            ? draft.asset.photos?.[cover]
            : null;
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setAsset({
            ...blankAsset(),
            ...draft.asset,
            photos: device ? [device] : [],
            coverPhotoIndex: device ? 0 : null,
          });
          const removedLegacyLabels =
            JSON.stringify(draft.asset.photos || []) !==
            JSON.stringify(device ? [device] : []);
          setStep(removedLegacyLabels ? 1 : draft.step);
          if (removedLegacyLabels)
            setDraftWarning(
              "Temporary label photos were removed from this older draft. Check inventory before continuing, especially if its previous save was interrupted.",
            );
          setUnknownConfirmed(!!draft.unknownConfirmed);
          setAssignee(draft.assignee || "");
          setReviewedMatchIds(draft.reviewedMatchIds || []);
          receipt.current = removedLegacyLabels
            ? { payload: "", id: "" }
            : draft.receipt || { payload: "", id: "" };
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
    if (!ready || completed.current) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          asset,
          step,
          unknownConfirmed,
          assignee,
          reviewedMatchIds,
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
  }, [asset, step, ready, unknownConfirmed, assignee, reviewedMatchIds]);
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
      if (files.length + labelPhotos.length > 3)
        throw new Error("Use up to three temporary label photos for reading.");
      const data = await Promise.all(Array.from(files).map(compressPhoto));
      if (token !== operation.current) return;
      setLabelPhotos((current) => [...current, ...data]);
      setStep(1);
      void readLabel([...labelPhotos, ...data]);
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
    if (recognizing || checking || preparing) return;
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
    const lookupToken = ++operation.current;
    setChecking(true);
    try {
      const snapshot = await fetchSnapshot();
      if (lookupToken !== operation.current) return;
      setPeople(snapshot.people);
      const found = findBySerial(snapshot.assets, asset.serial);
      if (found.length === 1) {
        setMatches(found);
        setStep(1);
        return;
      }
      if (found.length > 1) {
        setMatches(found);
        setError(
          "Multiple existing records have this serial. Choose a record to inspect; no records were merged.",
        );
        return;
      }
      if (!canWrite) {
        setError(
          "No existing asset matches this serial. This real Sheet snapshot is read only; registration requires the approved controlled writer.",
        );
        return;
      }
      const possible = possibleSerialMatches(snapshot.assets, asset.serial);
      setPossibleMatches(possible);
      if (possible.some((a) => !reviewedMatchIds.includes(a.id))) {
        setMatchDismissed(false);
        setError(
          "This may already be registered. Compare the serials below before creating another record.",
        );
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      const parsed = createInput.safeParse({
        asset,
        assignee,
        reviewedMatchIds,
        requestId: crypto.randomUUID(),
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (e) {
      if (lookupToken === operation.current) setError((e as Error).message);
    } finally {
      if (lookupToken === operation.current) setChecking(false);
    }
  }
  async function save() {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setDuplicate("");
    const payload = JSON.stringify({ asset, assignee, reviewedMatchIds });
    if (receipt.current.payload !== payload)
      receipt.current = { payload, id: crypto.randomUUID() };
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          asset,
          step,
          unknownConfirmed,
          assignee,
          reviewedMatchIds,
          receipt: receipt.current,
        }),
      );
    } catch {
      /* in-page receipt still protects retry */
    }
    setSaving(true);
    try {
      const { asset: saved } = await saveAsset(
        asset,
        receipt.current.id,
        assignee,
        reviewedMatchIds,
      );
      clearDraft();
      router.replace(`/assets/${encodeURIComponent(saved.id)}?saved=1`);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.assetId) {
        if (e.code === "duplicate") {
          openExisting(e.assetId);
          return;
        }
        setDuplicate(e.assetId);
        if (e.code === "possible-duplicate") {
          setStep(1);
          setReviewedMatchIds([]);
          try {
            setPossibleMatches(
              possibleSerialMatches(
                (await fetchSnapshot()).assets,
                asset.serial,
              ),
            );
          } catch {
            /* retry Continue for a fresh lookup */
          }
        }
      }
    } finally {
      submitting.current = false;
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
  const progressStep = recognizing || readIssue ? 0 : step;
  return (
    <div className="page scan-page">
      <div className="scan-top">
        <Link href="/" className="back-link">
          <ArrowLeft />
          Inventory
        </Link>
        <span className="demo-badge">
          {source?.kind === "demo"
            ? "Demo registration"
            : source?.readOnly
              ? "Read-only lookup"
              : source?.kind === "staging"
                ? "Staging registration"
                : "Asset registration"}
        </span>
      </div>
      <ol className="steps" aria-label="Registration progress">
        {["Label", "Details", "Device photo", "Confirm"].map((s, i) => (
          <li
            key={s}
            className={progressStep >= i ? "complete" : ""}
            aria-current={progressStep === i ? "step" : undefined}
          >
            <span>{progressStep > i ? <Check /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {step > 0 &&
        !recognizing &&
        !checking &&
        !readIssue &&
        !matches.length &&
        !(possibleMatches.length > 0 && step === 1 && !matchDismissed) && (
          <Button
            variant="quiet"
            disabled={saving || checking}
            onClick={startFresh}
          >
            Start a new scan
          </Button>
        )}
      {draftWarning && <Notice warning>{draftWarning}</Notice>}
      {error && (
        <Notice warning>
          {error}
          {duplicate && (
            <Link
              className="inline-link"
              href={`/assets/${encodeURIComponent(duplicate)}`}
              onClick={clearDraft}
            >
              Open existing asset →
            </Link>
          )}
        </Notice>
      )}
      {recognizing || checking || readIssue ? (
        <ScanStatus
          photo={labelPhotos[0]}
          serial={asset.serial}
          lookup={checking || recognitionPhase === "lookup"}
          issue={readIssue}
          onManual={() => {
            cancelRecognition();
            operation.current++;
            setChecking(false);
            setReadIssue("");
            setStep(1);
          }}
          onRetry={startFresh}
        />
      ) : matches.length > 0 ||
        (possibleMatches.length > 0 && step === 1 && !matchDismissed) ? (
        <SerialMatch
          exact={matches.length > 0}
          candidates={matches.length ? matches : possibleMatches}
          scanned={asset.serial}
          reviewed={reviewedMatchIds}
          onReview={setReviewedMatchIds}
          onOpen={clearDraft}
          onRetry={startFresh}
          onContinue={() => {
            setMatchDismissed(true);
            setError("");
          }}
        />
      ) : step === 0 ? (
        <section className="capture-stage">
          <div className="scan-heading">
            <p className="eyebrow">LET’S GET IT REGISTERED</p>
            <h1>Start with the label.</h1>
            <p>
              Capture the serial number clearly. Already registered? We’ll open
              the asset. Label photos are used for reading only and are not
              saved.
            </p>
            <span className="light-tip">
              <Sun />
              Good lighting helps
            </span>
          </div>
          {cameraOpen ? (
            <CameraCapture
              onCaptured={captured}
              onCancel={() => setCameraOpen(false)}
              onUpload={() => {
                setCameraOpen(false);
                photoInput.current?.click();
              }}
              onNativeCapture={() => {
                setCameraOpen(false);
                cameraInput.current?.click();
              }}
            />
          ) : (
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
                  onClick={() => setCameraOpen(true)}
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
          )}
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
            {ocrEnabled
              ? "Server recognition runs after a photo is attached. You review every suggestion."
              : "Live OCR is not configured. Camera capture and uploads work; enter label details manually."}
          </p>
          {source?.kind === "demo" && (
            <div className="demo-samples">
              <small>Explore with a fictional label</small>
              <Button variant="secondary" onClick={() => sample(true)}>
                Find existing sample
              </Button>
              <Button variant="quiet" onClick={() => sample(false)}>
                Register new sample
              </Button>
            </div>
          )}
        </section>
      ) : step === 1 ? (
        <section className="review-stage" key="review">
          <div className="scan-heading">
            <h1>Review the label.</h1>
            <p>You check the details. Unknowns can stay unknown.</p>
          </div>
          <div className="review-photo-strip">
            {labelPhotos.length ? (
              labelPhotos.map((p, i) => (
                <div key={p}>
                  <img src={p} alt={`Asset photo ${i + 1}`} />
                  <button
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() =>
                      setLabelPhotos((photos) =>
                        photos.filter((_, index) => index !== i),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              ))
            ) : (
              <span>
                <FileText />
                No label photo retained
              </span>
            )}
          </div>
          <Notice>
            {recognizing
              ? "Reading label with the server provider… Your edits will be preserved."
              : recognitionNotice ||
                "Check the serial against the device. Label photos are temporary and are not saved with the asset."}
            {recognizing && (
              <Button variant="quiet" onClick={cancelRecognition}>
                Cancel recognition
              </Button>
            )}
          </Notice>
          {!!labelPhotos.length && (
            <div className="photo-review-actions">
              <Button
                variant="secondary"
                disabled={recognizing || !ocrEnabled || !labelPhotos.length}
                onClick={() => void readLabel(labelPhotos)}
              >
                Read label
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  cancelRecognition();
                  setStep(0);
                  setCameraOpen(true);
                }}
              >
                Add or retake photo
              </Button>
            </div>
          )}

          <form onSubmit={continueReview} noValidate>
            <AssetFields
              asset={asset}
              setAsset={changeAsset}
              assigned={Boolean(assignee)}
              nameRequired={false}
              assignmentControls={
                <Field
                  label="Assign to"
                  hint="Choose the person using this device, or leave it unassigned in storage."
                >
                  <Select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">Unassigned — in storage</option>
                    {people.map((p) => (
                      <option key={p.name}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
              }
            />
            {!asset.serial && (
              <label className="check unknown-check">
                <input
                  type="checkbox"
                  checked={unknownConfirmed}
                  onChange={(e) => setUnknownConfirmed(e.target.checked)}
                />
                {canWrite
                  ? "Serial is missing or unreadable. I searched inventory and could not find this device; save as Unknown for later review."
                  : "Serial is missing or unreadable. Read-only lookup needs a serial or inventory search."}
              </label>
            )}
            <div className="sticky-actions">
              <Button disabled={checking || preparing || recognizing}>
                {checking ? "Finding asset…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={checking}
                onClick={() => {
                  cancelRecognition();
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
      ) : step === 2 ? (
        <section className="device-photo-stage" key="device-photo">
          <div className="scan-heading">
            <h1>Add a device photo.</h1>
            <p>
              A clear photo of the whole device becomes its inventory thumbnail.
              The label photo is for reading only.
            </p>
          </div>
          <DevicePhoto
            asset={asset}
            setAsset={setAsset}
            onBusy={setPreparing}
          />
          <div className="sticky-actions">
            <Button
              variant={asset.coverPhotoIndex != null ? "primary" : "secondary"}
              disabled={preparing}
              onClick={() => {
                setLabelPhotos([]);
                setStep(3);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              {asset.coverPhotoIndex != null
                ? "Use device photo"
                : "Skip for now"}
            </Button>
            <Button
              variant="secondary"
              disabled={preparing}
              onClick={() => setStep(1)}
            >
              Back to details
            </Button>
          </div>
        </section>
      ) : (
        <section className="confirm-stage" key="confirm">
          <div className="scan-heading">
            <h1>Ready to register.</h1>
            <p>Confirm this new asset before saving.</p>
          </div>
          <div className="card confirmation">
            <AssetPortrait asset={asset} />
            <div className="confirm-asset">
              <Device asset={asset} />
              <div>
                <h2>{asset.name}</h2>
                <span>
                  {asset.category} ·{" "}
                  {source?.kind === "demo"
                    ? "New demo record"
                    : source?.kind === "staging"
                      ? "New staging record"
                      : "New asset record"}
                </span>
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
                <dd>{asset.location || "With assignee"}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>{assignee || "Unassigned"}</dd>
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
          <p className="fine-print">
            Only new devices create a record. Save once to confirm.
          </p>
          <div className="sticky-actions">
            <Button onClick={save} disabled={saving || !canWrite}>
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
