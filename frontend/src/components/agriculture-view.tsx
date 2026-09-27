"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Droplets, Leaf, Sprout, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/context";
import { clock, dateLabel, localDate, number } from "@/lib/weather";
import type { CropReport, Point } from "@/lib/types";
import { Badge, ErrorState, Loading, Panel, SourceNote, Stat } from "./common";
import { PlaceSearch } from "./search";
const WeatherMap = dynamic(() => import("./weather-map"), { ssr: false });
export function AgricultureView() {
  const { place, user, setAuthOpen } = useApp();
  const [field, setField] = useState<Point>(place),
    [fieldName, setFieldName] = useState(place.name),
    [crop, setCrop] = useState("wheat"),
    [sowing, setSowing] = useState(localDate(-60)),
    [report, setReport] = useState<CropReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [past, setPast] = useState<CropReport[]>([]);
  const submit = async () => {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(
        await api<CropReport>("/agriculture/advice", {
          method: "POST",
          body: JSON.stringify({ ...field, crop, sowing_date: sowing }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FARMER MODE</div>
          <h1>
            Make the forecast work for your field
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Crop-specific water demand, weather windows, and growing conditions.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={async () => {
            if (user?.guest) return setAuthOpen(true);
            try {
              setPast(await api<CropReport[]>("/agriculture/reports"));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Saved reports
        </button>
      </div>
      <div className="two-column">
        <Panel title="Your field">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label>
              Field location
              <PlaceSearch
                initial={fieldName}
                onSelect={(p) => {
                  setField(p);
                  setFieldName(p.name);
                }}
              />
            </label>
            <div className="form-row">
              <label>
                Crop
                <select value={crop} onChange={(e) => setCrop(e.target.value)}>
                  {[
                    "wheat",
                    "rice",
                    "maize",
                    "cotton",
                    "tomato",
                    "potato",
                    "sugarcane",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sowing date
                <input
                  type="date"
                  required
                  max={localDate()}
                  value={sowing}
                  onChange={(e) => setSowing(e.target.value)}
                />
              </label>
            </div>
            <p className="source-note">
              {field.latitude.toFixed(4)}°, {field.longitude.toFixed(4)}° · Pin
              your field on the map for a local forecast.
            </p>
            <button className="button primary" disabled={busy}>
              <Sprout size={17} />
              Analyze my field
            </button>
          </form>
        </Panel>
        <WeatherMap
          compact
          point={field}
          onPick={(p) => {
            setField(p);
            setFieldName("Selected field");
          }}
        />
      </div>
      {busy && (
        <Loading label="Calculating crop water demand and weather windows…" />
      )}
      {error && <ErrorState message={error} retry={submit} />}{" "}
      {report && (
        <>
          <div className="report-heading">
            <div>
              <Badge level="low">
                {report.crop.toUpperCase()} · {report.stage}
              </Badge>
              <h2>{report.age_days} days since sowing</h2>
            </div>
            <Badge
              level={
                report.risk_score >= 50
                  ? "high"
                  : report.risk_score >= 25
                    ? "moderate"
                    : "low"
              }
            >
              Weather risk {report.risk_score}/100
            </Badge>
          </div>
          {report.ai_summary && (
            <div className="inline-notice">
              <strong>AI field briefing</strong>
              <p>{report.ai_summary}</p>
            </div>
          )}
          <div className="stats-row">
            <Stat
              label="72-hour water deficit"
              icon={<Droplets size={17} />}
              value={`${number(report.irrigation_mm_72h, 1)} mm`}
              detail="Verify root-zone soil moisture"
            />
            <Stat
              label="72-hour rainfall"
              value={`${number(report.rain_mm_72h, 1)} mm`}
              detail="Model forecast"
            />
            <Stat
              label="Surface soil moisture"
              value={`${number(report.soil_moisture == null ? null : report.soil_moisture * 100, 1)}%`}
              detail="Volumetric · modeled 0–1 cm"
            />
            <Stat
              label="Heat stress"
              icon={<Sun size={17} />}
              value={report.heat_stress ? "Flagged" : "Lower"}
              detail={`Weather disease risk: ${report.disease_weather_risk}`}
            />
          </div>
          <div className="two-column">
            <Panel title="Irrigation & growing conditions">
              <div className="advice-block">
                <Droplets size={21} />
                <div>
                  <h3>Irrigation</h3>
                  <p>{report.irrigation_advice}</p>
                </div>
              </div>
              <div className="advice-block">
                <Leaf size={21} />
                <div>
                  <h3>Harvest planning</h3>
                  <p>{report.harvest_recommendation}</p>
                </div>
              </div>
              <p className="source-note">{report.risk_explanation}</p>
            </Panel>
            <Panel title="Spraying weather windows">
              {report.spraying_windows.length ? (
                <div className="window-list">
                  {report.spraying_windows.map((t) => (
                    <div key={t}>
                      <span>{dateLabel(t)}</span>
                      <strong>{clock(t)}</strong>
                      <Badge level="low">Conditions favorable</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-intro">
                  No forecast hours met the wind, rain, and temperature
                  thresholds in the next 72 hours.
                </p>
              )}
              <SourceNote note={report.spraying_note} />
            </Panel>
          </div>
          <SourceNote
            sources={report.sources}
            note={`${report.method} ${report.soil_depth}.`}
          />
          {user?.guest && (
            <button className="text-button" onClick={() => setAuthOpen(true)}>
              Create an account to save future reports
            </button>
          )}
        </>
      )}
      {past.length > 0 && (
        <Panel title="Saved field reports">
          <div className="saved-report-list">
            {past.map((p) => (
              <button
                className="button secondary"
                key={p.id}
                onClick={() => setReport(p)}
              >
                {p.crop} · {p.stage} · Risk {p.risk_score}/100
              </button>
            ))}
          </div>
        </Panel>
      )}
      {!report && !busy && (
        <div className="empty-state">
          <Sprout size={34} />
          <h2>A weather-aware growing plan</h2>
          <p>
            Choose your crop and sowing date. Calculations use forecast
            rainfall, reference evapotranspiration, and generalized crop
            coefficients.
          </p>
        </div>
      )}
    </div>
  );
}
