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
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const p = selectProject(useStore.getState());
      let estimate: Estimate | null = null;
      try {
        estimate = computeEstimate(p, measureProject(p), refData, {
          seed: SEED,
        });
      } catch (err) {
        console.error("Estimate failed", err);
      }
      setResult({ for: inputs, estimate });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputs]);

  return {
    estimate: result?.estimate ?? null,
    computing: result?.for !== inputs,
  };
}
