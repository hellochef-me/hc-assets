"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  ENTRY_LIST_CHARACTER_LIMIT,
  parseEntryList,
  serializeEntryList,
} from "@/lib/entry-list";
import "./entry-list.css";

type EntryListEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function EntryListEditor({
  label,
  value,
  onChange,
  placeholder = "Add an entry",
  disabled = false,
}: EntryListEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => ({
    value,
    rows: parseEntryList(value).length ? parseEntryList(value) : [""],
  }));
  const [error, setError] = useState("");
  const pendingFocus = useRef<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // External changes (such as OCR or selecting another record) replace the draft.
  // Locally added empty rows stay visible until the next external change.
  if (draft.value !== value) {
    const entries = parseEntryList(value);
    setDraft({ value, rows: entries.length ? entries : [""] });
    setError("");
  }
  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      inputs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  }, [draft]);

  function update(rows: string[], focus?: number) {
    const next = serializeEntryList(rows);
    if (
      next.length > ENTRY_LIST_CHARACTER_LIMIT &&
      next.length >= value.length
    ) {
      setError(
        `Keep ${label.toLowerCase()} within ${ENTRY_LIST_CHARACTER_LIMIT} characters in total. The entry was not added.`,
      );
      return;
    }
    pendingFocus.current = focus ?? null;
    setDraft({ value: next, rows: rows.length ? rows : [""] });
    setError("");
    if (next !== value) onChange(next);
  }

  const overLimit = value.length > ENTRY_LIST_CHARACTER_LIMIT;
  return (
    <fieldset className="entry-list-editor field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="entry-list-rows">
        {draft.rows.map((entry, index) => (
          <div className="entry-list-row" key={index}>
            <span className="entry-list-marker" aria-hidden="true">
              •
            </span>
            <input
              ref={(input) => {
                inputs.current[index] = input;
              }}
              aria-label={`${label} entry ${index + 1}`}
              aria-describedby={`${id}-hint${error || overLimit ? ` ${id}-error` : ""}`}
              aria-invalid={error || overLimit ? true : undefined}
              value={entry}
              placeholder={placeholder}
              autoComplete="off"
              maxLength={Math.max(ENTRY_LIST_CHARACTER_LIMIT, entry.length)}
              onChange={(event) =>
                update(
                  draft.rows.map((row, rowIndex) =>
                    rowIndex === index ? event.target.value : row,
                  ),
                )
              }
              onPaste={(event) => {
                const text = event.clipboardData.getData("text");
                if (!text) return;
                event.preventDefault();
                const input = event.currentTarget;
                const start = input.selectionStart ?? entry.length;
                const end = input.selectionEnd ?? start;
                const combined =
                  entry.slice(0, start) + text + entry.slice(end);
                const pasted = /[\r\n]/.test(combined)
                  ? parseEntryList(combined)
                  : [combined];
                update(
                  [
                    ...draft.rows.slice(0, index),
                    ...pasted,
                    ...draft.rows.slice(index + 1),
                  ],
                  index + Math.max(0, pasted.length - 1),
                );
              }}
            />
            <button
              type="button"
              className="entry-list-remove"
              aria-label={`Remove ${label.toLowerCase()} entry ${index + 1}`}
              disabled={disabled || (draft.rows.length === 1 && !entry)}
              onClick={() =>
                update(
                  draft.rows.filter((_, rowIndex) => rowIndex !== index),
                  Math.max(0, index - 1),
                )
              }
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="entry-list-footer">
        <button
          type="button"
          className="entry-list-add"
          disabled={disabled || value.length >= ENTRY_LIST_CHARACTER_LIMIT}
          onClick={() => {
            const empty = draft.rows.findIndex((entry) => !entry.trim());
            if (empty >= 0) inputs.current[empty]?.focus();
            else update([...draft.rows, ""], draft.rows.length);
          }}
        >
          <Plus size={16} aria-hidden="true" /> Add entry
        </button>
        <small>
          {value.length}/{ENTRY_LIST_CHARACTER_LIMIT}
        </small>
      </div>
      <small id={`${id}-hint`}>
        One item per entry. You can paste several lines.
      </small>
      {(error || overLimit) && (
        <p className="entry-list-error" id={`${id}-error`} role="alert">
          {error ||
            `Shorten ${label.toLowerCase()} to ${ENTRY_LIST_CHARACTER_LIMIT} characters before saving.`}
        </p>
      )}
    </fieldset>
  );
}

export function EntryListDisplay({
  value,
  emptyLabel = "Unknown",
}: {
  value: string;
  emptyLabel?: string;
}) {
  const entries = parseEntryList(value);
  return entries.length ? (
    <ul className="entry-list-display">
      {entries.map((entry, index) => (
        <li key={index}>{entry}</li>
      ))}
    </ul>
  ) : (
    <span>{emptyLabel}</span>
  );
}
