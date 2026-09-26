import type { jsPDF } from "jspdf";
import {
  formatCompact as compact,
  formatMoney as money,
  type ReportModel,
} from "./report-data";

// P5.2 (SPEC 14): PDF council report, built in the browser with jsPDF and
// jspdf-autotable (loaded on demand). Letter portrait, English.

const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const ACCENT: [number, number, number] = [13, 148, 136];
const LIGHT: [number, number, number] = [228, 228, 231];
const MARGIN = 48;

/** The standard PDF fonts only cover Latin-1 (plus a few WinAnsi extras). */
const clean = (s: string) =>
  s
    .replace(/[→⟶]/g, "->")
    .replace(/[≈]/g, "~")
    .replace(/[≤]/g, "<=")
    .replace(/[≥]/g, ">=")
    .replace(/[−]/g, "-")
    .replace(/[^\x00-\xff–—‘’“”…•€]/g, "");

export async function buildReportPdf(
  r: ReportModel,
  mapPng: string | null,
): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const inner = W - MARGIN * 2;
  let y = MARGIN;

  const endY = () =>
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (h: number) => {
    if (y + h > H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const heading = (text: string) => {
    ensure(40);
    y += 10;
    doc
      .setFont("helvetica", "bold")
      .setFontSize(13)
      .setTextColor(...INK);
    doc.text(clean(text), MARGIN, y);
    doc.setDrawColor(...ACCENT).setLineWidth(1.5);
    doc.line(MARGIN, y + 5, MARGIN + 36, y + 5);
    y += 20;
  };
  const para = (text: string, size = 10, color = INK) => {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(size)
      .setTextColor(...color);
    const lines = doc.splitTextToSize(clean(text), inner) as string[];
    for (const line of lines) {
      ensure(size * 1.4);
      doc.text(line, MARGIN, y);
      y += size * 1.4;
    }
    y += 4;
  };
  const table = (
    head: string[],
    body: (string | number)[][],
    opts: { right?: number[]; widths?: Record<number, number> } = {},
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [head.map(clean)],
      body: body.map((row) => row.map((c) => clean(String(c)))),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 4,
        textColor: INK,
        lineColor: LIGHT,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [244, 244, 245],
        textColor: INK,
        fontStyle: "bold",
      },
      columnStyles: Object.fromEntries([
        ...(opts.right ?? []).map((i) => [i, { halign: "right" as const }]),
        ...Object.entries(opts.widths ?? {}).map(([i, w]) => [
          Number(i),
          { cellWidth: w },
        ]),
      ]),
      // Money columns: right-align the header to match.
      didParseCell: (data) => {
        if (data.section === "head" && opts.right?.includes(data.column.index))
          data.cell.styles.halign = "right";
      },
    });
    y = endY() + 16;
  };

  // --- Cover ---
  doc.setFillColor(...ACCENT).rect(0, 0, W, 6, "F");
  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .setTextColor(...MUTED);
  doc.text("CAPITAL COST ESTIMATE  ·  COUNCIL REPORT", MARGIN, y + 8);
  y += 36;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(24)
    .setTextColor(...INK);
  for (const line of doc.splitTextToSize(
    clean(r.projectName),
    inner,
  ) as string[]) {
    doc.text(line, MARGIN, y);
    y += 28;
  }
  doc
    .setFont("helvetica", "normal")
    .setFontSize(11)
    .setTextColor(...MUTED);
  doc.text(
    clean(
      [
        r.municipality,
        `Prepared ${r.generatedOn}`,
        `Construction start ${r.startDate}`,
      ]
        .filter(Boolean)
        .join("   |   "),
    ),
    MARGIN,
    y,
  );
  y += 24;

  // Headline box.
  doc.setFillColor(244, 244, 245).roundedRect(MARGIN, y, inner, 92, 6, 6, "F");
  doc.setFontSize(9).setTextColor(...MUTED);
  doc.text("ESTIMATED COST (P50)", MARGIN + 16, y + 22);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(28)
    .setTextColor(...INK);
  doc.text(money.format(r.headline.p50), MARGIN + 16, y + 54);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .setTextColor(...MUTED);
  doc.text(
    `Likely range ${money.format(r.headline.p10)} – ${money.format(r.headline.p90)} (P10–P90)`,
    MARGIN + 16,
    y + 76,
  );
  doc
    .setFont("helvetica", "bold")
    .setFontSize(18)
    .setTextColor(...ACCENT);
  doc.text(`Class ${r.headline.estimateClass}`, W - MARGIN - 16, y + 50, {
    align: "right",
  });
  doc
    .setFont("helvetica", "normal")
    .setFontSize(9)
    .setTextColor(...MUTED);
  doc.text(
    `Accuracy ${r.headline.lowPct}% to +${r.headline.highPct}%`,
    W - MARGIN - 16,
    y + 66,
    { align: "right" },
  );
  y += 108;

  if (mapPng) {
    const props = doc.getImageProperties(mapPng);
    const maxH = H - y - MARGIN - (r.sampleData ? 60 : 36);
    let w = inner;
    let h = (props.height / props.width) * w;
    if (h > maxH) {
      h = Math.max(120, maxH);
      w = (props.width / props.height) * h;
    }
    doc.addImage(
      mapPng,
      "PNG",
      MARGIN + (inner - w) / 2,
      y,
      w,
      h,
      undefined,
      "FAST",
    );
    doc.setDrawColor(...LIGHT).setLineWidth(0.5);
    doc.rect(MARGIN + (inner - w) / 2, y, w, h);
    y += h + 12;
    doc.setFontSize(8).setTextColor(...MUTED);
    doc.text(
      "Site plan as drawn. Basemap © OpenStreetMap contributors.",
      MARGIN,
      y,
    );
    y += 14;
  }
  if (r.sampleData) {
    ensure(30);
    para(
      "Prepared with sample and public reference data for planning purposes. Not a tender or engineer's estimate.",
      8.5,
      MUTED,
    );
  }

  // --- Executive summary ---
  doc.addPage();
  y = MARGIN;
  heading("Executive summary");
  para(r.summary, 10.5);
  if (r.description) para(`Project brief: "${r.description}"`, 9, MUTED);

  heading("Cost build-up");
  table(
    ["Item", "Amount (CAD)"],
    r.costBuildUp.map((row) => [row.label, money.format(row.amount)]),
    { right: [1] },
  );

  heading("Risk and contingency");
  table(
    ["Measure", "Value"],
    [
      ["P10 (optimistic)", money.format(r.headline.p10)],
      ["P50 (most likely)", money.format(r.headline.p50)],
      ["P80 (recommended budget ceiling)", money.format(r.headline.p80)],
      ["P90 (pessimistic)", money.format(r.headline.p90)],
      [
        "Recommended contingency",
        `${money.format(r.risk.contingency)} (${Math.round(r.risk.contingencyPct)}%)`,
      ],
      [
        "Probability of exceeding P50",
        `${Math.round(r.risk.overrunProbability * 100)}%`,
      ],
      [
        "Typical overrun for similar projects",
        `${Math.round(r.risk.typicalOverrunPct)}%`,
      ],
    ],
    { right: [1] },
  );
  if (r.risk.note) para(r.risk.note, 8.5, MUTED);

  // --- Components ---
  // Simple share bars, largest first, kept on one page with their heading.
  const byCost = [...r.components].sort((a, b) => b.p50 - a.p50);
  const barMax = Math.max(...byCost.map((c) => c.p50), 1);
  ensure(byCost.length * 16 + 48);
  heading("Components");
  for (const c of byCost) {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...INK);
    doc.text(clean(c.name).slice(0, 34), MARGIN, y + 8);
    const bw = ((inner - 230) * c.p50) / barMax;
    doc
      .setFillColor(...ACCENT)
      .roundedRect(MARGIN + 160, y, Math.max(bw, 2), 10, 2, 2, "F");
    doc.setTextColor(...MUTED);
    doc.text(
      `${compact.format(c.p50)} · ${Math.round(c.share * 100)}%`,
      W - MARGIN,
      y + 8,
      { align: "right" },
    );
    y += 16;
  }
  y += 8;
  table(
    ["Component", "Type", "Class", "P10", "P50", "P90", "Share"],
    byCost.map((c) => [
      c.name,
      c.type,
      c.estimateClass,
      compact.format(c.p10),
      compact.format(c.p50),
      compact.format(c.p90),
      `${Math.round(c.share * 100)}%`,
    ]),
    { right: [3, 4, 5, 6] },
  );
  if (r.undrawnComponents > 0)
    para(
      `${r.undrawnComponents} planned component(s) are not drawn yet and are not included.`,
      8.5,
      MUTED,
    );

  heading("Direct cost by category");
  table(
    ["Category", "Direct cost (CAD)"],
    r.categories.map((c) => [c.category, money.format(c.total)]),
    { right: [1] },
  );

  if (r.drivers.length) {
    heading("Main cost drivers");
    table(
      ["Driver", "Low case", "High case"],
      r.drivers.map((d) => [
        d.label,
        `${d.low >= 0 ? "+" : ""}${compact.format(d.low)}`,
        `${d.high >= 0 ? "+" : ""}${compact.format(d.high)}`,
      ]),
      { right: [1, 2] },
    );
  }

  heading("Flags and required approvals");
  if (r.flags.length === 0) para("No flags raised.", 9, MUTED);
  else
    table(
      ["Severity", "Flag", "Details", "Applies to"],
      groupFlags(r.flags).map((f) => [
        f.severity,
        f.title,
        [f.explanation, f.costEffect].filter(Boolean).join(" "),
        f.where,
      ]),
      { widths: { 0: 52, 1: 110, 3: 100 } },
    );

  if (r.scenarios.length > 1) {
    heading("Scenarios");
    table(
      ["Scenario", "Changes", "Notes"],
      r.scenarios.map((s) => [s.name, s.changes, s.notes]),
    );
  }

  heading("Assumptions");
  table(
    ["Setting", "Value"],
    r.settings.map((s) => [s.label, s.value]),
  );
  table(
    ["Component", "Parameter", "Value", "Source"],
    r.assumptions.map((a) => [a.component, a.parameter, a.value, a.source]),
  );

  heading("Data sources");
  for (const s of r.sources) para(`- ${s}`, 9);
  para(
    "Full line items with quantities, unit prices and their sources are in the accompanying Excel workbook.",
    9,
    MUTED,
  );

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8)
      .setTextColor(...MUTED);
    doc.text(clean(`${r.projectName} - cost estimate`), MARGIN, H - 24);
    doc.text(`Page ${i} of ${pages}`, W - MARGIN, H - 24, { align: "right" });
  }

  return doc.output("blob");
}

/** Same flag on several components (e.g. "Near a school") → one row. */
function groupFlags(flags: ReportModel["flags"]): ReportModel["flags"] {
  const out = new Map<string, ReportModel["flags"][number]>();
  for (const f of flags) {
    const key = `${f.severity}|${f.title}`;
    const seen = out.get(key);
    if (!seen) out.set(key, { ...f });
    else if (!seen.where.includes(f.where)) seen.where += `, ${f.where}`;
  }
  return [...out.values()];
}
