import type { StateCreator } from "zustand";
import {
  CURRENT_SCHEMA_VERSION,
  type ParamSource,
  type ParamValue,
  type Project,
  type ProjectSettings,
  type SiteContext,
  type ZoningContext,
} from "@/lib/schemas";
import { siteParamSuggestions } from "@/engine/site-params";
import { newId } from "./designSlice";
import type { Store } from "./store";

// Person B's slice: everything in a Project except its components and area
// boundary, which live in A's designSlice (SPEC Change log, P1.3 [A]).
// Param and override edits go through A's `updateComponent`, so they share
// the design undo history.

/** The project minus the parts held by designSlice. */
export type ProjectInfo = Omit<Project, "components" | "areaBoundary">;

export type ProjectInfoPatch = Partial<
  Pick<
    ProjectInfo,
    "name" | "description" | "municipality" | "region" | "location"
  >
>;

export type OverrideKind = "quantities" | "unitPrices";

/** Region used until the user or the prompt picks one; must exist in regional-factors.json (P2.4). */
export const DEFAULT_REGION = "ontario_average";
export const BASELINE_SCENARIO_ID = "baseline";

export const DEFAULT_SETTINGS: Omit<ProjectSettings, "startDate"> = {
  durationMonths: 12,
  // Placeholder until P2.13 derives the default from the BCPI trailing trend.
  escalationRate: 0.04,
  // Ontario municipalities: 13% HST less the full federal and 78% provincial rebates.
  taxRate: 0.0176,
  contingencyMode: "recommended",
  locale: "en",
};

export type ProjectSlice = {
  project: ProjectInfo;

  /** Starts an empty project (clears the design too). `name` comes from the UI, translated. */
  newProject: (init: { name: string } & ProjectInfoPatch) => void;
  /** Replaces the whole project, e.g. from a project file or demo. Clears undo history. */
  loadProject: (project: Project) => void;
  updateProjectInfo: (patch: ProjectInfoPatch) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  setSiteContext: (siteContext: SiteContext | undefined) => void;
  /** Stores the zone lookup for the buildings (SPEC 8.3). */
  setZoningContext: (zoningContext: ZoningContext | undefined) => void;
  setActiveScenario: (scenarioId: string) => void;
  /** Records a document the user had read (metadata only; the file isn't kept). */
  addDocument: (doc: Project["documents"][number]) => void;

  /** Sets one parameter and records where the value came from. One undo step. */
  setComponentParam: (
    componentId: string,
    paramId: string,
    value: ParamValue,
    source?: ParamSource,
    evidence?: string,
  ) => void;
  /** Removes a parameter so the engine falls back to its default. */
  clearComponentParam: (componentId: string, paramId: string) => void;
  /** Overrides a line item's quantity or unit price; `null` resets it. */
  setOverride: (
    componentId: string,
    kind: OverrideKind,
    lineItemId: string,
    value: number | null,
  ) => void;
  /** Clears all overrides on a component. */
  resetOverrides: (componentId: string) => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyScenario(): Project["scenarios"][number] {
  return {
    id: BASELINE_SCENARIO_ID,
    name: "Baseline",
    componentOverrides: {},
    addedComponents: [],
    removedComponentIds: [],
    shocks: {
      asphalt: 0,
      concrete: 0,
      steel: 0,
      pipe: 0,
      lumber: 0,
      labour: 0,
    },
  };
}

export function createProjectInfo(
  init: Partial<ProjectInfoPatch> = {},
): ProjectInfo {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name: "",
    description: "",
    municipality: "",
    region: DEFAULT_REGION,
    // Waterloo, Ontario; A's map moves this when the user searches.
    location: { lng: -80.5204, lat: 43.4643, zoom: 12 },
    settings: { ...DEFAULT_SETTINGS, startDate: today() },
    scenarios: [emptyScenario()],
    activeScenarioId: BASELINE_SCENARIO_ID,
    documents: [],
    createdAt: now,
    updatedAt: now,
    ...init,
  };
}

function without<T>(record: Record<string, T>, key: string) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/** The full Project from both slices, e.g. for the engine or a project file download. */
export function selectProject(state: Store): Project {
  return {
    ...state.project,
    components: state.components,
    ...(state.areaBoundary && { areaBoundary: state.areaBoundary }),
  };
}

export const createProjectSlice: StateCreator<Store, [], [], ProjectSlice> = (
  set,
  get,
) => {
  const updateInfo = (patch: Partial<ProjectInfo>) =>
    set((s) => ({
      project: { ...s.project, ...patch, updatedAt: new Date().toISOString() },
    }));

  const findComponent = (id: string) =>
    get().components.find((c) => c.id === id);

  return {
    project: createProjectInfo(),

    newProject: (init) => {
      set({ project: createProjectInfo(init) });
      get().loadDesign({ components: [], areaBoundary: null });
    },

    loadProject: ({ components, areaBoundary, ...info }) => {
      set({ project: info });
      get().loadDesign({ components, areaBoundary: areaBoundary ?? null });
    },

    updateProjectInfo: (patch) => updateInfo(patch),

    updateSettings: (patch) =>
      updateInfo({ settings: { ...get().project.settings, ...patch } }),

    setSiteContext: (siteContext) => {
      updateInfo({ siteContext });
      // P6.3: roads take lanes / class / sidewalks from the street they follow,
      // only where the value is still a default (never over the user or the AI).
      const patches = get()
        .components.map((c) => {
          const fills = siteParamSuggestions(c, siteContext).filter(
            (s) => (c.paramMeta[s.paramId]?.source ?? "default") === "default",
          );
          if (fills.length === 0) return null;
          return {
            id: c.id,
            patch: {
              params: {
                ...c.params,
                ...Object.fromEntries(fills.map((f) => [f.paramId, f.value])),
              },
              paramMeta: {
                ...c.paramMeta,
                ...Object.fromEntries(
                  fills.map((f) => [
                    f.paramId,
                    { source: "site_context" as const, evidence: f.evidence },
                  ]),
                ),
              },
            },
          };
        })
        .filter((p) => p !== null);
      if (patches.length) get().updateComponents(patches);
    },

    setZoningContext: (zoningContext) => updateInfo({ zoningContext }),

    addDocument: (doc) =>
      updateInfo({ documents: [...get().project.documents, doc] }),

    setActiveScenario: (scenarioId) => {
      if (!get().project.scenarios.some((s) => s.id === scenarioId)) return;
      updateInfo({ activeScenarioId: scenarioId });
    },

    setComponentParam: (
      componentId,
      paramId,
      value,
      source = "user",
      evidence,
    ) => {
      const c = findComponent(componentId);
      if (!c) return;
      get().updateComponent(componentId, {
        params: { ...c.params, [paramId]: value },
        paramMeta: {
          ...c.paramMeta,
          [paramId]: evidence ? { source, evidence } : { source },
        },
      });
    },

    clearComponentParam: (componentId, paramId) => {
      const c = findComponent(componentId);
      if (!c || !(paramId in c.params)) return;
      get().updateComponent(componentId, {
        params: without(c.params, paramId),
        paramMeta: without(c.paramMeta, paramId),
      });
    },

    setOverride: (componentId, kind, lineItemId, value) => {
      const c = findComponent(componentId);
      if (!c) return;
      const rest = without(c.overrides[kind], lineItemId);
      get().updateComponent(componentId, {
        overrides: {
          ...c.overrides,
          [kind]: value === null ? rest : { ...rest, [lineItemId]: value },
        },
      });
    },

    resetOverrides: (componentId) => {
      if (!findComponent(componentId)) return;
      get().updateComponent(componentId, {
        overrides: { quantities: {}, unitPrices: {} },
      });
    },
  };
};
