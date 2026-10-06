"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X } from "lucide-react";
import { Button, Notice } from "./ui";
export function CameraCapture({
  purpose = "label",
  onCaptured,
  onCancel,
  onUpload,
  onNativeCapture,
}: {
  purpose?: "label" | "device";
  onCaptured: (photo: string) => void;
  onCancel: () => void;
  onUpload: () => void;
  onNativeCapture: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const [state, setState] = useState<"starting" | "ready" | "error" | "review">(
      "starting",
    ),
    [error, setError] = useState(""),
    [photo, setPhoto] = useState("");
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  async function start() {
    stop();
    const token = generation.current;
    setState("starting");
    setError("");
    setPhoto("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("unsupported");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (token !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      if (token !== generation.current) return;
      media.getVideoTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            if (token === generation.current) {
              stop();
              setError(
                "The camera disconnected. Retry, use the device camera, or upload a photo.",
              );
              setState("error");
            }
          },
          { once: true },
        ),
      );
      setState("ready");
    } catch (e) {
      if (token !== generation.current) return;
      stop();
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in this browser and any OS prompt, then retry. Upload and the device camera remain available."
          : name === "NotFoundError"
            ? "No camera is available on this device. Connect a camera, use the device camera picker, or upload a photo."
            : name === "NotReadableError"
              ? "The camera is busy or blocked by the operating system. Close other camera apps and retry, or upload a photo."
              : "This browser could not start the camera. Use a secure local/HTTPS context, try the device camera picker, or upload a photo.",
      );
      setState("error");
    }
  }
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void start();
    });
    function hidden() {
      if (document.hidden) {
        stop();
        setState((current) => (current === "review" ? current : "error"));
        setError(
          "The camera was stopped when this page was hidden. Retry to resume.",
        );
      }
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stop();
        onCancel();
      }
    }
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("keydown", escape);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("keydown", escape);
    };
    // Camera session starts once; parent callbacks are intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) {
      setError("The camera frame is not ready. Wait for the preview or retry.");
      return;
    }
    const canvas = document.createElement("canvas"),
      ratio = Math.min(
        1,
        1400 / Math.max(element.videoWidth, element.videoHeight),
      );
    canvas.width = Math.round(element.videoWidth * ratio);
    canvas.height = Math.round(element.videoHeight * ratio);
    canvas
      .getContext("2d")!
      .drawImage(element, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.75);
    if (data.length > 900_000) {
      setError(
        "The frame is too large. Move closer to the label or upload a smaller image.",
      );
      return;
    }
    stop();
    setPhoto(data);
    setState("review");
  }
  return (
    <section className="camera-live" aria-label="Camera capture">
      <div className="camera-live-heading">
        <h2>{state === "review" ? "Check your photo" : "Device camera"}</h2>
        <Button
          type="button"
          variant="quiet"
          aria-label="Close camera"
          onClick={() => {
            stop();
            onCancel();
          }}
        >
          <X />
        </Button>
      </div>
      <div className="camera-viewfinder">
        <video
          hidden={!!photo}
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Live camera preview"
        />
        {photo && (
          <img
            src={photo}
            alt={
              purpose === "device"
                ? "Captured device photo awaiting confirmation"
                : "Captured device label awaiting confirmation"
            }
          />
        )}
        {state === "starting" && (
          <p role="status">
            Starting camera… Please respond to browser or OS permission prompts.
          </p>
        )}
      </div>
      {error && <Notice warning>{error}</Notice>}
      <div className="camera-live-actions">
        {state === "ready" ? (
          <Button type="button" onClick={capture}>
            <Camera />
            Capture photo
          </Button>
        ) : state === "review" ? (
          <>
            <Button type="button" onClick={() => onCaptured(photo)}>
              Use photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void start()}
            >
              <RotateCcw />
              Retake
            </Button>
          </>
        ) : state === "error" ? (
          <Button type="button" onClick={() => void start()}>
            <RotateCcw />
            Retry camera
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            stop();
            onNativeCapture();
          }}
        >
          Use device camera
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            stop();
            onUpload();
          }}
        >
          Upload photo instead
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            stop();
            onCancel();
          }}
        >
          Cancel camera
        </Button>
      </div>
      <small>
        Camera frames stay local until you use a photo. Recognition runs only
        when the server provider is explicitly configured.
      </small>
    </section>
  );
}
