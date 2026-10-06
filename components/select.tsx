"use client";
import * as Radix from "@radix-ui/react-select";
import {
  Children,
  isValidElement,
  useRef,
  useState,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
type Option = { value?: string; disabled?: boolean; children?: ReactNode };
// Maintained keyboard/typeahead/focus/scroll behavior. Keep a native select in the
// form for constraint validation and real-value semantics, never a fake event.
export function Select({
  children,
  value,
  onChange,
  className = "",
  id,
  disabled,
  required,
  name,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null);
  const [invalid, setInvalid] = useState(false),
    [container, setContainer] = useState<HTMLElement | null>(null);
  const generated = useId();
  const triggerId = id || `select-${generated}`;
  const options = Children.toArray(children)
    .filter(isValidElement<Option>)
    .map((child) => ({
      value: String(child.props.value ?? child.props.children ?? ""),
      text: child.props.children,
      disabled: child.props.disabled,
    }));
  const selected = options.findIndex((o) => o.value === String(value ?? ""));
  function change(index: string) {
    if (!native.current) return;
    // Native change handler receives the actual controlled select element/value.
    native.current.value = options[Number(index)].value;
    native.current.dispatchEvent(new Event("change", { bubbles: true }));
    setInvalid(false);
  }
  return (
    <>
      <select
        ref={native}
        value={value}
        onChange={onChange}
        name={name}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="select-native-validation"
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          document.getElementById(triggerId)?.focus();
        }}
      >
        <option value="" />
        {options.map((o, i) => (
          <option key={i} value={o.value} disabled={o.disabled}>
            {o.text}
          </option>
        ))}
      </select>
      <Radix.Root
        value={selected < 0 ? undefined : String(selected)}
        onValueChange={change}
        disabled={disabled}
        onOpenChange={(open) => {
          if (open)
            setContainer(
              document.getElementById(triggerId)?.closest("dialog") ?? null,
            );
        }}
      >
        <Radix.Trigger
          id={triggerId}
          className={`select-trigger ${className}`}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={
            [props["aria-describedby"], invalid ? `${triggerId}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={invalid || props["aria-invalid"] || undefined}
          aria-required={required}
          title={
            typeof options[selected]?.text === "string"
              ? options[selected].text
              : undefined
          }
        >
          <Radix.Value placeholder="Choose…" />
          <Radix.Icon>
            <ChevronDown />
          </Radix.Icon>
        </Radix.Trigger>
        <Radix.Portal container={container ?? undefined}>
          <Radix.Content
            className="select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Radix.ScrollUpButton className="select-scroll">
              <ChevronUp />
            </Radix.ScrollUpButton>
            <Radix.Viewport
              className="select-viewport"
              tabIndex={0}
              role="group"
              aria-label="Available options"
            >
              {options.map((o, i) => (
                <Radix.Item
                  value={String(i)}
                  key={i}
                  disabled={o.disabled}
                  className="select-item"
                >
                  <Radix.ItemText>{o.text}</Radix.ItemText>
                  <Radix.ItemIndicator>
                    <Check />
                  </Radix.ItemIndicator>
                </Radix.Item>
              ))}
            </Radix.Viewport>
            <Radix.ScrollDownButton className="select-scroll">
              <ChevronDown />
            </Radix.ScrollDownButton>
          </Radix.Content>
        </Radix.Portal>
      </Radix.Root>
      {invalid && (
        <small className="field-error" id={`${triggerId}-error`}>
          Choose an option before continuing.
        </small>
      )}
    </>
  );
}
