import type { Units } from "./types";
export function condition(code: number | null | undefined) {
  if (code == null) return "Unavailable";
  if (code === 0) return "Clear skies";
  if (code < 3) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code < 50) return "Foggy";
  if (code < 60) return "Drizzle";
  if (code < 70) return "Rain";
  if (code < 80) return "Snow";
  if (code < 90) return "Rain showers";
  return "Thunderstorms";
}
export function number(value: number | null | undefined, decimals = 0) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
export function temperature(
  value: number | null | undefined,
  units: Units = "metric",
) {
  return value == null
    ? "—"
    : `${Math.round(units === "imperial" ? (value * 9) / 5 + 32 : value)}°`;
}
export function wind(
  value: number | null | undefined,
  units: Units = "metric",
) {
  return `${number(value == null ? null : units === "imperial" ? value / 1.609344 : value)} ${units === "imperial" ? "mph" : "km/h"}`;
}
export function clock(time: number | null | undefined, timezone?: string) {
  return time == null
    ? "—"
    : new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      }).format(time * 1000);
}
export function day(time: number, timezone?: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: timezone,
  }).format(time * 1000);
}
export function dateLabel(time: number, timezone?: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(time * 1000);
}
export function aqiLabel(value: number | null | undefined) {
  if (value == null) return "Unavailable";
  return value <= 50
    ? "Good"
    : value <= 100
      ? "Moderate"
      : value <= 150
        ? "Sensitive groups"
        : value <= 200
          ? "Unhealthy"
          : value <= 300
            ? "Very unhealthy"
            : "Hazardous";
}
export function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-CA");
}
export function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
