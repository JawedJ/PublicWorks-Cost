# Extracts zone regulations from the City of Waterloo Zoning By-law 2018-050.
# Input: the by-law PDF converted to text with "=== PAGE n" markers (e.g. macOS PDFKit or pdftotext);
# output: waterloo-rules-raw.json, reshaped into src/data/zoning/waterloo-rules.json.
# Usage: python3 scripts/extract-waterloo-zone-rules.py  (run next to wbylaw.txt)
import re, json
raw = open("wbylaw.txt", encoding="utf-8").read()
# Track page numbers per line.
lines = raw.split("\n")
page_of = []; page = 0
for l in lines:
    m = re.match(r"=== PAGE (\d+)", l)
    if m: page = int(m.group(1))
    page_of.append(page)
# Drop page headers.
clean = []
for i, l in enumerate(lines):
    if l.startswith("=== PAGE") or l.startswith("CITY OF WATERLOO") or l.startswith("ZBL 2018"): continue
    clean.append((page_of[i], l))
text_lines = [l for _, l in clean]
pages = [p for p, _ in clean]

# Zone sections: "7.1 Residential One (R1) Zone" style headers followed by "Permitted Uses".
zones = {}
hdr = re.compile(r"^(\d{1,2}\.\d{1,2})\s+(.+?)\s*\(([A-Z0-9\-]+)\)\s*Zone\s*$", re.I)
starts = []
for i, l in enumerate(text_lines):
    m = hdr.match(l.strip())
    if m and i + 3 < len(text_lines) and any("Permitted Uses" in text_lines[j] for j in range(i, min(i + 4, len(text_lines)))):
        starts.append((i, m.group(1), m.group(2).strip(), m.group(3)))
starts.append((len(text_lines), None, None, None))
for (i, sec, name, code), (j, *_ ) in zip(starts, starts[1:]):
    body = text_lines[i:j]
    joined = "\n".join(body)
    # Uses: bullets before "Performance Standards".
    ps = joined.find("Performance Standards")
    uses_txt = joined[:ps if ps > 0 else len(joined)]
    uses = []
    for u in re.findall(r"^(?:•|[a-z]\.\))\s*(.+)$", uses_txt, re.M):
        uses.append(re.sub(r"\s+", " ", u).strip())
    regs = re.sub(r"[ \t]+", " ", joined[ps:] if ps > 0 else "")
    flat = re.sub(r"\s*\n\s*", " ", regs)
    def num(pattern):
        m = re.search(pattern, flat, re.I)
        return float(m.group(1)) if m else None
    street = num(r"(?:STREET LINE|FRONT YARD) setback \(minimum\) ([\d.]+) metres")
    side = num(r"SIDE YARD setback \(minimum\) ([\d.]+) metres")
    rear = num(r"REAR YARD setback \(minimum\) ([\d.]+) metres")
    cover = num(r"COVERAGE(?:, all BUILDINGS)? \(maximum\) ([\d.]+) ?%")
    landscape = num(r"LANDSCAPED? OPEN SPACE \(minimum\) ([\d.]+) ?%")
    height = None
    m = re.search(r"BUILDING HEIGHT \(maximum\) ([\d.]+) metres(?: and (\d+) STOREYS)?", flat, re.I)
    if m: height = {"m": float(m.group(1)), **({"storeys": int(m.group(2))} if m.group(2) else {})}
    other = re.search(r"BUILDING HEIGHT \(maximum\)[^%]{0,120}?([\d.]+) metres in all other instances", flat, re.I)
    if other: height = {"m": float(other.group(1))}
    by_suffix = bool(re.search(r"BUILDING HEIGHT \(maximum\) In metres, equal to the numerical suffix", flat, re.I))
    dflt = num(r"Where no suffix is shown on the Zoning Map, the maximum BUILDING HEIGHT shall be ([\d.]+) metres")
    if by_suffix and dflt: height = {"m": dflt}
    storeys_only = num(r"BUILDING HEIGHT \(maximum\) (\d+) STOREYS")
    # Suffix heights anywhere in the section: "C7-60 = 60 metres and 18 STOREYS" or table columns.
    suffix = {}
    for mm in re.finditer(r"(\d+(?:\.\d+)?) metres and (\d+) STOREYS", flat):
        suffix[mm.group(1)] = int(mm.group(2))
    zones.setdefault(code, {
        "code": code, "name": name.title(), "section": sec, "page": pages[i],
        "uses": uses,
        "setbacks": {k: v for k, v in (("street", street), ("side", side), ("rear", rear)) if v is not None},
        **({"maxLotCoveragePct": cover} if cover else {}),
        **({"minLandscapedPct": landscape} if landscape else {}),
        **({"height": height} if height else {}),
        **({"heightByMetres": suffix} if suffix else {}),
        **({"heightFromSuffix": True} if by_suffix or suffix else {}),
    })
json.dump(zones, open("waterloo-rules-raw.json", "w"), indent=1)
for c, z in zones.items():
    print(c, "|", z["name"], "| p", z["page"], "| uses", len(z["uses"]), "| setbacks", z["setbacks"], "| cover", z.get("maxLotCoveragePct"), "| land", z.get("minLandscapedPct"), "| h", z.get("height"), "| sfx", z.get("heightByMetres"))
