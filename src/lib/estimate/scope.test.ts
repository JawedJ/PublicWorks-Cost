import { describe, expect, it } from "vitest";
import { northgateEstimate as est } from "@/lib/fixtures";
import { scopeEstimate } from "./scope";

describe("scopeEstimate", () => {
  it("whole project when nothing (or an unknown id) is selected", () => {
    for (const id of [null, "missing"]) {
      const s = scopeEstimate(est, id);
      expect(s.component).toBeNull();
      expect(s.p50).toBe(est.distribution.p50);
      expect(s.lineItems).toBe(est.lineItems);
      expect(s.flags).toBe(est.flags);
    }
  });

  it("single component: its own range, class, line items and flags", () => {
    const c = est.components[0];
    const s = scopeEstimate(est, c.componentId);
    expect(s.component).toBe(c);
    expect([s.p10, s.p50, s.p90]).toEqual([c.p10, c.p50, c.p90]);
    expect(s.estimateClass).toBe(c.estimateClass);
    expect(s.lineItems.length).toBeGreaterThan(0);
    expect(s.lineItems.every((l) => l.componentId === c.componentId)).toBe(
      true,
    );
    expect(
      s.flags.every(
        (f) =>
          f.componentIds.length === 0 || f.componentIds.includes(c.componentId),
      ),
    ).toBe(true);
  });
});
