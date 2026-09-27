"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Activity, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/context";
import { dateLabel, clock, number } from "@/lib/weather";
import type { Comparison } from "@/lib/types";
import { Badge, ErrorState, Loading, Panel, SourceNote } from "./common";
const DataChart = dynamic(() => import("./charts").then((m) => m.DataChart), {
  ssr: false,
});
export function parseObservations(text: string) {
  const rows = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((v) => v.trim().replace(/^"|"$/g, "")));
  const header = rows.shift() || [],
    timeIndex = header.indexOf("time"),
    valueIndex = header.indexOf("temperature");
  if (timeIndex < 0 || valueIndex < 0)
    throw new Error(
      "CSV needs time and temperature columns. Temperature must be in °C.",
    );
  if (rows.length < 2 || rows.length > 2000)
    throw new Error("Upload between 2 and 2,000 observations.");
  return rows.map((row, i) => {
    const time = row[timeIndex],
      temperature = Number(row[valueIndex]);
    if (
      !time ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(time) ||
      !Number.isFinite(Date.parse(time)) ||
      !row[valueIndex] ||
      !Number.isFinite(temperature) ||
      temperature < -100 ||
      temperature > 70
    )
      throw new Error(
        `Invalid observation on CSV row ${i + 2}. Use ISO timestamps with a time zone.`,
      );
    return { time, temperature };
  });
}
export function ComparisonView() {
  const { place } = useApp();
  const [data, setData] = useState<Comparison | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState<string[]>([
      "observed",
      "Open-Meteo",
      "ECMWF",
      "WRF",
    ]),
    [fileName, setFileName] = useState("");
  const colors: Record<string, string> = {
    observed: "#34d399",
    "Open-Meteo": "#38bdf8",
    ECMWF: "#a78bfa",
    WRF: "#fb923c",
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OBSERVATIONS & MODELS</div>
          <h1>
            How close was the forecast<span className="heading-dot">?</span>
          </h1>
          <p>
            Compare your sensor measurements with model output for {place.name}.
          </p>
        </div>
      </div>
      <Panel title="Bring your observations">
        <p className="panel-intro">
          GPS identifies your location. To measure model accuracy, upload actual
          temperature observations from a station or sensor at this location.
        </p>
        <label className="upload-area">
          <Upload size={27} />
          <strong>{fileName || "Choose a temperature CSV"}</strong>
          <span>
            Columns: time, temperature · °C · ISO timestamp with timezone
          </span>
          <input
            aria-label="Upload observations CSV"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setError("");
              setData(null);
              setFileName(f.name);
              try {
                if (f.size > 500000)
                  throw new Error("CSV must be smaller than 500 KB");
                const observations = parseObservations(await f.text());
                setData(
                  await api<Comparison>("/models/compare", {
                    method: "POST",
                    body: JSON.stringify({
                      latitude: place.latitude,
                      longitude: place.longitude,
                      observations,
                    }),
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <SourceNote note="Use measurements from 2022 onward, covering no more than 90 days. Timestamps are aligned to model hours within 30 minutes." />
      </Panel>
      {busy && (
        <Loading label="Aligning observations with archived forecasts…" />
      )}
      {error && <ErrorState message={error} />}{" "}
      {data && (
        <>
          <Panel
            title="Observed vs modeled temperature"
            action={<Badge>{data.series.length} observations</Badge>}
          >
            <div className="checks chart-series">
              {["observed", ...Object.keys(data.metrics)].map((name) => (
                <label className="check-row" key={name}>
                  <input
                    type="checkbox"
                    checked={visible.includes(name)}
                    onChange={() =>
                      setVisible((v) =>
                        v.includes(name)
                          ? v.filter((x) => x !== name)
                          : [...v, name],
                      )
                    }
                  />
                  {name === "observed" ? "Observed" : name}
                </label>
              ))}
            </div>
            <DataChart
              data={data.series.map((p) => ({
                ...p,
                label: `${dateLabel(p.time)} ${clock(p.time)}`,
              }))}
              series={visible
                .filter((k) => k === "observed" || k in data.metrics)
                .map((key) => ({ key, name: key, color: colors[key] }))}
              kind="line"
              height={320}
              suffix="°"
            />
          </Panel>
          <Panel title="Statistical comparison">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Paired samples</th>
                    <th>MAE °C</th>
                    <th>RMSE °C</th>
                    <th>Bias °C</th>
                    <th>Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.metrics).map(([name, stats]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{stats.n}</td>
                      <td>{number(stats.mae, 2)}</td>
                      <td>{number(stats.rmse, 2)}</td>
                      <td>{number(stats.bias, 2)}</td>
                      <td>{number(stats.correlation, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Deviation from observations">
            <DataChart
              data={data.series.map((p) => ({
                label: `${dateLabel(p.time)} ${clock(p.time)}`,
                ...Object.fromEntries(
                  Object.keys(data.metrics).map((k) => [
                    k,
                    p[k] == null ? null : p[k]! - p.observed,
                  ]),
                ),
              }))}
              series={Object.keys(data.metrics)
                .filter((k) => visible.includes(k))
                .map((key) => ({ key, name: key, color: colors[key] }))}
              kind="line"
              height={250}
              suffix="°"
            />
          </Panel>
          <div className="availability-list">
            {Object.entries(data.availability).map(([model, status]) => (
              <span key={model}>
                {model}:{" "}
                <Badge level={status === "available" ? "low" : "neutral"}>
                  {status}
                </Badge>
              </span>
            ))}
          </div>
          <SourceNote sources={data.sources} note={data.method} />
        </>
      )}
      {!busy && !data && !error && (
        <div className="empty-state">
          <Activity size={34} />
          <h2>Accuracy starts with real observations</h2>
          
        </div>
      )}
    </div>
  );
}
