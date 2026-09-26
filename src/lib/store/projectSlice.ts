import type { StateCreator } from "zustand";
import type { Store } from "./store";

// Person B's slice: project meta, component params and paramMeta, overrides,
// settings, scenarios, questions state. Stub until B.2 fills it in.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ProjectSlice = {};

export const createProjectSlice: StateCreator<
  Store,
  [],
  [],
  ProjectSlice
> = () => ({});
