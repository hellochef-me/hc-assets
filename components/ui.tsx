"use client";
import { thumbnailPhoto } from "@/lib/model";
import {
  ButtonHTMLAttributes,
  ReactNode,
  ReactElement,
  Ref,
  Children,
  cloneElement,
  useId,
  useEffect,
  useRef,
} from "react";
import {
  Laptop,
  Monitor,
  Smartphone,
  Tablet,
  Keyboard,
  Package,
  Info,
  TriangleAlert,
  ArrowRight,
  User,
  MapPin,
} from "lucide-react";
import type { Asset, Movement } from "@/lib/model";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "dark";
  ref?: Ref<HTMLButtonElement>;
}) {
  return <button {...props} className={`button ${variant} ${className}`} />;
}
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${status === "Needs review" ? "review" : status === "Repair" ? "repair" : status === "Retired" ? "muted" : status === "Assigned" ? "assigned" : "available"}`}
    >
      <span className="status-dot" />
      {status}
    </span>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.toArray(children).map((child, index) =>
        index === 0
          ? cloneElement(
              child as ReactElement<{
                id?: string;
                "aria-describedby"?: string;
              }>,
              {
                id,
                "aria-describedby": hint ? `${id}-hint` : undefined,
              },
            )
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <div
      className={`notice ${warning ? "warning" : ""}`}
      role={warning ? "alert" : "status"}
    >
      {warning ? <TriangleAlert /> : <Info />}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Package />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Device({
  asset,
  large = false,
}: {
  asset: Pick<Asset, "category" | "photos" | "name" | "coverPhotoIndex">;
  large?: boolean;
}) {
  const Icon =
    asset.category === "Laptop"
      ? Laptop
      : asset.category === "Monitor"
        ? Monitor
        : asset.category === "Phone"
          ? Smartphone
          : asset.category === "Tablet"
            ? Tablet
            : asset.category === "Peripheral"
              ? Keyboard
              : Package;
  return (
    <div className={`device ${large ? "large" : ""}`} aria-hidden="true">
      {thumbnailPhoto(asset) ? (
        <img src={thumbnailPhoto(asset)!} alt="" />
      ) : (
        <Icon strokeWidth={1.3} />
      )}
    </div>
  );
}
export function Timeline({ events }: { events: Movement[] }) {
  return events.length ? (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="timeline-dot" />
          <div>
            <time>{date(e.at)}</time>
            <h3>{e.action}</h3>
            <p>
              <User />
              {e.from.assignee || "Unassigned"}
              <ArrowRight />
              {e.to.assignee || "Unassigned"}
            </p>
            <p>
              <MapPin />
              {e.from.location || "—"}
              <ArrowRight />
              {e.to.location || "—"}
            </p>
            <small>
              {e.actor} ·{" "}
              {e.at
                ? new Date(e.at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })
                : "Unknown time"}{" "}
              UTC
            </small>
            {e.notes && <p>{e.notes}</p>}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="muted-text">No movement recorded.</p>
  );
}
export function date(value: string) {
  if (value && !Number.isFinite(new Date(value).getTime())) return value;
  return value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Unknown date";
}
export function Dialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <Button variant="quiet" onClick={onClose} aria-label="Close dialog">
          ×
        </Button>
      </div>
      {children}
    </dialog>
  );
}
