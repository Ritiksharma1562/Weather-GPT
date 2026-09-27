"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Car,
  Clock,
  MapPin,
  Navigation,
  Pause,
  Route,
  Shield,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { api, session, speak, token } from "@/lib/api";
import { useApp } from "@/lib/context";
import { clock, number, temperature, wind } from "@/lib/weather";
import type {
  Place,
  Point,
  Preferences,
  Risk,
  RouteAnalysis,
} from "@/lib/types";
import { Badge, ErrorState, Loading, Panel, SourceNote, Stat } from "./common";
import { PlaceSearch } from "./search";
import { Switch } from "./ui/switch";
const WeatherMap = dynamic(() => import("./weather-map"), { ssr: false });
type Copilot = {
  weather: Risk;
  nearby: {
    hazards: { layer: string; source: string }[];
    unavailable: string[];
  };
  latitude: number;
  longitude: number;
  ahead?: { distance_m: number; risk: Risk; eta: number }[];
};
export function TravelView() {
  const { place, units, user, config, setAuthOpen } = useApp();
  const [origin, setOrigin] = useState<Place>(place),
    [destination, setDestination] = useState<Place | null>(null),
    [departure, setDeparture] = useState(""),
    [route, setRoute] = useState<RouteAnalysis | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [driving, setDriving] = useState(false),
    [voice, setVoice] = useState(false),
    [copilot, setCopilot] = useState<Copilot | null>(null),
    [gps, setGps] = useState<Point | null>(null),
    [saved, setSaved] = useState<
      { id: string; name: string; analysis: RouteAnalysis }[]
    >([]);
  const socket = useRef<WebSocket | null>(null),
    watch = useRef<number | null>(null),
    voiceOn = useRef(false),
    voiceSettings = useRef({ voice: "coral", language: "en" }),
    lastSpoken = useRef("");
  voiceOn.current = voice;
  useEffect(() => {
    if (user && !user.guest)
      api<Preferences>("/preferences")
        .then((p) => {
          setVoice(p.voice_enabled);
          voiceSettings.current = { voice: p.voice, language: p.language };
        })
        .catch(() => {});
  }, [user]);
  const stop = () => {
    trackingRequested.current = false;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    socket.current?.close();
    socket.current = null;
    setDriving(false);
  };
  const trackingRequested = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  useEffect(() => stop, []);
  const analyze = async () => {
    if (!destination) return;
    setBusy(true);
    setError("");
    setRoute(null);
    stop();
    try {
      setRoute(
        await api<RouteAnalysis>("/route/analyze", {
          method: "POST",
          body: JSON.stringify({
            origin: { latitude: origin.latitude, longitude: origin.longitude },
            destination: {
              latitude: destination.latitude,
              longitude: destination.longitude,
            },
            departure: departure ? new Date(departure).toISOString() : null,
            name: `${origin.name} → ${destination.name}`,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startCopilot = () => {
    if (!navigator.geolocation)
      return toast.error("Location tracking is unavailable");
    trackingRequested.current = true;
    setDriving(true);
    setError("");
    lastSpoken.current = "";
    const ws = new WebSocket(
      process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws/live",
    );
    socket.current = ws;
    ws.onopen = () => {
      retries.current = 0;
      watch.current = navigator.geolocation.watchPosition(
        (position) => {
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setGps(point);
          if (ws.readyState !== WebSocket.OPEN) return;
          if (!(ws as WebSocket & { initialized?: boolean }).initialized) {
            ws.send(
              JSON.stringify({
                token: token(),
                ...point,
                route_samples:
                  route?.samples.map((s) => ({
                    latitude: s.latitude,
                    longitude: s.longitude,
                    eta: s.eta,
                    distance_m: s.distance_m,
                  })) || [],
              }),
            );
            (ws as WebSocket & { initialized?: boolean }).initialized = true;
          } else ws.send(JSON.stringify({ type: "location", ...point }));
        },
        () => {
          toast.error(
            "Location access is required for Copilot. Enable it and restart.",
          );
          stop();
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "error") {
          setError(msg.message);
          return;
        }
        if (msg.copilot) {
          const c: Copilot = msg.copilot;
          setCopilot(c);
          const descriptions = c.weather.factors.map((f) => f.description);
          const upcoming = c.ahead?.find((a) => a.risk.score >= 40);
          if (upcoming)
            descriptions.push(
              `Adverse forecast conditions near the sampled segment ${Math.round(upcoming.distance_m / 100) / 10} kilometers ahead.`,
            );
          const text = descriptions.join(" ");
          if (voiceOn.current && text && text !== lastSpoken.current) {
            lastSpoken.current = text;
            const spoken =
              voiceSettings.current.language === "hi"
                ? `मौसम की स्थिति पर ध्यान दें। जोखिम स्तर ${c.weather.score} है। स्थानीय स्थिति के अनुसार गति कम करें।`
                : text + " Adjust your speed to actual conditions.";
            speak(spoken, voiceSettings.current.voice).catch((e) =>
              toast.error(e.message),
            );
          }
        }
      } catch {
        /* Ignore malformed frames. */
      }
    };
    ws.onclose = () => {
      if (watch.current != null)
        navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      if (trackingRequested.current) {
        setError(
          "Reconnecting live weather. Continue following actual road conditions.",
        );
        reconnectTimer.current = setTimeout(
          async () => {
            try {
              await session();
              if (trackingRequested.current) startCopilot();
            } catch {
              setError(
                "Unable to renew the live session. Restart Copilot when your connection returns.",
              );
              stop();
            }
          },
          Math.min(30000, 3000 * 2 ** retries.current++),
        );
      } else setDriving(false);
    };
    ws.onerror = () => {
      setError(
        "Live connection was interrupted. Restart Copilot when the connection returns.",
      );
      ws.close();
    };
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRAVEL & WEATHERGPT COPILOT</div>
          <h1>
            Know what’s on the way<span className="heading-dot">.</span>
          </h1>
          <p>Weather along your drive, sampled at estimated arrival times.</p>
        </div>
        <button
          className="button secondary"
          onClick={async () => {
            if (user?.guest) return setAuthOpen(true);
            try {
              setSaved(await api("/route/saved"));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Saved trips
        </button>
      </div>
      <Panel>
        <form
          className="form-row trip-form"
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <label>
            From
            <PlaceSearch
              initial={origin.name}
              placeholder="Starting city"
              onSelect={setOrigin}
            />
          </label>
          <label>
            To
            <PlaceSearch
              placeholder="Destination city"
              onSelect={setDestination}
            />
          </label>
          <label>
            Departure
            <input
              type="datetime-local"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={!destination || busy}>
            <Route size={16} />
            Analyze route
          </button>
        </form>
        <p className="source-note" style={{ marginTop: 13 }}>
          Leave the departure time blank to depart now. Up to 500 km per trip;
          departure within 72 hours.
        </p>
      </Panel>
      {busy && (
        <Loading label="Finding your route and checking weather along the way…" />
      )}
      {error && <ErrorState message={error} />}{" "}
      {route ? (
        <>
          <div className="stats-row">
            <Stat
              label="Route distance"
              icon={<Route size={17} />}
              value={`${route.distance_km} km`}
              detail={route.name}
            />
            <Stat
              label="Estimated drive"
              icon={<Clock size={17} />}
              value={`${Math.floor(route.duration_minutes / 60)}h ${route.duration_minutes % 60}m`}
              detail="No live traffic adjustment"
            />
            <Stat
              label="Weather samples"
              icon={<MapPin size={17} />}
              value={route.samples.length}
              detail="About every 5 km"
            />
            <Stat
              label="Highest weather risk"
              icon={<Shield size={17} />}
              value={`${route.max_risk_score}/100`}
              detail="Forecast threshold screening"
            />
          </div>
          <WeatherMap point={gps || origin} route={route} />
          <Panel
            title="WeatherGPT Copilot"
            action={
              <Badge level={driving ? "low" : "neutral"}>
                {driving ? "GPS tracking active" : "Ready when you are"}
              </Badge>
            }
          >
            <div className="copilot-controls">
              <div>
                <p>
                  Updates conditions after roughly 1 km of movement. Keep your
                  device mounted and interact only when stopped.
                </p>
                <label className="check-row">
                  <Switch
                    checked={voice}
                    onCheckedChange={setVoice}
                    disabled={!config?.ai_enabled}
                    aria-label="AI voice alerts"
                  />
                  AI-generated voice alerts
                </label>
              </div>
              <button
                className={`button ${driving ? "secondary" : "primary"}`}
                onClick={driving ? stop : startCopilot}
              >
                {driving ? <Pause size={17} /> : <Navigation size={17} />}{" "}
                {driving ? "Stop Copilot" : "Start Copilot"}
              </button>
            </div>
            {copilot && (
              <div className="copilot-result">
                <Badge level={copilot.weather.level}>
                  {copilot.weather.level} weather risk
                </Badge>
                <p>
                  {copilot.weather.factors
                    .map((f) => f.description)
                    .join(" · ") ||
                    "No weather threshold was crossed at the current location."}
                </p>
                {copilot.ahead
                  ?.filter((p) => p.risk.score >= 25)
                  .map((p, i) => (
                    <p key={i}>
                      {number(p.distance_m / 1000, 1)} km ahead:{" "}
                      {p.risk.factors.map((f) => f.description).join("; ")}
                    </p>
                  ))}
                <small>
                  Unknown feeds:{" "}
                  {copilot.nearby.unavailable.join(", ") || "none"}
                </small>
              </div>
            )}
          </Panel>
          <Panel title="Along your route">
            <div className="table-scroll tall-table">
              <table>
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th>Arrival</th>
                    <th>Temperature</th>
                    <th>Rain</th>
                    <th>Visibility</th>
                    <th>Wind</th>
                    <th>Weather risk</th>
                  </tr>
                </thead>
                <tbody>
                  {route.samples.map((s, i) => (
                    <tr key={i}>
                      <td>{number(s.distance_m / 1000, 1)} km</td>
                      <td>{clock(s.eta)}</td>
                      <td>{temperature(s.weather.temperature_2m, units)}</td>
                      <td>{number(s.weather.precipitation_probability)}%</td>
                      <td>
                        {number(
                          s.weather.visibility == null
                            ? null
                            : s.weather.visibility / 1000,
                          1,
                        )}{" "}
                        km
                      </td>
                      <td>{wind(s.weather.wind_speed_10m, units)}</td>
                      <td>
                        <Badge level={s.risk.level}>{s.risk.level}</Badge>
                        {s.hazards.length > 0 && (
                          <small>
                            {s.hazards.map((h) => h.layer).join(", ")}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="two-column">
            <Panel title="Mapped rest areas">
              {route.rest_stops.length ? (
                <div className="stack">
                  {route.rest_stops.map((s, i) => (
                    <div className="rest-stop" key={i}>
                      <MapPin size={17} />
                      <span>
                        {s.name}
                        <small>
                          {s.latitude.toFixed(3)}°, {s.longitude.toFixed(3)}° ·
                          Safety not verified
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-intro">
                  {route.rest_stops_status === "unavailable"
                    ? "Rest-area data could not be retrieved."
                    : "No mapped rest areas returned for this route area."}
                </p>
              )}
            </Panel>
            <Panel title="Data coverage">
              <p className="panel-intro">
                Connected weather data is available. These additional feeds are
                not connected:
              </p>
              <div className="tag-list">
                {route.unavailable_feeds.map((f) => (
                  <Badge key={f}>{f.replaceAll("_", " ")}</Badge>
                ))}
              </div>
              <SourceNote note="A missing warning is not evidence that a road or rest stop is safe." />
            </Panel>
          </div>
          <SourceNote sources={route.sources} note={route.limitations} />
        </>
      ) : (
        !busy && (
          <Panel>
            <div className="empty-state">
              <Car size={38} />
              <h2>Your route, with weather in mind</h2>
              <p>
                Choose a start and destination to see forecast rain, wind,
                visibility, and temperature along the road.
              </p>
            </div>
          </Panel>
        )
      )}
      {saved.length > 0 && (
        <Panel title="Saved trips">
          <div className="saved-report-list">
            {saved.map((r) => (
              <button
                className="button secondary"
                key={r.id}
                onClick={() => {
                  setRoute(r.analysis);
                  stop();
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
          <p className="source-note">
            Saved analyses are snapshots. Analyze the route again for fresh
            conditions.
          </p>
        </Panel>
      )}
    </div>
  );
}
