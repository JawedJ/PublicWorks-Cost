"use client";

/**
 * Number that edits in place: commits on blur or Enter, Escape cancels.
 * Invalid or out-of-range entries snap back to the current value.
 */
export function NumberInput({
  label,
  value,
  min = 0,
  max,
  highlighted,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  highlighted?: boolean;
  onCommit: (v: number) => void;
}) {
  return (
    <input
      key={value}
      type="number"
      min={min}
      max={max}
      step="any"
      aria-label={label}
      defaultValue={value}
      className={`w-full rounded border bg-background px-1 py-0.5 text-right figures ${
        highlighted ? "border-primary bg-primary/5 font-medium" : ""
      }`}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = String(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const raw = e.currentTarget.value;
        const v = Number(raw);
        if (
          raw === "" ||
          !Number.isFinite(v) ||
          v < min ||
          (max !== undefined && v > max)
        ) {
          e.currentTarget.value = String(value);
          return;
        }
        if (v !== value) onCommit(v);
      }}
    />
  );
}
