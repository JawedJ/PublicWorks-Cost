import { afterEach, describe, expect, it, vi } from "vitest";
import type { Estimate } from "@/lib/schemas";
import { loadQuestions } from "./questions";

const estimate = (ids: string[]) =>
  ({
    components: ids.map((componentId) => ({ componentId, share: 0.5 })),
    flags: [],
  }) as unknown as Estimate;

describe("loadQuestions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks once per set of components; refresh or a new component asks again", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await loadQuestions(estimate(["a"]));
    await loadQuestions(estimate(["a"]));
    expect(fetch).toHaveBeenCalledTimes(1);
    await loadQuestions(estimate(["a"]), { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    await loadQuestions(estimate(["a", "b"]));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
