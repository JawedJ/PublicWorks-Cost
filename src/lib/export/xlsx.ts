import type { Worksheet } from "exceljs";
import type { ReportModel } from "./report-data";

// P5.3 (SPEC 14): Excel workbook with Summary, Line Items (with sources),
// Assumptions, Scenarios and Flags sheets. ExcelJS is loaded on demand.

const CAD = '"$"#,##0';
const PCT = "0%";

function header(ws: Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF4F4F5" },
  };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildReportXlsx(r: ReportModel): Promise<Blob> {
  const { Workbook } = (await import("exceljs")).default;
  const wb = new Workbook();
  wb.creator = "PublicWorks Cost";
  wb.created = new Date();

  // Summary: headline, build-up, components, categories.
  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { width: 44 },
    { width: 20 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 10 },
  ];
  const title = sum.addRow([r.projectName]);
  title.font = { bold: true, size: 16 };
  sum.addRow([
    `${r.municipality} · prepared ${r.generatedOn} · start ${r.startDate}`,
  ]);
  sum.addRow([]);
  const kv = (label: string, value: number | string, fmt?: string) => {
    const row = sum.addRow([label, value]);
    if (fmt) row.getCell(2).numFmt = fmt;
    return row;
  };
  const section = (label: string) => {
    sum.addRow([]);
    sum.addRow([label]).font = { bold: true, size: 12 };
  };
  kv("Estimated cost (P50)", r.headline.p50, CAD).font = { bold: true };
  kv("P10", r.headline.p10, CAD);
  kv("P80", r.headline.p80, CAD);
  kv("P90", r.headline.p90, CAD);
  kv("Estimate class", r.headline.estimateClass);
  kv("Expected accuracy", `${r.headline.lowPct}% to +${r.headline.highPct}%`);
  kv("Recommended contingency", r.risk.contingency, CAD);
  kv("Probability of exceeding P50", r.risk.overrunProbability, PCT);

  section("Executive summary");
  const s = sum.addRow([r.summary]);
  sum.mergeCells(s.number, 1, s.number, 7);
  s.getCell(1).alignment = { wrapText: true, vertical: "top" };
  s.height = 90;

  section("Cost build-up");
  for (const row of r.costBuildUp) kv(row.label, row.amount, CAD);

  section("Components");
  sum.addRow([
    "Component",
    "Type",
    "Class",
    "P10",
    "P50",
    "P90",
    "Share",
  ]).font = { bold: true };
  for (const c of r.components) {
    const row = sum.addRow([
      c.name,
      c.type,
      c.estimateClass,
      c.p10,
      c.p50,
      c.p90,
      c.share,
    ]);
    [4, 5, 6].forEach((i) => (row.getCell(i).numFmt = CAD));
    row.getCell(7).numFmt = PCT;
  }

  section("Direct cost by category");
  for (const c of r.categories) kv(c.category, c.total, CAD);

  section("Data sources");
  for (const src of r.sources) sum.addRow([src]);

  // Line items, with live totals so edits recalculate.
  const li = wb.addWorksheet("Line Items");
  li.columns = [
    { header: "Component", key: "component", width: 28 },
    { header: "Category", key: "category", width: 16 },
    { header: "Description", key: "description", width: 40 },
    {
      header: "Quantity",
      key: "quantity",
      width: 12,
      style: { numFmt: "#,##0.##" },
    },
    { header: "Unit", key: "unit", width: 8 },
    {
      header: "Unit price low",
      key: "unitPriceLow",
      width: 14,
      style: { numFmt: '"$"#,##0.00' },
    },
    {
      header: "Unit price",
      key: "unitPrice",
      width: 14,
      style: { numFmt: '"$"#,##0.00' },
    },
    {
      header: "Unit price high",
      key: "unitPriceHigh",
      width: 14,
      style: { numFmt: '"$"#,##0.00' },
    },
    { header: "Total", key: "total", width: 16, style: { numFmt: CAD } },
    { header: "Quantity source", key: "quantitySource", width: 36 },
    { header: "Price source", key: "unitPriceSource", width: 44 },
    { header: "Overridden", key: "overridden", width: 14 },
    { header: "Low confidence", key: "lowConfidence", width: 14 },
  ];
  header(li);
  r.lineItems.forEach((l, i) => {
    const n = i + 2;
    li.addRow({
      ...l,
      // Live formula where quantity × price is the whole story (not lump
      // allowances or factored items); otherwise the engine's total.
      total:
        Math.abs(l.quantity * l.unitPrice - l.total) < 1
          ? { formula: `D${n}*G${n}`, result: l.total }
          : l.total,
      lowConfidence: l.lowConfidence ? "Yes" : "",
    });
  });
  const last = r.lineItems.length + 1;
  const tot = li.addRow({
    description: "Total direct cost",
    total: {
      formula: `SUM(I2:I${last})`,
      result: r.lineItems.reduce((a, l) => a + l.total, 0),
    },
  });
  tot.font = { bold: true };
  li.autoFilter = { from: "A1", to: `M${last}` };

  // Assumptions: project settings, then every parameter with its source.
  const as = wb.addWorksheet("Assumptions");
  as.columns = [
    { header: "Component", key: "component", width: 28 },
    { header: "Parameter", key: "parameter", width: 34 },
    { header: "Value", key: "value", width: 28 },
    { header: "Source", key: "source", width: 16 },
    { header: "Evidence", key: "evidence", width: 50 },
  ];
  header(as);
  for (const st of r.settings)
    as.addRow({
      component: "Project",
      parameter: st.label,
      value: st.value,
      source: "Project settings",
    });
  for (const a of r.assumptions) as.addRow(a);

  const sc = wb.addWorksheet("Scenarios");
  sc.columns = [
    { header: "Scenario", key: "name", width: 28 },
    { header: "Changes from baseline", key: "changes", width: 60 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  header(sc);
  for (const x of r.scenarios) sc.addRow(x);

  const fl = wb.addWorksheet("Flags");
  fl.columns = [
    { header: "Severity", key: "severity", width: 10 },
    { header: "Flag", key: "title", width: 36 },
    { header: "Explanation", key: "explanation", width: 70 },
    { header: "Cost effect", key: "costEffect", width: 40 },
    { header: "Applies to", key: "where", width: 30 },
  ];
  header(fl);
  for (const f of r.flags) fl.addRow(f);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
