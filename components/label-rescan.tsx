"use client";
import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { compressPhoto, request } from "@/lib/client";
import type { PhotoExtraction } from "@/lib/server/integrations";
import { Button, Notice } from "./ui";
import { CameraCapture } from "./camera-capture";
import { ScanStatus } from "./scan-status";
export function LabelRescan({
  enabled,
  onSerial,
  onBusy,
}: {
  enabled: boolean;
  onSerial: (serial: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [serial, setSerial] = useState(""),
    [error, setError] = useState(""),
    [photo, setPhoto] = useState("");
  const input = useRef<HTMLInputElement>(null),
    native = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  function cancel() {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    onBusy(false);
    setOpen(false);
    setSerial("");
    setPhoto("");
    setError("");
  }
  async function read(photo: string, token: number) {
    setPhoto(photo);
    controller.current = new AbortController();
    setBusy(true);
    onBusy(true);
    setOpen(false);
    setError("");
    setSerial("");
    try {
      const r = await request<PhotoExtraction>("/api/scan", {
        method: "POST",
        body: JSON.stringify({ photos: [photo] }),
        signal: controller.current.signal,
      });
      if (token === generation.current) {
        if (r.serial) setSerial(r.serial);
        else
          setError(
            "We couldn't read the serial. Try a clearer label photo or enter it manually.",
          );
      }
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        setBusy(false);
        setPhoto("");
        onBusy(false);
      }
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    const token = ++generation.current;
    setBusy(true);
    onBusy(true);
    try {
      const photo = await compressPhoto(file);
      if (token === generation.current) await read(photo, token);
    } catch (e) {
      if (token === generation.current) {
        setError((e as Error).message);
        setBusy(false);
        setPhoto("");
        onBusy(false);
      }
    } finally {
      if (input.current) input.current.value = "";
      if (native.current) native.current.value = "";
    }
  }
  return (
    <section className="label-rescan" aria-label="Read serial from label">
      <Button
        type="button"
        variant="secondary"
        disabled={!enabled || busy}
        onClick={() => {
          setOpen(true);
          setSerial("");
          setError("");
        }}
      >
        <ScanLine />
        Rescan label
      </Button>
      <small>Label photos are used for reading only and are not saved.</small>
      {open && (
        <CameraCapture
          onCaptured={(p) => void read(p, ++generation.current)}
          onCancel={cancel}
          onUpload={() => {
            setOpen(false);
            input.current?.click();
          }}
          onNativeCapture={() => {
            setOpen(false);
            native.current?.click();
          }}
        />
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload correction label"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <input
        ref={native}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Capture correction label"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      {busy && (
        <ScanStatus
          photo={photo}
          serial=""
          lookup={false}
          issue=""
          onManual={cancel}
          onRetry={cancel}
        />
      )}
      {serial && (
        <div className="serial-suggestion">
          <span>Read from label</span>
          <strong>{serial}</strong>
          <p>Check this against the device before applying it.</p>
          <Button
            type="button"
            onClick={() => {
              onSerial(serial);
              setSerial("");
            }}
          >
            Use this serial
          </Button>
        </div>
      )}
      {error && <Notice warning>{error}</Notice>}
    </section>
  );
}
