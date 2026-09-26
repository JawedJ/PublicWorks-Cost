import type { RegionKey } from "@/lib/schemas";

// Picks the pricing region (a key in regional-factors.json) from a place name,
// e.g. the municipality typed on the build list or its geocoded label
// ("Hamilton, Ontario, Canada"). Unknown places return undefined, so the
// project keeps its current region (Ontario average by default).

const PLACES: [RegionKey, string[]][] = [
  [
    "toronto",
    ["toronto", "scarborough", "etobicoke", "north york", "east york"],
  ],
  [
    "peel_york_halton",
    [
      "peel",
      "mississauga",
      "brampton",
      "caledon",
      "york region",
      "markham",
      "vaughan",
      "richmond hill",
      "newmarket",
      "aurora",
      "king city",
      "whitchurch-stouffville",
      "stouffville",
      "east gwillimbury",
      "georgina",
      "halton",
      "oakville",
      "burlington",
      "milton",
      "halton hills",
      "georgetown",
    ],
  ],
  [
    "durham",
    [
      "durham",
      "oshawa",
      "whitby",
      "ajax",
      "pickering",
      "clarington",
      "bowmanville",
      "uxbridge",
      "scugog",
      "brock",
    ],
  ],
  ["ottawa", ["ottawa", "kanata", "nepean", "orleans", "gloucester"]],
  ["hamilton", ["hamilton", "stoney creek", "ancaster", "dundas"]],
  [
    "waterloo_region",
    ["waterloo", "kitchener", "cambridge", "woolwich", "wilmot", "wellesley"],
  ],
  ["simcoe_barrie", ["simcoe", "barrie", "orillia", "innisfil", "collingwood"]],
  [
    "niagara",
    [
      "niagara",
      "st. catharines",
      "st catharines",
      "welland",
      "thorold",
      "grimsby",
      "fort erie",
      "port colborne",
      "lincoln",
    ],
  ],
  ["london_middlesex", ["london", "middlesex", "strathroy"]],
  [
    "windsor_essex",
    ["windsor", "essex", "lasalle", "tecumseh", "leamington", "amherstburg"],
  ],
  ["kingston", ["kingston"]],
  ["greater_sudbury", ["sudbury"]],
  ["north_bay", ["north bay"]],
  [
    "sault_ste_marie",
    ["sault ste. marie", "sault ste marie", "sault sainte marie"],
  ],
  ["timmins", ["timmins"]],
  ["thunder_bay", ["thunder bay"]],
  ["kenora", ["kenora"]],
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS = PLACES.map(
  ([key, names]) =>
    [
      key,
      new RegExp(`(^|[^a-z])(${names.map(escape).join("|")})($|[^a-z])`),
    ] as const,
);

/** The region for a place name, or undefined when none of ours matches. */
export function regionForPlace(place: string): RegionKey | undefined {
  const text = place.toLowerCase();
  // Outside Ontario (e.g. "London, England" never reaches here; "Windsor, Nova Scotia" can).
  const province =
    /\b(british columbia|alberta|saskatchewan|manitoba|quebec|québec|new brunswick|nova scotia|prince edward island|newfoundland|yukon|northwest territories|nunavut)\b/;
  if (province.test(text)) return undefined;
  // The first place named wins ("Waterloo, Ontario" → Waterloo, not a later match).
  let best: { key: RegionKey; at: number } | undefined;
  for (const [key, re] of MATCHERS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { key, at: m.index };
  }
  return best?.key;
}
