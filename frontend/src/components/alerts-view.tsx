"use client";
import { useEffect, useState } from "react";
import { Bell, RefreshCw, ShieldCheck, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { api, coords, speak } from "@/lib/api";
import { useApp } from "@/lib/context";
import type { Alerts } from "@/lib/types";
import { clock } from "@/lib/weather";
import { Badge, ErrorState, Loading, Panel, SourceNote } from "./common";
export function AlertsView() {
  const { place, config } = useApp();
  const [data, setData] = useState<Alerts | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api<Alerts>(`/alerts/live?${coords(place)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setData(null);
    void load();
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, [place.latitude, place.longitude]);
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">STAY INFORMED</div>
          <h1>
            Weather alerts<span className="heading-dot">.</span>
          </h1>
          <p>
            Official warnings and separate forecast screening for {place.name}.
          </p>
        </div>
        <button className="button secondary" onClick={load} disabled={busy}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {busy && !data && <Loading />}
      {error && <ErrorState message={error} retry={load} />}{" "}
      {data && (
        <>
          <div className="coverage-bar">
            {data.coverage.map((c, i) => (
              <span key={i}>
                {c.source}
                <Badge level={c.status === "available" ? "low" : "neutral"}>
                  {c.status}
                </Badge>
              </span>
            ))}
          </div>
          {data.alerts.length ? (
            data.alerts.map((a) => (
              <Panel
                key={a.id}
                title={a.event}
                action={<Badge level={a.severity}>{a.severity}</Badge>}
              >
                <h3>{a.headline}</h3>
                <p className="alert-description">{a.description}</p>
                {a.instruction && (
                  <div className="inline-notice">
                    <strong>Official instructions</strong>
                    <p>{a.instruction}</p>
                  </div>
                )}
                <div className="alert-footer">
                  <SourceNote
                    sources={[a.source]}
                    note={
                      a.expires
                        ? `Expires ${new Date(a.expires).toLocaleString()}`
                        : undefined
                    }
                  />
                  <button
                    className="text-button"
                    disabled={!config?.ai_enabled}
                    onClick={() =>
                      speak(a.headline || a.event).catch((e) =>
                        toast.error(e.message),
                      )
                    }
                  >
                    <Volume2 size={16} />
                    Read alert
                  </button>
                </div>
              </Panel>
            ))
          ) : (
            <Panel>
              <div className="empty-state">
                <Bell size={34} />
                <h2>No active alerts returned</h2>
              </div>
            </Panel>
          )}
          <Panel
            title="Next 24 hours: weather screening"
            action={
              <Badge level={data.screening.level}>{data.screening.level}</Badge>
            }
          >
            {data.screening.factors.length ? (
              <div className="stack">
                {data.screening.factors.map((f, i) => (
                  <div className="risk-row" key={i}>
                    <div>
                      <strong>
                        {f.type.charAt(0).toUpperCase() + f.type.slice(1)}
                      </strong>
                      <p>{f.description}</p>
                    </div>
                    <Badge level={data.screening.level}>
                      {clock(data.screening.time)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-intro">
                No modeled weather values crossed the configured screening
                thresholds for heat, cold, heavy rain, strong wind, low
                visibility, or thunderstorms.
              </p>
            )}
            <SourceNote note={data.screening.basis} />
          </Panel>
          <div className="severity-key">
            {["Green", "Yellow", "Orange", "Red"].map((s, i) => (
              <span key={s}>
                <Badge level={s}>{s}</Badge>
                {["Minor", "Moderate", "Severe", "Extreme"][i]}
              </span>
            ))}
          </div>
          <SourceNote
            note={`Last checked ${new Date(data.updated_at).toLocaleString()}. Configure push and voice preferences in Settings.`}
          />
        </>
      )}
    </div>
  );
}
