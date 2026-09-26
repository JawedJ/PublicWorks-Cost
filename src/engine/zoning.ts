import type { Component, ZoningContext } from "@/lib/schemas";
import { L, t } from "./text";
import type { TemplateFlag } from "./types";

// SPEC 8.3 (MVP): advisory zoning flags from the looked-up zone of each building.
// No hand-transcribed limits yet: we name the zone and by-law, flag an obvious use
// mismatch, and say when zoning couldn't be checked. Never changes the estimate.

const HOUSING = new Set([
  "house",
  "townhouse_block",
  "low_rise_apartment",
  "mid_rise_apartment",
]);

type Family = "residential" | "industrial" | "open_space" | "other";

function family(name: string | undefined): Family {
  const n = (name ?? "").toLowerCase();
  if (/residential/.test(n) && !/mixed/.test(n)) return "residential";
  if (/industrial|employment/.test(n)) return "industrial";
  if (/open space|park|environmental|conservation|agricultur|rural/.test(n))
    return "open_space";
  return "other";
}

/** Zoning flags for the drawn buildings. */
export function zoningFlags(
  buildings: Component[],
  zoning: ZoningContext | undefined,
): TemplateFlag[] {
  if (!zoning) return [];
  const out: TemplateFlag[] = [];
  const unchecked: string[] = [];
  const failed: string[] = [];

  for (const c of buildings) {
    const z = zoning.zones[c.id];
    if (!z) continue; // not looked up yet
    if (z.status === "no_data") {
      unchecked.push(c.id);
      continue;
    }
    if (z.status === "error") {
      failed.push(c.id);
      continue;
    }
    const where = t(
      z.city,
      L(" Zoning By-law ", " Règlement de zonage "),
      z.bylaw,
      z.link ? t(" (", z.link, ")") : "",
    );
    out.push({
      code: "zoning_zone",
      severity: z.siteSpecific ? "warning" : "info",
      title: t(L("Zoned ", "Zonage "), z.code),
      explanation: t(
        c.name,
        L(" is in zone ", " est dans la zone "),
        z.code,
        z.name ? t(" (", z.name, ")") : "",
        L(" under the ", " selon le "),
        where,
        ".",
        z.siteSpecific
          ? t(
              L(" Site-specific provision ", " Disposition particulière "),
              z.siteSpecific,
              L(" applies.", " applicable."),
            )
          : "",
        L(
          " Check this zone's height, coverage, setback and use limits before design. Advisory only.",
          " Vérifiez les limites de hauteur, d'emprise, de marges et d'usage de la zone. À titre indicatif.",
        ),
      ),
      componentIds: [c.id],
    });

    const fam = family(z.name);
    const housing = HOUSING.has(c.subtype);
    const mismatch =
      (!housing && (fam === "residential" || fam === "open_space")) ||
      (housing && (fam === "industrial" || fam === "open_space")) ||
      (!housing &&
        fam === "industrial" &&
        c.subtype !== "maintenance_facility");
    if (mismatch)
      out.push({
        code: "zoning_use",
        severity: "warning",
        title: L("Use may not be permitted", "Usage possiblement non permis"),
        explanation: t(
          L("Zone ", "La zone "),
          z.code,
          z.name ? t(" (", z.name, ")") : "",
          L(
            ` may not permit this kind of building. Some public uses are allowed in any zone, but expect a check and possibly a zoning amendment or minor variance. Verify with ${z.city}.`,
            ` pourrait ne pas permettre ce type de bâtiment. Vérifiez auprès de ${z.city}; une modification de zonage pourrait être requise.`,
          ),
        ),
        componentIds: [c.id],
      });
  }

  if (unchecked.length)
    out.push({
      code: "zoning_not_checked",
      severity: "info",
      title: L("Zoning not checked", "Zonage non vérifié"),
      explanation: L(
        "No public zoning data for this location (zoning lookup covers Ottawa and Cambridge). Check the municipality's zoning by-law.",
        "Aucune donnée de zonage publique ici (Ottawa et Cambridge seulement). Consultez le règlement de zonage municipal.",
      ),
      componentIds: unchecked,
    });
  if (failed.length)
    out.push({
      code: "zoning_lookup_failed",
      severity: "info",
      title: L("Zoning lookup failed", "Recherche de zonage échouée"),
      explanation: L(
        "The city's zoning service didn't answer. It will retry when the design changes.",
        "Le service de zonage n'a pas répondu. Nouvel essai au prochain changement.",
      ),
      componentIds: failed,
    });
  return out;
}
