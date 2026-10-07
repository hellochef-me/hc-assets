"use client";
import { Select } from "./select";
import {
  AssetInput,
  categories,
  conditions,
  locations,
  isStorageLocation,
} from "@/lib/model";
import { Field, Notice } from "./ui";
import { EntryListEditor } from "./entry-list";
export function AssetFields({
  asset,
  setAsset,
  nameRequired = true,
  assigned = false,
  assignmentControls,
  compact = false,
  photoControls,
  serialControls,
  serialHelp,
  registration = false,
}: {
  nameRequired?: boolean;
  assigned?: boolean;
  assignmentControls?: React.ReactNode;
  compact?: boolean;
  photoControls?: React.ReactNode;
  serialControls?: React.ReactNode;
  serialHelp?: React.ReactNode;
  registration?: boolean;
  asset: AssetInput;
  setAsset: (a: AssetInput) => void;
}) {
  const change = (key: keyof AssetInput, value: string | boolean) =>
    setAsset({ ...asset, [key]: value });
  const nameField = (
    <Field label="Asset name">
      <input
        value={asset.name}
        onChange={(e) => change("name", e.target.value)}
        required={nameRequired}
        maxLength={400}
        autoComplete="off"
        placeholder="e.g. Dell Latitude 5440"
      />
    </Field>
  );
  const identityFields = (
    <div className="field-grid">
      {!compact && !registration && nameField}
      <Field label="Category">
        <Select
          value={asset.category}
          onChange={(e) => change("category", e.target.value)}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Brand">
        <input
          value={asset.brand}
          onChange={(e) => change("brand", e.target.value)}
          placeholder="Unknown"
        />
      </Field>
      <Field label="Model">
        <input
          value={asset.model}
          onChange={(e) => change("model", e.target.value)}
          placeholder="Unknown"
        />
      </Field>
    </div>
  );
  const conditionField = (
    <>
      <Field label="Condition">
        <Select
          value={asset.condition}
          onChange={(e) =>
            setAsset({
              ...asset,
              condition: e.target.value as AssetInput["condition"],
              conditionChecked: false,
            })
          }
        >
          {conditions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
    </>
  );
  const ownershipFields = (
    <>
      {assignmentControls}
      <Field
        label="Location"
        hint={
          assigned
            ? "Optional while assigned to someone."
            : "Choose where this device is stored."
        }
      >
        <Select
          value={isStorageLocation(asset.location) ? asset.location : ""}
          onChange={(e) => change("location", e.target.value)}
          required={!assigned}
        >
          <option value="">
            {assigned
              ? "No storage location — with assignee"
              : "Choose a storage location"}
          </option>
          {locations.map((location) => (
            <option key={location}>{location}</option>
          ))}
        </Select>
        {!isStorageLocation(asset.location) && asset.location && (
          <small className="muted-text">
            Previously recorded: {asset.location}. Confirm a storage location
            before saving.
          </small>
        )}
      </Field>
    </>
  );
  return (
    <div className="asset-fields">
      {compact && nameField}
      <div className="serial-row">
        <Field
          label="Serial number"
          hint={
            asset.serial ? undefined : "Leave blank if missing or uncertain."
          }
        >
          <input
            value={asset.serial}
            onChange={(e) =>
              setAsset({
                ...asset,
                serial: e.target.value,
                serialChecked: false,
              })
            }
            placeholder="Unknown"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={400}
          />
        </Field>
        {serialControls}
      </div>
      {serialHelp}
      {registration && (
        <>
          {nameField}
          {ownershipFields}
        </>
      )}
      {photoControls}
      {compact && conditionField}
      {compact || registration ? (
        <details className="disclosure">
          <summary>Brand, model & category</summary>
          <div className="disclosure-content">{identityFields}</div>
        </details>
      ) : (
        identityFields
      )}
      <details className="disclosure">
        <summary>
          {compact
            ? "Specifications & accessories"
            : "Specifications, condition & accessories"}
        </summary>
        <div className="disclosure-content">
          <Notice>
            Battery health and working condition need a manual check. Photos
            alone cannot verify them.
          </Notice>
          <EntryListEditor
            label="Specifications"
            value={asset.specs}
            onChange={(value) =>
              setAsset({
                ...asset,
                specs: value,
                specsChecked: false,
              })
            }
            placeholder="Unknown"
          />
          {!compact && conditionField}
          <EntryListEditor
            label="Accessories"
            value={asset.accessories}
            onChange={(value) => change("accessories", value)}
            placeholder="Not checked"
          />
        </div>
      </details>
      {!registration && ownershipFields}
      <details className="disclosure">
        <summary>Purchase details & notes (optional)</summary>
        <div className="disclosure-content">
          <div className="field-grid">
            <Field label="Purchase cost">
              <input
                inputMode="decimal"
                value={asset.purchaseCost}
                onChange={(e) => change("purchaseCost", e.target.value)}
                placeholder="Unknown"
              />
            </Field>
            <Field label="Currency">
              <Select
                value={asset.purchaseCurrency}
                onChange={(e) => change("purchaseCurrency", e.target.value)}
              >
                {!["AED", "USD", "EUR", "GBP"].includes(
                  asset.purchaseCurrency,
                ) && (
                  <option value={asset.purchaseCurrency}>
                    {asset.purchaseCurrency || "Unknown"}
                  </option>
                )}
                {["AED", "USD", "EUR", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Purchase date">
            <input
              type="date"
              value={asset.purchaseDate}
              onChange={(e) => change("purchaseDate", e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={asset.notes}
              onChange={(e) => change("notes", e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
