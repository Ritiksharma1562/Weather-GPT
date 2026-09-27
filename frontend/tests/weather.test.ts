import { describe, expect, it } from "vitest";
import {
  aqiLabel,
  condition,
  distance,
  temperature,
  wind,
} from "@/lib/weather";
import { parseObservations } from "@/components/comparison-view";
describe("weather display", () => {
  it("converts temperature and wind without changing source values", () => {
    expect(temperature(0, "imperial")).toBe("32°");
    expect(temperature(30, "metric")).toBe("30°");
    expect(wind(16.09344, "imperial")).toBe("10 mph");
  });
  it("does not display missing weather or air quality as zero", () => {
    expect(temperature(null)).toBe("—");
    expect(aqiLabel(null)).toBe("Unavailable");
    expect(condition(null)).toBe("Unavailable");
  });
  it("computes movement distance for Copilot", () => {
    expect(
      distance({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 }),
    ).toBeCloseTo(1111.95, 1);
  });
});
describe("observation import", () => {
  it("accepts measurements with explicit time zones", () => {
    const parsed = parseObservations(
      "time,temperature\n2026-01-01T00:00:00Z,12.5\n2026-01-01T01:00:00+00:00,13",
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].temperature).toBe(12.5);
  });
  it("rejects missing temperature instead of treating it as zero", () => {
    expect(() =>
      parseObservations(
        "time,temperature\n2026-01-01T00:00:00Z,\n2026-01-01T01:00:00Z,13",
      ),
    ).toThrow("Invalid observation");
  });
  it("rejects ambiguous timestamps", () => {
    expect(() =>
      parseObservations(
        "time,temperature\n2026-01-01T00:00:00,12\n2026-01-01T01:00:00,13",
      ),
    ).toThrow("time zone");
  });
});
