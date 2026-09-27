"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, Download } from "lucide-react";
import { api, coords } from "@/lib/api";
import { useApp } from "@/lib/context";
import type { HistoryData } from "@/lib/types";
import { clock, dateLabel, localDate, number } from "@/lib/weather";
import { ErrorState, Loading, Panel, SourceNote, Stat } from "./common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
const DataChart = dynamic(() => import("./charts").then((m) => m.DataChart), {
  ssr: false,
});
export function HistoryView() {
  const { place } = useApp();
  const [a, setA] = useState(localDate(-7)),
    [b, setB] = useState(localDate(-37)),
    [end, setEnd] = useState(localDate(-7)),
    [data, setData] = useState<HistoryData[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState("compare"),
    [loadedDates, setLoadedDates] = useState<string[]>([]);
  const load = async () => {
    setBusy(true);
    setError("");
    setData([]);
    try {
      const dates =
        mode === "compare"
          ? [
              [a, a],
              [b, b],
            ]
          : [[a, end]];
      setData(
        await Promise.all(
          dates.map(([start, end]) =>
            api<HistoryData>(
              `/weather/history?${coords(place)}&start=${start}&end=${end}`,
            ),
          ),
        ),
      );
      setLoadedDates(dates.map((d) => d.join(" → ")));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mean = (d: HistoryData, key: string) => {
    const values = d.hourly
      .map((p) => p[key])
      .filter((v): v is number => v != null);
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOOK BACK WITH CONTEXT</div>
          <h1>
            Historical weather<span className="heading-dot">.</span>
          </h1>
          <p>Explore past conditions or compare two days in {place.name}.</p>
        </div>
      </div>
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v);
          setData([]);
        }}
      >
        <TabsList className="tabs-list">
          <TabsTrigger value="compare">Compare two dates</TabsTrigger>
          <TabsTrigger value="range">Date range</TabsTrigger>
        </TabsList>
        <Panel>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <label>
              {mode === "compare" ? "First date" : "From"}
              <input
                type="date"
                required
                value={a}
                max={localDate(-5)}
                min="1940-01-01"
                onChange={(e) => setA(e.target.value)}
              />
            </label>
            <label>
              {mode === "compare" ? "Second date" : "To"}
              <input
                type="date"
                required
                value={mode === "compare" ? b : end}
                min={mode === "range" ? a : "1940-01-01"}
                max={localDate(-5)}
                onChange={(e) =>
                  mode === "compare"
                    ? setB(e.target.value)
                    : setEnd(e.target.value)
                }
              />
            </label>
            <button className="button primary" disabled={busy}>
              Explore history
            </button>
          </form>
        </Panel>
      </Tabs>
      {busy && <Loading label="Retrieving historical reanalysis…" />}
      {error && <ErrorState message={error} retry={load} />}{" "}
      {!busy && !data.length && !error && (
        <Panel>
          <div className="empty-state">
            <CalendarDays size={34} />
            <h2>Every day has a weather story</h2>
            <p>
              Select a date back to 1940. Historical reanalysis has a
              publication delay of about five days.
            </p>
          </div>
        </Panel>
      )}
      <div className={data.length === 2 ? "two-column" : "page-stack"}>
        {data.map((d, index) => (
          <Panel title={loadedDates[index]} key={index}>
            <div className="history-stats">
              <Stat
                label="Mean temperature"
                value={`${number(mean(d, "temperature_2m"), 1)}°C`}
              />
              <Stat
                label="Total rainfall"
                value={`${number(
                  d.hourly.reduce((s, p) => s + (p.precipitation || 0), 0),
                  1,
                )} mm`}
              />
              <Stat
                label="Mean wind"
                value={`${number(mean(d, "wind_speed_10m"), 1)} km/h`}
              />
              <Stat
                label="Mean humidity"
                value={`${number(mean(d, "relative_humidity_2m"))}%`}
              />
              <Stat
                label="Pressure"
                value={`${number(mean(d, "pressure_msl"))} hPa`}
              />
              <Stat
                label="Cloud cover"
                value={`${number(mean(d, "cloud_cover"))}%`}
              />
            </div>
            <DataChart
              data={d.hourly.map((p) => ({
                label:
                  mode === "compare"
                    ? clock(p.time, d.timezone)
                    : dateLabel(p.time, d.timezone),
                temperature: p.temperature_2m,
              }))}
              series={[{ key: "temperature", name: "Temperature" }]}
              height={230}
              suffix="°"
            />
            <SourceNote sources={d.sources} />
          </Panel>
        ))}
      </div>
      {data.length > 0 && (
        <Panel
          title="Hourly records"
          action={
            <a
              href={`/api/analytics/export.csv?${coords(place)}&start=${a}&end=${mode === "range" ? end : a}`}
              className="text-button"
            >
              <Download size={15} />
              Export first series
            </a>
          }
        >
          <div className="table-scroll tall-table">
            <table>
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Temperature °C</th>
                  <th>Rain mm</th>
                  <th>Wind km/h</th>
                  <th>Humidity %</th>
                  <th>Pressure hPa</th>
                  <th>Cloud %</th>
                </tr>
              </thead>
              <tbody>
                {data[0].hourly.map((p) => (
                  <tr key={p.time}>
                    <td>
                      {dateLabel(p.time, data[0].timezone)}{" "}
                      {clock(p.time, data[0].timezone)}
                    </td>
                    {[
                      "temperature_2m",
                      "precipitation",
                      "wind_speed_10m",
                      "relative_humidity_2m",
                      "pressure_msl",
                      "cloud_cover",
                    ].map((k) => (
                      <td key={k}>{number(p[k], 1)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
