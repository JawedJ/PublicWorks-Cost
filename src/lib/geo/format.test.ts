import { describe, expect, it } from "vitest";
import { formatArea, formatLength, formatMeasurements } from "./format";

describe("format", () => {
  it("formats metric lengths and areas", () => {
    expect(formatLength(420.4, "metric", "en-CA")).toBe("420 m");
    expect(formatLength(1520, "metric", "en-CA")).toBe("1.52 km");
    expect(formatArea(950, "metric", "en-CA")).toBe("950 m²");
    expect(formatArea(25_000, "metric", "en-CA")).toBe("2.5 ha");
  });
  it("formats imperial", () => {
    expect(formatLength(100, "imperial", "en-CA")).toBe("328 ft");
    expect(formatLength(3218.7, "imperial", "en-CA")).toBe("2 mi");
    expect(formatArea(100, "imperial", "en-CA")).toBe("1,076 ft²");
    expect(formatArea(8093.72, "imperial", "en-CA")).toBe("2 acres");
  });
  it("uses the French decimal comma", () => {
    expect(formatLength(1520, "metric", "fr-CA")).toBe("1,52 km");
  });
});

describe("formatMeasurements", () => {
  const words = { footprint: "footprint", floorArea: "floor area" };
  it("gives buildings footprint and floor area, lines length, areas area", () => {
    expect(
      formatMeasurements(
        { areaM2: 2000, footprintM2: 1200, grossFloorAreaM2: 2400 },
        "metric",
        "en-CA",
        words,
      ),
    ).toBe("1,200 m² footprint · 2,400 m² floor area");
    expect(formatMeasurements({ lengthM: 420 }, "metric", "en-CA", words)).toBe(
      "420 m",
    );
    expect(
      formatMeasurements({ areaM2: 15000 }, "metric", "en-CA", words),
    ).toBe("1.5 ha");
    expect(formatMeasurements({}, "metric", "en-CA", words)).toBe("");
  });
});
