import { describe, expect, it } from "vitest";
import { domeMercatorParams, mercatorX, mercatorY, metersToMercator } from "../domeGeometry";

describe("domeGeometry", () => {
  it("mercatorX maps lng 0 to 0.5 and ±180 to 0/1", () => {
    expect(mercatorX(0)).toBeCloseTo(0.5, 10);
    expect(mercatorX(-180)).toBeCloseTo(0, 10);
    expect(mercatorX(180)).toBeCloseTo(1, 10);
  });

  it("mercatorY maps lat 0 to 0.5 and grows toward the south", () => {
    expect(mercatorY(0)).toBeCloseTo(0.5, 10);
    expect(mercatorY(45)).toBeLessThan(0.5);
    expect(mercatorY(-45)).toBeGreaterThan(0.5);
  });

  it("metersToMercator: one Earth circumference at the equator = 1 unit", () => {
    expect(40075016.686 * metersToMercator(0)).toBeCloseTo(1, 6);
  });

  it("domeMercatorParams scales with radius and sits at the base position", () => {
    const small = domeMercatorParams(75.63, 32.23, 40);
    const big = domeMercatorParams(75.63, 32.23, 120);
    expect(big.scale / small.scale).toBeCloseTo(3, 6);
    expect(big.x).toBeCloseTo(small.x, 12);
    expect(big.y).toBeCloseTo(small.y, 12);
    expect(big.x).toBeCloseTo(mercatorX(75.63), 12);
  });
});
