import {
  Bridge,
  Building2,
  Route,
  Shapes,
  SquareParking,
  Trees,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "@/lib/schemas";

/** One icon per component type, shared by the component list and the Add picker. */
export const typeIcon: Record<ComponentType, LucideIcon> = {
  road: Route,
  park: Trees,
  building: Building2,
  structure: Bridge,
  parking: SquareParking,
  custom: Shapes,
};
