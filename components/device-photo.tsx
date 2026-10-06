"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Camera, ImagePlus } from "lucide-react";
import { type AssetInput, thumbnailPhoto } from "@/lib/model";
import { compressPhoto } from "@/lib/client";
import { Button, Device, Notice } from "./ui";
import { CameraCapture } from "./camera-capture";
export function DevicePhoto({
  asset,
  setAsset,
  onBusy,
}: {
  asset: AssetInput;
  setAsset: Dispatch<SetStateAction<AssetInput>>;
  onBusy?: (busy: boolean) => void;
}) {
  const upload = useRef<HTMLInputElement>(null),
    native = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const [camera, setCamera] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
      onBusy?.(false);
    },
    [onBusy],
  );
  function attach(data: string) {
    const photos = asset.photos.filter((_, i) => i !== asset.coverPhotoIndex);
    if (photos.length >= 3) {
      setError(
        "Remove a label photo to make room for the device thumbnail. Keep up to three photos total.",
      );
      return;
    }
    setAsset((current) => {
      const retained = current.photos.filter(
        (_, i) => i !== current.coverPhotoIndex,
      );
      if (retained.length >= 3) return current;
      return {
        ...current,
        photos: [...retained, data],
        coverPhotoIndex: retained.length,
      };
    });
    setError("");
  }
  async function select(files: FileList | null) {
    if (!files?.[0]) return;
    const token = ++generation.current;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const photo = await compressPhoto(files[0]);
      if (token === generation.current) attach(photo);
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        setBusy(false);
        onBusy?.(false);
      }
      if (upload.current) upload.current.value = "";
      if (native.current) native.current.value = "";
    }
  }
  return (
    <section className="card device-photo-card" aria-label="Device thumbnail">
      <div className="confirm-asset">
        <Device asset={asset} />
        <div>
          <h2>Take a photo of the device.</h2>
          <p>
            This becomes the inventory thumbnail. Capture the whole device, not
            its serial label.
          </p>
        </div>
      </div>
      {camera ? (
        <CameraCapture
          purpose="device"
          onCaptured={(data) => {
            setCamera(false);
            attach(data);
          }}
          onCancel={() => setCamera(false)}
          onUpload={() => {
            setCamera(false);
            upload.current?.click();
          }}
          onNativeCapture={() => {
            setCamera(false);
            native.current?.click();
          }}
        />
      ) : (
        <div className="photo-review-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setCamera(true)}
          >
            <Camera />
            {thumbnailPhoto(asset)
              ? "Retake device photo"
              : "Take device photo"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={() => upload.current?.click()}
          >
            <ImagePlus />
            Upload device photo
          </Button>
          {thumbnailPhoto(asset) && (
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={() =>
                setAsset((current) => ({
                  ...current,
                  photos: current.photos.filter(
                    (_, i) => i !== current.coverPhotoIndex,
                  ),
                  coverPhotoIndex: null,
                }))
              }
            >
              Remove device photo
            </Button>
          )}
        </div>
      )}
      <input
        hidden
        ref={upload}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload device thumbnail"
        onChange={(e) => void select(e.target.files)}
      />
      <input
        hidden
        ref={native}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Capture device thumbnail"
        onChange={(e) => void select(e.target.files)}
      />
      {!thumbnailPhoto(asset) && (
        <p className="fine-print">
          No device photo yet. We’ll show a category icon until you add one.
        </p>
      )}
      {busy && <Notice>Preparing device photo…</Notice>}
      {error && <Notice warning>{error}</Notice>}
    </section>
  );
}
