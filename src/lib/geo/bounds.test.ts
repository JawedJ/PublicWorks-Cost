import { describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import { componentBounds, featureBounds } from "./bounds";

describe("bounds", () => {
  it("covers a line's vertices", () => {
    expect(
      featureBounds({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [-80.5, 43.5],
            [-80.4, 43.4],
            [-80.45, 43.6],
          ],
        },
      }),
    ).toEqual([-80.5, 43.4, -80.4, 43.6]);
  });

  it("a point has zero-size bounds", () => {
    expect(
      featureBounds({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [-80.5, 43.5] },
      }),
    ).toEqual([-80.5, 43.5, -80.5, 43.5]);
  });

  it("includes sections and placed features, and is null while planned", () => {
    const park = northgateProject.components.find((c) => c.type === "park")!;
    const b = componentBounds(park)!;
    for (const f of park.geometry!.features) {
      const fb = featureBounds(f.geometry)!;
      expect(fb[0]).toBeGreaterThanOrEqual(b[0]);
      expect(fb[3]).toBeLessThanOrEqual(b[3]);
    }
    expect(componentBounds({ ...park, geometry: undefined })).toBeNull();
  });
});
