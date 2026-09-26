import type { ParamDefinition, ParamValue } from "@/lib/schemas";
import type { ComponentTemplate, ResolvedParams } from "./types";

/**
 * Fills every catalog parameter: the component's value if valid, else the
 * subtype default, else the catalog default. Unknown ids are dropped, and
 * numbers are clamped to the catalog range, so templates can trust the result.
 */
export function resolveParams(
  template: ComponentTemplate,
  subtype: string,
  given: Record<string, ParamValue>,
): ResolvedParams {
  return resolveDefinitions(
    template.paramCatalog,
    given,
    template.subtypeDefaults?.[subtype],
  );
}

/** Same as `resolveParams` for any list of definitions (e.g. a park feature's params). */
export function resolveDefinitions(
  defs: ParamDefinition[],
  given: Record<string, ParamValue>,
  defaults: Record<string, ParamValue> = {},
): ResolvedParams {
  const out: ResolvedParams = {};
  for (const def of defs) {
    const fallback = defaults[def.id] ?? def.default;
    const value = given[def.id];
    out[def.id] = valid(def, value) ? normalize(def, value) : fallback;
  }
  return out;
}

type Def = ParamDefinition;

function valid(def: Def, value: ParamValue | undefined): value is ParamValue {
  if (value === undefined) return false;
  switch (def.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return (
        typeof value === "string" &&
        (def.options?.some((o) => o.value === value) ?? false)
      );
  }
}

function normalize(def: Def, value: ParamValue): ParamValue {
  if (def.type !== "number" || typeof value !== "number") return value;
  const lo = def.min ?? -Infinity;
  const hi = def.max ?? Infinity;
  return Math.min(hi, Math.max(lo, value));
}

// Typed getters for resolved params. They throw on a template bug (id not in its catalog).

export function num(p: ResolvedParams, id: string): number {
  const v = p[id];
  if (typeof v !== "number") throw new Error(`Param ${id} is not a number`);
  return v;
}

export function bool(p: ResolvedParams, id: string): boolean {
  const v = p[id];
  if (typeof v !== "boolean") throw new Error(`Param ${id} is not a boolean`);
  return v;
}

export function str<T extends string = string>(
  p: ResolvedParams,
  id: string,
): T {
  const v = p[id];
  if (typeof v !== "string") throw new Error(`Param ${id} is not a string`);
  return v as T;
}
