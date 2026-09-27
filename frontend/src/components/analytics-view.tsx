"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Printer, TrendingUp } from "lucide-react";
import { api, coords } from "@/lib/api";
import { useApp } from "@/lib/context";
import type { Trends } from "@/lib/types";
import { localDate, number } from "@/lib/weather";
import { Badge, ErrorState, Loading, Panel, SourceNote, Stat } from "./common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
const DataChart = dynamic(() => import("./charts").then((m) => m.DataChart), {
  ssr: false,
});
const WeatherMap = dynamic(() => import("./weather-map"), { ssr: false });
type Projection = {
  series: { year: string; temperature: number; rainfall: number }[];
  source: string;
  note: string;
};
export function AnalyticsView() {
  const { place, setPlace, weather } = useApp();
  const [start, setStart] = useState(localDate(-370)),
    [end, setEnd] = useState(localDate(-7)),
    [period, setPeriod] = useState("month"),
    [data, setData] = useState<Trends | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [metric, setMetric] = useState("temperature"),
    [projection, setProjection] = useState<Projection | null>(null),
    [projectionBusy, setProjectionBusy] = useState(false),
    [projectionError, setProjectionError] = useState("");
  const [modelStart, setModelStart] = useState(2030),
    [modelEnd, setModelEnd] = useState(2040);
  const load = async () => {
    setBusy(true);
    setError("");
    setData(null);
    try {
      setData(
        await api<Trends>(
          `/analytics/trends?${coords(place)}&start=${start}&end=${end}&period=${period}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    setProjection(null);
  }, [place.latitude, place.longitude]);
  const final = data?.series.at(-1);
  const title = {
    temperature: "Temperature trends",
    rainfall: "Precipitation",
    humidity: "Humidity",
    wind: "Wind patterns",
    aqi: "Air quality",
  }[metric];
  const delta = (key: string, unit: string) =>
    data?.deltas[key] == null
      ? "No previous period"
      : `${data.deltas[key]! >= 0 ? "+" : ""}${number(data.deltas[key], 1)} ${unit} vs previous period`;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLIMATE INTELLIGENCE</div>
          <h1>
            The patterns behind the weather
            <span className="heading-dot">.</span>
          </h1>
          <p>Historical trends and model scenarios for {place.name}.</p>
        </div>
        <div className="heading-actions">
          <a
            className="button secondary"
            href={`/api/analytics/export.csv?${coords(place)}&start=${start}&end=${end}`}
          >
            <Download size={16} />
            CSV
          </a>
          <button className="button secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Save PDF
          </button>
        </div>
      </div>
      <Tabs defaultValue="trends">
        <TabsList className="tabs-list">
          <TabsTrigger value="trends">Historical analytics</TabsTrigger>
          <TabsTrigger value="models">Climate models</TabsTrigger>
          <TabsTrigger value="location">Location data</TabsTrigger>
        </TabsList>
        <TabsContent value="trends" className="page-stack">
          <Panel>
            <form
              className="form-row"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <label>
                From
                <input
                  type="date"
                  value={start}
                  max={end}
                  min="1940-01-01"
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={end}
                  min={start}
                  max={localDate(-5)}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </label>
              <label>
                Group by
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                Analyze period
              </button>
            </form>
          </Panel>
          {busy && <Loading label="Retrieving historical climate data…" />}
          {error && <ErrorState message={error} retry={load} />}{" "}
          {data && !busy && (
            <>
              <div className="stats-row">
                <Stat
                  label="Mean temperature"
                  value={`${number(final?.temperature, 1)}°C`}
                  detail={delta("temperature", "°C")}
                />
                <Stat
                  label="Total precipitation"
                  value={`${number(final?.rainfall, 1)} mm`}
                  detail={delta("rainfall", "mm")}
                />
                <Stat
                  label="Mean humidity"
                  value={`${number(final?.humidity)}%`}
                  detail={delta("humidity", "points")}
                />
                <Stat
                  label="Mean wind speed"
                  value={`${number(final?.wind, 1)} km/h`}
                  detail={delta("wind", "km/h")}
                />
              </div>
              <Panel
                title={title}
                action={
                  <select
                    className="chart-metric"
                    aria-label="Analytics metric"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                  >
                    <option value="temperature">Temperature</option>
                    <option value="rainfall">Rainfall</option>
                    <option value="humidity">Humidity</option>
                    <option value="wind">Wind</option>
                    <option value="aqi">AQI</option>
                  </select>
                }
              >
                <DataChart
                  data={data.series.map((p) => ({ ...p }))}
                  xKey="period"
                  series={[{ key: metric, name: title || metric }]}
                  kind={metric === "rainfall" ? "bar" : "area"}
                  height={320}
                />
                {metric === "aqi" && (
                  <p className="source-note">{data.aqi_status}</p>
                )}
              </Panel>
              <div className="two-column">
                <Panel title="Period comparison">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Temp °C</th>
                          <th>Rain mm</th>
                          <th>Humidity %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.series.map((p) => (
                          <tr key={p.period}>
                            <td>{p.period}</td>
                            <td>{number(p.temperature, 1)}</td>
                            <td>{number(p.rainfall, 1)}</td>
                            <td>{number(p.humidity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel title="Current risk context">
                  <p className="panel-intro">
                    Screening from the current forecast, separate from
                    historical trends.
                  </p>
                  {[
                    {
                      title: "Agriculture",
                      level: weather
                        ? (weather.current.temperature_2m || 0) >= 35
                          ? "High"
                          : "Low"
                        : "Unknown",
                      text: "Temperature-based heat screening. Check crop-specific advice.",
                    },
                    {
                      title: "Travel",
                      level: weather
                        ? (weather.current.visibility ?? Infinity) < 1000 ||
                          (weather.current.wind_speed_10m || 0) >= 40
                          ? "High"
                          : "Low"
                        : "Unknown",
                      text: "Visibility and wind screening. Road hazards require connected feeds.",
                    },
                    {
                      title: "Air quality",
                      level:
                        weather?.air_quality?.us_aqi == null
                          ? "Unknown"
                          : weather.air_quality.us_aqi > 150
                            ? "High"
                            : weather.air_quality.us_aqi > 100
                              ? "Moderate"
                              : "Low",
                      text: "Based on modeled US AQI at this location.",
                    },
                  ].map((r) => (
                    <div className="risk-row" key={r.title}>
                      <div>
                        <strong>{r.title}</strong>
                        <p>{r.text}</p>
                      </div>
                      <Badge level={r.level}>{r.level}</Badge>
                    </div>
                  ))}
                </Panel>
              </div>
              <SourceNote
                sources={data.sources}
                note={`Stat cards show the last ${period} (${final?.period}). Partial periods are not directly comparable with complete periods.`}
              />
            </>
          )}
        </TabsContent>
        <TabsContent value="models" className="page-stack">
          <Panel title="Explore a climate scenario">
            <form
              className="form-row"
              onSubmit={async (e) => {
                e.preventDefault();
                setProjectionBusy(true);
                setProjectionError("");
                try {
                  setProjection(
                    await api<Projection>(
                      `/analytics/climate?${coords(place)}&start=${modelStart}&end=${modelEnd}`,
                    ),
                  );
                } catch (e) {
                  setProjectionError((e as Error).message);
                } finally {
                  setProjectionBusy(false);
                }
              }}
            >
              <label>
                Start year
                <input
                  type="number"
                  min={1950}
                  max={2050}
                  value={modelStart}
                  onChange={(e) => setModelStart(Number(e.target.value))}
                />
              </label>
              <label>
                End year
                <input
                  type="number"
                  min={modelStart}
                  max={Math.min(2050, modelStart + 10)}
                  value={modelEnd}
                  onChange={(e) => setModelEnd(Number(e.target.value))}
                />
              </label>
              <button className="button primary" disabled={projectionBusy}>
                Load scenario
              </button>
            </form>
          </Panel>
          {projectionBusy && <Loading />}
          {projectionError && <ErrorState message={projectionError} />}{" "}
          {projection && (
            <>
              <Panel title="Annual mean temperature">
                <DataChart
                  data={projection.series}
                  xKey="year"
                  series={[{ key: "temperature", name: "Temperature °C" }]}
                  height={300}
                />
              </Panel>
              <Panel title="Annual precipitation">
                <DataChart
                  data={projection.series}
                  xKey="year"
                  series={[{ key: "rainfall", name: "Rainfall mm" }]}
                  kind="bar"
                />
              </Panel>
              <SourceNote
                sources={[projection.source]}
                note={projection.note}
              />
            </>
          )}
        </TabsContent>
        <TabsContent value="location" className="page-stack">
          <Panel title={`Explore ${place.name}`}>
            <div className="stats-row">
              <Stat label="Latitude" value={`${place.latitude.toFixed(4)}°`} />
              <Stat
                label="Longitude"
                value={`${place.longitude.toFixed(4)}°`}
              />
              <Stat
                label="Model elevation"
                value={`${number(weather?.elevation)} m`}
              />
              <Stat
                label="Time zone"
                value={
                  <span className="small-value">
                    {weather?.timezone || "—"}
                  </span>
                }
              />
            </div>
          </Panel>
          <WeatherMap
            point={place}
            onPick={(p) =>
              setPlace({
                ...p,
                name: `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`,
              })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
