"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapType,
  type StyleSpecification,
} from "maplibre-gl";
import {
  Layers3,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Settings2,
  X,
} from "lucide-react";
import { api, coords } from "@/lib/api";
import { useApp } from "@/lib/context";
import { clock, dateLabel } from "@/lib/weather";
import type { Alerts, Layers, Point, RouteAnalysis } from "@/lib/types";
import type { FeatureCollection } from "geojson";
import { WindFlow } from "./wind-flow";
const empty: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const fields: Record<string, [string, string, number, number]> = {
  temperature: ["temperature_2m", "°C", -10, 40],
  precipitation: ["precipitation", "mm", 0, 10],
  humidity: ["relative_humidity_2m", "%", 0, 100],
  clouds: ["cloud_cover", "%", 0, 100],
  feels_like: ["apparent_temperature", "°C", -10, 45],
  wind_chill: ["wind_chill", "°C", -25, 10],
  wind: ["wind_speed_10m", "km/h", 0, 70],
};
function style(base: string): StyleSpecification | string {
  if (base !== "street")
    return `https://tiles.openfreemap.org/styles/${base === "dark" ? "dark" : "positron"}`;
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxzoom: 19,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}
export default function WeatherMap({
  point,
  compact = false,
  onPick,
  route,
  controls = false,
}: {
  point: Point;
  compact?: boolean;
  onPick?: (point: Point) => void;
  route?: RouteAnalysis | null;
  controls?: boolean;
}) {
  const { theme, units, setUnits } = useApp();
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    marker = useRef<maplibregl.Marker | null>(null),
    pick = useRef(onPick);
  const [ready, setReady] = useState(0),
    [base, setBase] = useState(theme === "dark" ? "dark" : "light"),
    [catalog, setCatalog] = useState<Layers | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [gridLayer, setGridLayer] = useState("temperature"),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [showLayers, setShowLayers] = useState(true),
    [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [windStyle, setWindStyle] = useState("vectors"),
    [metricUnits, setMetricUnits] = useState({
      temperature: "°C",
      wind: "km/h",
      rain: "mm",
    });
  const [gridData, setGridData] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const metricState = useRef({ gridLayer, metricUnits });
  metricState.current = { gridLayer, metricUnits };
  const converted = (value: number, layer = gridLayer, prefs = metricUnits) =>
    layer === "wind"
      ? prefs.wind === "mph"
        ? value / 1.609344
        : prefs.wind === "m/s"
          ? value / 3.6
          : value
      : ["temperature", "feels_like", "wind_chill"].includes(layer) &&
          prefs.temperature === "°F"
        ? (value * 9) / 5 + 32
        : layer === "precipitation" && prefs.rain === "in"
          ? value / 25.4
          : value;
  const displayUnit = (layer = gridLayer, prefs = metricUnits) =>
    layer === "wind"
      ? prefs.wind
      : ["temperature", "feels_like", "wind_chill"].includes(layer)
        ? prefs.temperature
        : layer === "precipitation"
          ? prefs.rain
          : fields[layer]?.[1];
  pick.current = onPick;
  const externalFrames = catalog?.layers.find(
    (l) => selected.includes(l.id) && l.id !== "radar" && l.frames?.length,
  )?.frames;
  const radarMode = selected.includes("radar");
  const frames = radarMode
    ? catalog?.radar_frames.map((f) => f.time) || []
    : externalFrames?.map((f) => f.time) ||
      Array.from(
        { length: 25 },
        (_, i) => Math.floor(Date.now() / 3600000) * 3600 + i * 3 * 3600,
      );
  const time =
    frames[Math.min(frame, frames.length - 1)] || Math.floor(Date.now() / 1000);
  useEffect(() => {
    if (controls)
      api<Layers>("/map/layers")
        .then(setCatalog)
        .catch((e) => setError(e.message));
  }, [controls]);
  useEffect(() => {
    if (!container.current) return;
    let alive = true;
    const instance = new maplibregl.Map({
      container: container.current,
      style: style(base),
      center: [point.longitude, point.latitude],
      zoom: compact ? 3 : 7,
      attributionControl: { compact: true },
      maxZoom: 17,
    });
    map.current = instance;
    if (!compact)
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
    instance.on("style.load", () => {
      if (alive) setReady((r) => r + 1);
    });
    instance.on("click", (event) => {
      if (pick.current)
        pick.current({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        });
    });
    instance.on("click", "wx-grid", (event) => {
      if (pick.current || !event.features?.length) return;
      const { gridLayer: active, metricUnits: preferences } =
        metricState.current;
      const raw = event.features[0].properties?.[fields[active][0]];
      const content = document.createElement("div");
      content.textContent =
        raw == null
          ? "No model value"
          : `${active.replaceAll("_", " ")}: ${converted(Number(raw), active, preferences).toFixed(1)} ${displayUnit(active, preferences)}`;
      new maplibregl.Popup()
        .setLngLat(event.lngLat)
        .setDOMContent(content)
        .addTo(instance);
    });
    instance.on("error", (e) => {
      if (e.error?.message?.includes("WebGL"))
        setError(
          "This browser could not initialize the map. Enable hardware acceleration and retry.",
        );
    });
    marker.current = new maplibregl.Marker({ color: "#38bdf8" })
      .setLngLat([point.longitude, point.latitude])
      .addTo(instance);
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    return () => {
      alive = false;
      resize.disconnect();
      marker.current?.remove();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    map.current?.setStyle(style(base));
  }, [base]);
  useEffect(() => {
    if (map.current) {
      map.current.flyTo({
        center: [point.longitude, point.latitude],
        duration: 700,
      });
      marker.current?.setLngLat([point.longitude, point.latitude]);
    }
  }, [point.latitude, point.longitude]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % Math.max(1, frames.length)),
      2000 / speed,
    );
    return () => clearInterval(id);
  }, [playing, speed, frames.length]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m?.isStyleLoaded()) return;
    if (!m.getSource("trip")) {
      m.addSource("trip", { type: "geojson", data: empty });
      m.addLayer({
        id: "trip-line",
        type: "line",
        source: "trip",
        paint: {
          "line-width": 6,
          "line-color": [
            "match",
            ["get", "risk"],
            "Severe",
            "#f87171",
            "High",
            "#fb923c",
            "Moderate",
            "#facc15",
            "Unknown",
            "#94a3b8",
            "#34d399",
          ],
        },
      });
    }
    (m.getSource("trip") as GeoJSONSource).setData(route?.segments || empty);
    if (route) {
      const bounds = new maplibregl.LngLatBounds();
      route.geometry.coordinates.forEach((c) =>
        bounds.extend(c as [number, number]),
      );
      m.fitBounds(bounds, { padding: 60, duration: 800 });
    }
  }, [ready, route]);
  useEffect(() => {
    const m = map.current;
    if (!controls || !ready || !m?.isStyleLoaded()) return;
    let cancelled = false;
    const update = async () => {
      setBusy(true);
      setError("");
      for (const layer of m.getStyle().layers || [])
        if (layer.id.startsWith("wx-")) m.removeLayer(layer.id);
      for (const id of Object.keys(m.getStyle().sources))
        if (id.startsWith("wx-")) m.removeSource(id);
      try {
        if (selected.some((s) => s in fields)) {
          // Radar timestamps and future forecast timestamps are intentionally separate.
          const forecastTime = radarMode
            ? Math.floor(Date.now() / 3600000) * 3600
            : time;
          const data = await api<GeoJSON.FeatureCollection>(
            `/map/grid?${coords(point)}&hour=${forecastTime}`,
          );
          if (cancelled || !m.isStyleLoaded()) return;
          setGridData(data);
          const active = gridLayer in fields ? gridLayer : "temperature";
          const [key, , min, max] = fields[active];
          m.addSource("wx-grid", { type: "geojson", data });
          m.addLayer({
            id: "wx-grid",
            type: "circle",
            source: "wx-grid",
            filter: ["!=", ["get", key], null],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                6,
                8,
                28,
                12,
                65,
              ],
              "circle-opacity": 0.65,
              "circle-blur": 0.35,
              "circle-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", key], min],
                min,
                "#60a5fa",
                (min + max) / 2,
                "#22d3ee",
                max,
                "#fb7185",
              ],
            },
          });
          if (active === "wind" && windStyle === "vectors") {
            m.addLayer({
              id: "wx-wind",
              type: "symbol",
              source: "wx-grid",
              layout: {
                "text-field": "↑",
                "text-size": 28,
                "text-allow-overlap": true,
                "text-rotate": ["+", ["get", "wind_direction_10m"], 180],
                "text-rotation-alignment": "map",
                "text-font": ["Open Sans Regular"],
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#0f172a",
                "text-halo-width": 1,
              },
            });
          }
        }
        for (const id of selected.filter((s) => !(s in fields))) {
          if (cancelled || !m.isStyleLoaded()) return;
          const layer = catalog?.layers.find((l) => l.id === id);
          if (!layer) continue;
          if (layer.type === "raster") {
            m.addSource(`wx-${id}`, {
              type: "raster",
              tiles: [
                `${window.location.origin}/api/map/tiles/${id}/{z}/{x}/{y}?time=${time}`,
              ],
              tileSize: 256,
              maxzoom: id === "radar" ? 7 : 18,
            });
            m.addLayer({
              id: `wx-${id}`,
              type: "raster",
              source: `wx-${id}`,
              paint: { "raster-opacity": 0.7 },
            });
          } else {
            let data: GeoJSON.FeatureCollection;
            if (id === "alerts") {
              const a = await api<Alerts>(`/alerts/live?${coords(point)}`);
              data = {
                type: "FeatureCollection",
                features: a.alerts
                  .filter((a) => a.geometry)
                  .map((a) => ({
                    type: "Feature",
                    geometry: a.geometry!,
                    properties: { name: a.event },
                  })),
              };
            } else
              data = await api<GeoJSON.FeatureCollection>(`/map/data/${id}`);
            if (cancelled || !m.isStyleLoaded()) return;
            m.addSource(`wx-${id}`, { type: "geojson", data });
            const color =
              id === "safe_zones"
                ? "#34d399"
                : id === "flood"
                  ? "#60a5fa"
                  : "#fb923c";
            m.addLayer({
              id: `wx-${id}-fill`,
              type: "fill",
              source: `wx-${id}`,
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: { "fill-color": color, "fill-opacity": 0.28 },
            });
            m.addLayer({
              id: `wx-${id}-line`,
              type: "line",
              source: `wx-${id}`,
              filter: ["!=", ["geometry-type"], "Point"],
              paint: { "line-color": color, "line-width": 2 },
            });
            m.addLayer({
              id: `wx-${id}-point`,
              type: "circle",
              source: `wx-${id}`,
              filter: ["==", ["geometry-type"], "Point"],
              paint: {
                "circle-color": color,
                "circle-radius": 6,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff",
              },
            });
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    const timeout = setTimeout(update, 150);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    ready,
    selected.join(","),
    gridLayer,
    point.latitude,
    point.longitude,
    time,
    windStyle,
  ]);
  const toggle = (id: string) => {
    if (id in fields) {
      setGridLayer(id);
      setSelected((s) =>
        s.includes(id)
          ? s.filter((v) => v !== id)
          : [...s.filter((v) => !(v in fields)), id],
      );
    } else
      setSelected((s) =>
        s.includes(id) ? s.filter((v) => v !== id) : [...s, id],
      );
    setFrame(
      id === "radar" ? Math.max(0, (catalog?.radar_frames.length || 1) - 1) : 0,
    );
    setPlaying(false);
  };
  return (
    <div className={`weather-map ${compact ? "compact-map" : "full-map"}`}>
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive weather map"
      />
      {selected.includes("wind") &&
        (windStyle === "particles" || windStyle === "barbs") && (
          <WindFlow map={map.current} data={gridData} mode={windStyle} />
        )}
      {controls && (
        <>
          <div className="map-top-tools">
            <button
              className="map-button"
              onClick={() => setShowLayers((v) => !v)}
            >
              <Layers3 size={17} />
              Layers
            </button>
            <button
              className="map-button"
              onClick={() => setSettings((v) => !v)}
              aria-label="Map settings"
            >
              <Settings2 size={17} />
            </button>
            {busy && (
              <span className="map-loading">
                <LoaderCircle className="spin" size={16} />
                Updating
              </span>
            )}
          </div>
          {showLayers && (
            <div className="map-layer-panel">
              <div className="map-panel-title">
                <strong>Weather layers</strong>
                <button
                  className="icon-button"
                  aria-label="Hide layer panel"
                  onClick={() => setShowLayers(false)}
                >
                  <X size={16} />
                </button>
              </div>
              {catalog?.layers.map((l) => (
                <label
                  className={`layer-choice ${!l.available ? "unavailable" : ""}`}
                  key={l.id}
                  title={l.reason || l.source}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(l.id)}
                    disabled={!l.available}
                    onChange={() => toggle(l.id)}
                  />
                  <span>
                    {l.name}
                    {!l.available && <small>Feed not connected</small>}
                  </span>
                </label>
              ))}
              {!catalog && <p className="muted">Loading providers…</p>}
            </div>
          )}
          {settings && (
            <div className="map-settings">
              <strong>Map settings</strong>
              <label>
                Base map
                <select value={base} onChange={(e) => setBase(e.target.value)}>
                  <option value="dark">Dark streets</option>
                  <option value="light">Light streets</option>
                  <option value="street">OpenStreetMap</option>
                </select>
              </label>
              <label>
                Units
                <select
                  value={units}
                  onChange={(e) => {
                    setUnits(e.target.value as "metric" | "imperial");
                    setMetricUnits(
                      e.target.value === "metric"
                        ? { temperature: "°C", wind: "km/h", rain: "mm" }
                        : { temperature: "°F", wind: "mph", rain: "in" },
                    );
                  }}
                >
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </label>
              <label>
                Temperature
                <select
                  value={metricUnits.temperature}
                  onChange={(e) =>
                    setMetricUnits((v) => ({
                      ...v,
                      temperature: e.target.value,
                    }))
                  }
                >
                  <option>°C</option>
                  <option>°F</option>
                </select>
              </label>
              <label>
                Wind
                <select
                  value={metricUnits.wind}
                  onChange={(e) =>
                    setMetricUnits((v) => ({ ...v, wind: e.target.value }))
                  }
                >
                  <option>km/h</option>
                  <option>mph</option>
                  <option>m/s</option>
                </select>
              </label>
              <label>
                Precipitation
                <select
                  value={metricUnits.rain}
                  onChange={(e) =>
                    setMetricUnits((v) => ({ ...v, rain: e.target.value }))
                  }
                >
                  <option>mm</option>
                  <option>in</option>
                </select>
              </label>
              <label>
                Wind style
                <select
                  value={windStyle}
                  onChange={(e) => setWindStyle(e.target.value)}
                >
                  <option value="vectors">Direction vectors</option>
                  <option value="fill">Speed fill</option>
                  <option value="barbs">Wind barbs</option>
                  <option value="particles">Wind particles</option>
                </select>
              </label>
            </div>
          )}
          <div className="map-timeline">
            <button
              className="icon-button"
              aria-label={playing ? "Pause timeline" : "Play timeline"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <div className="timeline-main">
              <div>
                <strong>
                  {dateLabel(time)} · {clock(time)}
                </strong>
                <span>
                  {radarMode
                    ? "Past radar frames"
                    : externalFrames?.length
                      ? "Provider timeline"
                      : "Forecast · next 72 hours"}
                </span>
              </div>
              <input
                aria-label="Weather timeline"
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={Math.min(frame, frames.length - 1)}
                onChange={(e) => setFrame(Number(e.target.value))}
              />
            </div>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          {selected.some((s) => s in fields) && (
            <div className="map-legend">
              <strong>
                {catalog?.layers.find((l) => l.id === gridLayer)?.name}
              </strong>
              <div className="legend-gradient" />
              <div>
                <span>
                  {converted(fields[gridLayer][2]).toFixed(1)} {displayUnit()}
                </span>
                <span>
                  {converted(fields[gridLayer][3]).toFixed(1)} {displayUnit()}
                </span>
              </div>
              <small>Sampled model grid · 0.3° spacing</small>
              {gridLayer === "wind" && windStyle === "particles" && (
                <small>Motion accelerated for readability</small>
              )}
              {gridLayer === "wind" && windStyle === "barbs" && (
                <small>Half barb 5 knots · full barb 10 · pennant 50</small>
              )}
              {radarMode && (
                <small>Grid shows current forecast alongside past radar.</small>
              )}
            </div>
          )}
          {radarMode && !selected.some((s) => s in fields) && (
            <div className="map-legend">
              <strong>Rain radar · RainViewer</strong>
              <small>Past observations, not a forecast.</small>
              <small>Coverage gaps do not mean no rain.</small>
              <a
                href="https://www.rainviewer.com/api/color-schemes.html"
                target="_blank"
                rel="noreferrer"
              >
                Reflectivity color reference ↗
              </a>
            </div>
          )}
        </>
      )}
      {onPick && (
        <span className="map-pick-note">
          <MapPin size={14} />
          Click to choose a location
        </span>
      )}
      {error && (
        <div className="map-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
