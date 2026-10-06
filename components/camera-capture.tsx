"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ImagePlus, RotateCcw } from "lucide-react";
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
  const modal = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const [state, setState] = useState<"starting" | "ready" | "error" | "review">(
      "starting",
    ),
    [error, setError] = useState(""),
    [photo, setPhoto] = useState(""),
    [frameRatio, setFrameRatio] = useState(16 / 9);
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
      if (video.current.videoWidth && video.current.videoHeight)
        setFrameRatio(video.current.videoWidth / video.current.videoHeight);
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
    const dialog = modal.current;
    dialog?.showModal();
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
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", hidden);
      dialog?.close();
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
  const reviewing = state === "review";
  const title = reviewing
    ? purpose === "device"
      ? "Use this device photo?"
      : "Is the label clear?"
    : purpose === "device"
      ? "Take a device photo"
      : "Read the device label";
  return (
    <dialog
      ref={modal}
      className="camera-modal"
      aria-labelledby="camera-title"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        stop();
        onCancel();
      }}
    >
      <section
        className="camera-live camera-fullscreen"
        aria-label="Camera capture"
      >
        <header className="camera-live-heading">
          <Button
            type="button"
            variant="quiet"
            aria-label="Close camera"
            onClick={() => {
              stop();
              onCancel();
            }}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h2 id="camera-title">{title}</h2>
            <p>
              {purpose === "device"
                ? reviewing
                  ? "This appears in inventory"
                  : "Fit the whole device in the frame"
                : reviewing
                  ? "We'll read this photo, then discard it"
                  : "Keep the serial number sharp and readable"}
            </p>
          </div>
        </header>
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
              Starting camera…
              <br />
              Allow camera access when prompted.
            </p>
          )}
          {state === "ready" && (
            <span
              className="camera-guides"
              aria-hidden="true"
              style={{
                aspectRatio: frameRatio,
                width: `min(100cqw, calc(100cqh * ${frameRatio}))`,
              }}
            />
          )}
          {error && (
            <div className="camera-error">
              <Notice warning>{error}</Notice>
            </div>
          )}
        </div>
        <div
          className={`camera-live-actions ${reviewing ? "is-review" : state === "error" ? "is-error" : "is-capture"}`}
        >
          {reviewing ? (
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
          ) : (
            <>
              <Button
                type="button"
                variant="quiet"
                className="camera-upload"
                aria-label="Upload photo instead"
                onClick={() => {
                  stop();
                  onUpload();
                }}
              >
                <ImagePlus />
                <span>Upload</span>
              </Button>
              {state === "ready" && (
                <Button
                  type="button"
                  className="camera-shutter"
                  aria-label="Capture photo"
                  onClick={capture}
                >
                  <Camera aria-hidden="true" />
                </Button>
              )}
              {state === "error" && (
                <>
                  <Button type="button" onClick={() => void start()}>
                    <RotateCcw />
                    Retry camera
                  </Button>
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
                </>
              )}
            </>
          )}
        </div>
      </section>
    </dialog>
  );
}
