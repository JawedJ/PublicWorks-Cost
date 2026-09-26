import type { ComponentType, ParamValue } from "@/lib/schemas";

// Keyword fallback for the landing prompt (used by B's parse when the AI is
// unavailable). Finds known component types, counts, simple size hints ("2,400 m²",
// "two-storey", "400 m") and building amenities ("with a pool", "parking for 40
// cars"), which go on the building they follow. No costs here.

export type PlannedInput = {
  type: ComponentType;
  subtype: string;
  params: Record<string, ParamValue>;
};

const RULES: { re: RegExp; type: ComponentType; subtype: string }[] = [
  { re: /mid[- ]?rise/, type: "building", subtype: "mid_rise_apartment" },
  {
    re: /(low[- ]?rise|apartment|condo)/,
    type: "building",
    subtype: "low_rise_apartment",
  },
  {
    re: /town ?house|row ?house/,
    type: "building",
    subtype: "townhouse_block",
  },
  { re: /\b(house|home)s?\b/, type: "building", subtype: "house" },
  {
    re: /(community|rec(reation)?) (centre|center)/,
    type: "building",
    subtype: "community_centre",
  },
  { re: /librar(y|ies)/, type: "building", subtype: "library" },
  { re: /fire (station|hall)/, type: "building", subtype: "fire_station" },
  { re: /police/, type: "building", subtype: "police_station" },
  {
    re: /(municipal office|city hall|town hall)/,
    type: "building",
    subtype: "municipal_office",
  },
  { re: /school/, type: "building", subtype: "school" },
  { re: /hospital/, type: "building", subtype: "hospital" },
  { re: /community park/, type: "park", subtype: "community_park" },
  { re: /(plaza|square)/, type: "park", subtype: "plaza" },
  { re: /\bparks?\b/, type: "park", subtype: "neighbourhood_park" },
  { re: /resurfac/, type: "road", subtype: "road_resurfacing" },
  {
    re: /(bike lane|cycle track|cycling|sidewalk)/,
    type: "road",
    subtype: "sidewalk_cycling",
  },
  { re: /water ?main/, type: "road", subtype: "watermain_replacement" },
  { re: /sewer/, type: "road", subtype: "sewer_replacement" },
  {
    re: /\b(roads?|streets?|avenues?)\b/,
    type: "road",
    subtype: "road_reconstruction",
  },
  { re: /culvert/, type: "structure", subtype: "culvert_replacement" },
  { re: /bridge/, type: "structure", subtype: "small_bridge" },
  { re: /pump(ing)? station/, type: "structure", subtype: "pumping_station" },
];

/** Building amenities → catalog params. A number capture sets a count param. */
const AMENITIES: { re: RegExp; param: string; count?: boolean }[] = [
  { re: /\b(indoor )?(swimming )?pool\b|aquatic/, param: "indoorPool" },
  { re: /\bgym(nasium)?s?\b/, param: "gymnasium" },
  { re: /\b(ice )?rinks?\b|\barena\b/, param: "iceRink" },
  { re: /\b(commercial )?kitchen\b/, param: "commercialKitchen" },
  { re: /\bbasement\b|underground parking/, param: "basement" },
  { re: /sally ?port/, param: "sallyPort" },
  { re: /council chamber/, param: "councilChamber" },
  { re: /furnish|ff&e|furniture/, param: "ffeIncluded" },
  {
    re: /(\d+|[a-z]+)\s+(?:parking\s+)?(?:stalls|spaces|cars)\b/,
    param: "parkingStalls",
    count: true,
  },
  {
    re: /(\d+|[a-z]+)\s+(?:apparatus\s+|truck\s+)?bays\b/,
    param: "apparatusBays",
    count: true,
  },
  {
    re: /(\d+|[a-z]+)\s+(?:extra\s+|additional\s+)?elevators\b/,
    param: "extraElevators",
    count: true,
  },
];

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};

function numberBefore(text: string): number {
  const m = text.match(/(\d+|[a-z]+)\s+(?:[a-z-]+\s+){0,3}$/);
  if (!m) return 1;
  const n = Number(m[1]) || WORDS[m[1]!] || 1;
  return Math.min(Math.max(n, 1), 20);
}

/** Splits the prompt into clauses and matches one component rule per clause. */
export function keywordParse(prompt: string): PlannedInput[] {
  const out: PlannedInput[] = [];
  const clauses = prompt
    .toLowerCase()
    .replace(/(\d),(\d{3})/g, "$1$2")
    .split(/,|;|\band\b|\bplus\b|\bwith\b|\bet\b|\+/);
  // Amenities attach to the most recent building ("a library with a pool").
  let lastBuilding: PlannedInput[] = [];
  const amenities = (clause: string, target: PlannedInput[]) => {
    for (const a of AMENITIES) {
      const m = clause.match(a.re);
      if (!m) continue;
      const value = a.count ? Number(m[1]) || WORDS[m[1]!] : true;
      if (value) for (const b of target) b.params[a.param] = value;
    }
  };
  for (const clause of clauses) {
    const rule = RULES.find((r) => r.re.test(clause));
    if (!rule) {
      amenities(clause, lastBuilding);
      continue;
    }
    // Size phrases ("1.5 ha", "400 m", "two-storey") aren't counts.
    const bare = clause.replace(
      /\d+(\.\d+)?\s*(m2|m²|sq ?m|square met\w*|ha|hectares?|km|m)\b|[a-z0-9]+[- ](storey|story|floor)s?/g,
      " ",
    );
    const count = numberBefore(bare.slice(0, bare.search(rule.re)));
    const params: Record<string, ParamValue> = {};
    const area = clause.match(/(\d+(?:\.\d+)?)\s*(m2|m²|sq ?m|square met)/);
    const ha = clause.match(/(\d+(?:\.\d+)?)\s*(ha|hectare)/);
    const storeys = clause.match(
      /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[- ](storey|story|floor)/,
    );
    const length = clause.match(/(\d+(?:\.\d+)?)\s*(km|m)\b(?!²|2)/);
    if (rule.type === "building") {
      if (area) params.gfaOverrideM2 = Number(area[1]);
      if (storeys)
        params.storeys = Number(storeys[1]) || WORDS[storeys[1]!] || 1;
    }
    if (rule.type === "park") {
      if (ha) params.areaM2 = Number(ha[1]) * 10_000;
      else if (area) params.areaM2 = Number(area[1]);
    }
    if (rule.type === "road" && length)
      params.lengthM = Number(length[1]) * (length[2] === "km" ? 1000 : 1);
    const added: PlannedInput[] = [];
    for (let i = 0; i < count; i++)
      added.push({
        type: rule.type,
        subtype: rule.subtype,
        params: { ...params },
      });
    out.push(...added);
    if (rule.type === "building") {
      lastBuilding = added;
      amenities(clause.replace(rule.re, " "), added);
    } else lastBuilding = [];
  }
  return out;
}
