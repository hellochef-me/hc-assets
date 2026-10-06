"use client";
import { Select } from "./select";
import { AssetInput, categories, conditions } from "@/lib/model";
import { Field, Notice } from "./ui";
import { locations } from "@/lib/fixtures";
export function AssetFields({
  asset,
  setAsset,
  nameRequired = true,
}: {
  nameRequired?: boolean;
  asset: AssetInput;
  setAsset: (a: AssetInput) => void;
}) {
  const change = (key: keyof AssetInput, value: string | boolean) =>
    setAsset({ ...asset, [key]: value });
  return (
    <div className="asset-fields">
      <Field
        label="Serial number"
        hint="Read it from the label. Leave blank if missing or uncertain."
      >
        <input
          value={asset.serial}
          onChange={(e) =>
            setAsset({ ...asset, serial: e.target.value, serialChecked: false })
          }
          placeholder="Unknown"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={400}
        />
      </Field>
      {asset.serial && (
        <label className="check">
          <input
            type="checkbox"
            checked={asset.serialChecked}
            onChange={(e) => change("serialChecked", e.target.checked)}
          />
          I checked this serial against the device label
        </label>
      )}
      <div className="field-grid">
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
      <details className="disclosure">
        <summary>Specifications, condition & accessories</summary>
        <div className="disclosure-content">
          <Notice>
            Battery health and working condition need a manual check. Photos
            alone cannot verify them.
          </Notice>
          <Field label="Specifications">
            <input
              value={asset.specs}
              onChange={(e) =>
                setAsset({
                  ...asset,
                  specs: e.target.value,
                  specsChecked: false,
                })
              }
              placeholder="Unknown"
            />
          </Field>
          {asset.specs && (
            <label className="check">
              <input
                type="checkbox"
                checked={asset.specsChecked}
                onChange={(e) => change("specsChecked", e.target.checked)}
              />
              Specifications verified on the device
            </label>
          )}
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
          {asset.condition !== "Unknown" && (
            <label className="check">
              <input
                type="checkbox"
                checked={asset.conditionChecked}
                onChange={(e) => change("conditionChecked", e.target.checked)}
              />
              I inspected the physical condition and basic function
            </label>
          )}
          <Field label="Accessories">
            <input
              value={asset.accessories}
              onChange={(e) => change("accessories", e.target.value)}
              placeholder="Not checked"
            />
          </Field>
        </div>
      </details>
      <Field label="Location">
        <input
          list="locations"
          value={asset.location}
          onChange={(e) => change("location", e.target.value)}
          required
          placeholder="Choose or type a location"
        />
        <datalist id="locations">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Field>
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
