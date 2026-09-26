import { useSyncExternalStore } from "react";
import { fallbackQuestions } from "@/lib/questions/rank";
import {
  type Estimate,
  type ParamValue,
  type QuestionsRequest,
  type QuestionsResponse,
  QuestionsResponseSchema,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// Client helpers for P7.5: build the request from the store + estimate, call
// /api/ai/questions (never throws; local ranking fallback), save answers.

/** Flags from the site lookup, as short notes for the AI. */
const SITE_CODES = new Set([
  "waterway_permit",
  "in_water_permit",
  "rail_approval",
  "near_school",
  "near_hospital",
  "floodplain",
]);

export function buildQuestionsRequest(estimate: Estimate): QuestionsRequest {
  const { components, project } = useStore.getState();
  const shares = new Map(
    estimate.components.map((c) => [c.componentId, c.share]),
  );
  return {
    municipality: project.municipality || undefined,
    components: components
      .filter((c) => shares.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        subtype: c.subtype,
        share: shares.get(c.id)!,
        params: c.params,
        sources: Object.fromEntries(
          Object.entries(c.paramMeta).map(([k, m]) => [k, m.source]),
        ),
      })),
    siteNotes: estimate.flags
      .filter((f) => SITE_CODES.has(f.code))
      .map((f) => f.explanation.en.slice(0, 300))
      .slice(0, 20),
  };
}

export async function requestQuestions(
  req: QuestionsRequest,
): Promise<QuestionsResponse> {
  try {
    const res = await fetch("/api/ai/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.ok) return QuestionsResponseSchema.parse(await res.json());
    return {
      questions: fallbackQuestions(req),
      source: "fallback",
      notice: res.status === 429 ? "ai_busy" : "ai_unavailable",
    };
  } catch {
    return {
      questions: fallbackQuestions(req),
      source: "fallback",
      notice: "ai_unavailable",
    };
  }
}

// Questions are generated in the background once per project and set of
// components (not every time the tab opens) and kept here, outside the panel,
// so they survive switching tabs. Session memory only, like the project.

type QuestionsState = {
  /** Project id + estimated component ids the questions were asked for. */
  key: string | null;
  res: QuestionsResponse | null;
  loading: boolean;
  skipped: ReadonlySet<string>;
};

let state: QuestionsState = {
  key: null,
  res: null,
  loading: false,
  skipped: new Set(),
};
const listeners = new Set<() => void>();

function setState(patch: Partial<QuestionsState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current questions, loading flag and skipped ids. */
export function useQuestions(): QuestionsState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

function keyFor(estimate: Estimate): string {
  const ids = estimate.components.map((c) => c.componentId).sort();
  return `${useStore.getState().project.id}:${ids.join(",")}`;
}

/**
 * Asks for questions unless they were already asked for this project and
 * components (or `refresh`). Earlier questions stay visible while it runs.
 */
export async function loadQuestions(
  estimate: Estimate,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<void> {
  const key = keyFor(estimate);
  if (!refresh && key === state.key) return;
  const newProject = state.key?.split(":")[0] !== key.split(":")[0];
  setState({
    key,
    loading: true,
    ...(newProject && { res: null }),
    ...((refresh || newProject) && { skipped: new Set<string>() }),
  });
  const res = await requestQuestions(buildQuestionsRequest(estimate));
  // A newer request (other project or components) replaced this one.
  if (state.key !== key) return;
  setState({ res, loading: false });
}

/** Hides a question for this session (until "Ask again"). */
export function skipQuestion(id: string) {
  setState({ skipped: new Set([...state.skipped, id]) });
}

/** Saves an answer on one or more components as the user's value (one undo step). */
export function answerQuestion(
  componentIds: string[],
  paramId: string,
  value: ParamValue,
) {
  const { components, updateComponents } = useStore.getState();
  updateComponents(
    components
      .filter((c) => componentIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        patch: {
          params: { ...c.params, [paramId]: value },
          paramMeta: { ...c.paramMeta, [paramId]: { source: "user" as const } },
        },
      })),
  );
}
