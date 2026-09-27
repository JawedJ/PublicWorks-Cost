import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { northgateEstimate as est, northgateProject as project } from "@/lib/fixtures";
import { buildReportPdf } from "./pdf";
import { buildReport } from "./report-data";
it("writes", async () => {
  const r = buildReport(project, project.components, est, new Date("2026-09-26"));
  const blob = await buildReportPdf(r, null);
  writeFileSync("/Users/jawedjamshid/.claude/jobs/f230e144/tmp/report.pdf", Buffer.from(await blob.arrayBuffer()));
});
