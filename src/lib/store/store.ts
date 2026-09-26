import { create } from "zustand";
import { createDesignSlice, type DesignSlice } from "./designSlice";
import { createProjectSlice, type ProjectSlice } from "./projectSlice";

// Combines the slices only. Person A owns designSlice, Person B projectSlice.
export type Store = DesignSlice & ProjectSlice;

export const useStore = create<Store>()((...a) => ({
  ...createDesignSlice(...a),
  ...createProjectSlice(...a),
}));
