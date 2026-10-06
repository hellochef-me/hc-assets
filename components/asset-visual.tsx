"use client";
import { Camera, MapPin, ScanLine, User } from "lucide-react";
import { type Asset, thumbnailPhoto, locationLabel } from "@/lib/model";
import { Badge, Device } from "./ui";
type VisualAsset = Pick<
  Asset,
  "name" | "category" | "photos" | "coverPhotoIndex"
>;
export function AssetPortrait({ asset }: { asset: VisualAsset }) {
  return (
    <div
      className={`asset-portrait ${thumbnailPhoto(asset) ? "has-photo" : "without-photo"}`}
    >
      <Device asset={asset} large />
      {!thumbnailPhoto(asset) && (
        <span>
          <Camera /> Device photo not added
        </span>
      )}
    </div>
  );
}
export function AssetSummary({ asset }: { asset: Asset }) {
  return (
    <div className="asset-summary">
      <Device asset={asset} />
      <div>
        <strong>{asset.name}</strong>
        <small>{asset.id}</small>
      </div>
    </div>
  );
}
export function AssetIdentityCard({
  asset,
  compact = false,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  return (
    <div className={`asset-identity-card ${compact ? "compact" : ""}`}>
      {compact ? (
        <AssetSummary asset={asset} />
      ) : (
        <>
          <AssetPortrait asset={asset} />
          <div className="identity-title">
            <div>
              <h2>{asset.name}</h2>
              <small>{asset.id}</small>
            </div>
            <Badge status={asset.status} />
          </div>
        </>
      )}
      <dl className="identity-facts">
        <div>
          <dt>
            <ScanLine />
            Serial number
          </dt>
          <dd>{asset.serial || "Unknown"}</dd>
        </div>
        <div>
          <dt>
            <User />
            Assigned to
          </dt>
          <dd>{asset.assignee || "Unassigned"}</dd>
        </div>
        <div>
          <dt>
            <MapPin />
            Location
          </dt>
          <dd>{locationLabel(asset)}</dd>
        </div>
      </dl>
    </div>
  );
}
