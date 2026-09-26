import { describe, expect, it } from "vitest";
import {
  northgateEstimate as est,
  northgateProject as project,
} from "@/lib/fixtures";
import { buildReportXlsx } from "./xlsx";
import { buildReportPdf } from "./pdf";
import { buildReport, reportBaseName } from "./report-data";

const r = buildReport(project, project.components, est, new Date("2026-09-26"));

describe("buildReport", () => {
  it("carries the headline, components and every line item", () => {
    expect(r.headline.p50).toBe(est.distribution.p50);
    expect(r.components).toHaveLength(est.components.length);
    expect(r.lineItems).toHaveLength(est.lineItems.length);
    expect(r.generatedOn).toBe("2026-09-26");
  });

  it("writes a summary using the estimate's own numbers", () => {
    expect(r.summary).toContain(`Class ${est.estimateClass}`);
    expect(r.summary).toContain(project.name);
  });

  it("cost build-up ends with base plus contingency", () => {
    const last = r.costBuildUp.at(-1)!;
    expect(last.amount).toBeCloseTo(
      est.baseEstimate + est.recommendedContingency.amount,
    );
  });

  it("lists answered parameters with readable values and sources", () => {
    expect(r.assumptions.length).toBeGreaterThan(0);
    for (const a of r.assumptions) {
      expect(a.value).not.toBe("");
      expect(a.source).not.toBe("");
    }
  });

  it("names files from the project", () => {
    expect(reportBaseName("Northgate hub!")).toBe(
      "northgate-hub-cost-estimate",
    );
  });
});

describe("export files", () => {
  it("builds a PDF", async () => {
    const blob = await buildReportPdf(r, null);
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(head).toBe("%PDF-");
  });

  it("builds an xlsx (zip)", async () => {
    const blob = await buildReportXlsx(r);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect([...head]).toEqual([0x50, 0x4b]);
  });
});
