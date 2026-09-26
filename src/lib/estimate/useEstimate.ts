"use client";

import { useEffect, useMemo, useState } from "react";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import type { Estimate } from "@/lib/schemas";
import { selectProject } from "@/lib/store/projectSlice";
import { useStore } from "@/lib/store/store";
import { measureProject } from "@/lib/geo/measure";

// TEAM.md 3.5: recomputes the estimate when the project changes, debounced.
// The engine takes ~50 ms for 5,000 iterations, so it runs on the main thread.

const DEBOUNCE_MS = 150;
/** Fixed seed so the same design always shows the same numbers. */
const SEED = 20260926;

// Several views call useEstimate (panel, map colours, 3D scene, component list);
// they share one result per design state instead of each running the engine.
type Inputs = {
  components: unknown;
  areaBoundary: unknown;
  project: unknown;
};
let cache: { inputs: Inputs; estimate: Estimate | null } | null = null;
const same = (a: Inputs, b: Inputs) =>
  a.components === b.components &&
  a.areaBoundary === b.areaBoundary &&
  a.project === b.project;

/** Estimate for the current store state, computed once per state. */
function compute(): Estimate | null {
  const state = useStore.getState();
  const inputs: Inputs = {
    components: state.components,
    areaBoundary: state.areaBoundary,
    project: state.project,
  };
  if (cache && same(cache.inputs, inputs)) return cache.estimate;
  const p = selectProject(state);
  let estimate: Estimate | null = null;
  try {
    estimate = computeEstimate(p, measureProject(p), refData, { seed: SEED });
  } catch (err) {
    console.error("Estimate failed", err);
  }
  cache = { inputs, estimate };
  return estimate;
}

export function useEstimate(): {
  estimate: Estimate | null;
  computing: boolean;
} {
  const components = useStore((s) => s.components);
  const areaBoundary = useStore((s) => s.areaBoundary);
  const project = useStore((s) => s.project);
  const inputs = useMemo(
    () => ({ components, areaBoundary, project }),
    [components, areaBoundary, project],
  );
  const [result, setResult] = useState<{
    for: typeof inputs;
    estimate: Estimate | null;
  } | null>(() =>
    cache && same(cache.inputs, inputs)
      ? { for: inputs, estimate: cache.estimate }
      : null,
  );

  useEffect(() => {
    const timer = setTimeout(
      () => setResult({ for: inputs, estimate: compute() }),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [inputs]);

  return {
    estimate: result?.estimate ?? null,
    computing: result?.for !== inputs,
  };
}
