import { describe, expect, it } from "vitest";
import type { PolygonFeature, Position } from "@/lib/schemas";
import {
  localFrame,
  mapFeature,
  mirrorAbout,
  rotateAbout,
  scaleAbout,
  translateFeature,
} from "./transform";

const origin: Position = [-80.5, 43.45];
const { toLocal, fromLocal } = localFrame(origin);
const at = (x: number, y: number) => fromLocal([x, y]);
const near = (p: Position, x: number, y: number) => {
  const [lx, ly] = toLocal(p);
  expect(lx).toBeCloseTo(x, 6);
  expect(ly).toBeCloseTo(y, 6);
};

const square: PolygonFeature = {
  type: "Feature",
  properties: { keep: true },
  geometry: {
    type: "Polygon",
    coordinates: [[at(0, 0), at(10, 0), at(10, 10), at(0, 10), at(0, 0)]],
  },
};

describe("transform", () => {
  it("round-trips through the local frame", () => {
    near(at(123, -45), 123, -45);
  });

  it("rotates counter-clockwise in metres", () => {
    near(rotateAbout(origin, 90)(at(10, 0)), 0, 10);
    near(rotateAbout(origin, -90)(at(10, 0)), 0, -10);
  });

  it("scales from an anchor", () => {
    near(scaleAbout(at(10, 10), 2, 0.5)(at(0, 0)), -10, 5);
  });

  it("mirrors across vertical and horizontal axes", () => {
    near(mirrorAbout(at(5, 5), "vertical")(at(0, 2)), 10, 2);
    near(mirrorAbout(at(5, 5), "horizontal")(at(0, 2)), 0, 8);
  });

  it("maps every polygon position and keeps properties", () => {
    const moved = mapFeature(square, scaleAbout(origin, 2, 2));
    near(moved.geometry.coordinates[0]![2]!, 20, 20);
    expect(moved.properties).toEqual({ keep: true });
  });

  it("reverses rings after a mirror so winding is kept", () => {
    const signedArea = (ring: Position[]) =>
      ring.slice(1).reduce((sum, p, i) => {
        const [x0, y0] = toLocal(ring[i]!);
        const [x1, y1] = toLocal(p);
        return sum + x0 * y1 - x1 * y0;
      }, 0);
    const before = signedArea(square.geometry.coordinates[0]!);
    const flip = mirrorAbout(at(5, 5), "vertical");
    const kept = mapFeature(square, flip, true).geometry.coordinates[0]!;
    const flipped = mapFeature(square, flip).geometry.coordinates[0]!;
    expect(Math.sign(signedArea(kept))).toBe(Math.sign(before));
    expect(Math.sign(signedArea(flipped))).toBe(-Math.sign(before));
  });

  it("translates by metres", () => {
    const t = translateFeature(square, 5, -5);
    const [x, y] = toLocal(t.geometry.coordinates[0]![0]!);
    expect(x).toBeCloseTo(5, 1);
    expect(y).toBeCloseTo(-5, 6);
  });
});
