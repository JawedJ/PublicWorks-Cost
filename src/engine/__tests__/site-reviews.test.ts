import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import { northgateProject } from "@/lib/fixtures";
import { measureProject } from "@/lib/geo/measure";
import type { Project } from "@/lib/schemas";

const run = (p: Project) =>
  computeEstimate(p, measureProject(p), refData, { seed: 1 });

/** Northgate with every component's school review set. */
function reviewed(value: string, withDocument = true): Project {
  return {
    ...northgateProject,
    documents: withDocument
      ? [{ name: "traffic.pdf", extractedAt: "2026-09-26T00:00:00.000Z" }]
      : [],
    components: northgateProject.components.map((c) => ({
      ...c,
      params: { ...c.params, schoolReview: value },
      paramMeta: {
        ...c.paramMeta,
        schoolReview: {
          source: "ai_document" as const,
          evidence: 'traffic.pdf, p. 1: "School proximity is not a concern"',
        },
      },
    })),
  };
}

describe("site reviews", () => {
  const before = run(northgateProject);

  it("'no special measures' removes the school allowance and downgrades the flag", () => {
    const after = run(reviewed("no_measures", false));
    expect(before.lineItems.some((l) => l.id.endsWith(":site-school"))).toBe(
      true,
    );
    expect(after.lineItems.some((l) => l.id.endsWith(":site-school"))).toBe(
      false,
    );
    const school = after.flags.filter((f) => f.code === "near_school");
    expect(school.length).toBeGreaterThan(0);
    for (const f of school) {
      expect(f.severity).toBe("info");
      expect(f.explanation.en).toContain("traffic.pdf, p. 1");
    }
    expect(after.distribution.p50).toBeLessThan(before.distribution.p50);
  });

  it("'measures needed' keeps the allowance", () => {
    const after = run(reviewed("measures_needed", false));
    expect(after.lineItems.some((l) => l.id.endsWith(":site-school"))).toBe(
      true,
    );
  });

  it("answering (and having a document) raises the class and lowers the overrun risk", () => {
    const after = run(reviewed("no_measures"));
    const order = ["D", "C", "B", "A"];
    for (const c of after.components) {
      const was = before.components.find(
        (x) => x.componentId === c.componentId,
      )!;
      expect(order.indexOf(c.estimateClass)).toBeGreaterThanOrEqual(
        order.indexOf(was.estimateClass),
      );
    }
    expect(after.overrunRisk.typicalOverrunPct).toBeLessThan(
      before.overrunRisk.typicalOverrunPct,
    );
    expect(after.recommendedContingency.amount).toBeLessThan(
      before.recommendedContingency.amount,
    );
  });
});
