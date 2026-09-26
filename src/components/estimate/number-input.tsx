"use client";

import { Input } from "@/components/ui/input";

/**
 * Number that edits in place: commits on blur or Enter, Escape cancels.
 * Invalid or out-of-range entries snap back to the current value.
 */
export function NumberInput({
  id,
  label,
  value,
  min = 0,
  max,
  highlighted,
  onCommit,
}: {
  id?: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  highlighted?: boolean;
  onCommit: (v: number) => void;
}) {
  return (
    <Input
      id={id}
      key={value}
      type="number"
      min={min}
      max={max}
      step="any"
      aria-label={label}
      defaultValue={value}
      data-overridden={highlighted || undefined}
      className="h-8 text-right tabular-nums data-overridden:border-primary data-overridden:font-medium"
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
