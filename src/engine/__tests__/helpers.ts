import { refData } from "@/data";
import type { Component, Measurements, ParamValue } from "@/lib/schemas";
import { DEFAULT_SETTINGS } from "@/lib/store/projectSlice";
import { resolveParams } from "../params";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
} from "../types";

export function makeComponent(
  type: Component["type"],
  subtype: string,
  params: Record<string, ParamValue> = {},
): Component {
  return {
    id: `c-${subtype}`,
    name: subtype,
    type,
    subtype,
    status: "drawn",
    origin: "user",
    params,
    paramMeta: {},
    overrides: { quantities: {}, unitPrices: {} },
    visible: true,
  };
}

export function makeCtx(
  template: ComponentTemplate,
  subtype: string,
  measurements: Partial<Measurements>,
  params: Record<string, ParamValue> = {},
): TemplateContext {
  const component = makeComponent(template.type, subtype, params);
  return {
    component,
    measurements: { features: {}, ...measurements },
    params: resolveParams(template, subtype, params),
    refData,
    settings: { ...DEFAULT_SETTINGS, startDate: "2027-04-01" },
  };
}

export const byId = (lines: QuantityLine[]) =>
  Object.fromEntries(lines.map((l) => [l.localId, l]));

/** Catalog sanity checks shared by every template test. */
export function checkCatalog(template: ComponentTemplate) {
  const ids = template.paramCatalog.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate param ids");
  for (const d of template.paramCatalog) {
    if (d.type === "enum" && !d.options?.some((o) => o.value === d.default)) {
      throw new Error(`${d.id}: default not in options`);
    }
  }
  for (const [subtype, defaults] of Object.entries(
    template.subtypeDefaults ?? {},
  )) {
    if (!template.subtypes.some((s) => s.id === subtype)) {
      throw new Error(`Unknown subtype ${subtype} in subtypeDefaults`);
    }
    for (const id of Object.keys(defaults)) {
      if (!ids.includes(id)) throw new Error(`${subtype}: unknown param ${id}`);
    }
  }
}

/** Every unit-price reference resolves in the seed data. */
export function missingPrices(lines: QuantityLine[]): string[] {
  const known = new Set(refData.unitPrices.items.map((i) => i.id));
  return lines
    .filter((l) => l.price.kind === "unitPrice" && !known.has(l.price.id))
    .map((l) => (l.price.kind === "unitPrice" ? l.price.id : ""));
}
