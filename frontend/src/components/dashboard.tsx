"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  Droplets,
  Eye,
  Gauge,
  Leaf,
  MapPin,
  RefreshCw,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/context";
import { api, coords } from "@/lib/api";
import {
  aqiLabel,
  clock,
  condition,
  dateLabel,
  day,
  number,
  temperature,
  wind,
} from "@/lib/weather";
import type { Forecast, Place, WeatherPoint } from "@/lib/types";
import {
  Badge,
  ErrorState,
  Loading,
  Panel,
  SourceNote,
  Stat,
  WeatherIcon,
} from "./common";
const DataChart = dynamic(() => import("./charts").then((m) => m.DataChart), {
  ssr: false,
  loading: () => <Loading label="Loading chart…" />,
});
const WeatherMap = dynamic(() => import("./weather-map"), {
  ssr: false,
  loading: () => <Loading label="Loading map…" />,
});
const cities: Place[] = [
  {
    name: "London",
    country: "United Kingdom",
    latitude: 51.5074,
    longitude: -0.1278,
  },
  { name: "Mumbai", country: "India", latitude: 19.076, longitude: 72.8777 },
  {
    name: "Singapore",
    country: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
  },
];
export function Dashboard() {
  const {
    weather: w,
    place,
    setPlace,
    loading,
    error,
    refresh,
    units,
    user,
    setAuthOpen,
    reloadSaved,
    saved,
    config,
  } = useApp();
  const [cityWeather, setCityWeather] = useState<Record<string, WeatherPoint>>(
    {},
  );
  const [summary, setSummary] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSummary("");
    if (config?.ai_enabled && user && w)
      api<{ summary: string }>(`/ai/summary?${coords(place)}`)
        .then((r) => {
          if (!cancelled) setSummary(r.summary);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    config?.ai_enabled,
    user?.id,
    place.latitude,
    place.longitude,
    w?.current.time,
  ]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (saved.length ? saved.slice(0, 3) : cities).map(async (p) => {
        try {
          const d = await api<Forecast>(`/weather/current?${coords(p)}`);
          return [coords(p), d.current] as const;
        } catch {
          return [coords(p), null] as const;
        }
      }),
    ).then((data) => {
      if (!cancelled)
        setCityWeather(
          Object.fromEntries(
            data.filter(
              (d): d is readonly [string, WeatherPoint] => d[1] !== null,
            ),
          ),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [saved]);
  if (loading && !w)
    return <Loading label={`Fetching live conditions for ${place.name}…`} />;
  if (error && !w) return <ErrorState message={error} retry={refresh} />;
  if (!w) return null;
  const c = w.current,
    today = w.daily[0],
    hours = w.hourly.filter((p) => p.time >= c.time).slice(0, 24);
  const save = async () => {
    if (!user || user.guest) return setAuthOpen(true);
    try {
      await api("/places", {
        method: "POST",
        body: JSON.stringify({
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        }),
      });
      await reloadSaved();
      toast.success("Place saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const daylight =
    today.sunrise && today.sunset
      ? Math.max(
          0,
          Math.min(
            1,
            (c.time - today.sunrise) / (today.sunset - today.sunrise),
          ),
        )
      : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-stack"
    >
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR DAY, IN FOCUS</div>
          <h1>
            Weather overview<span className="heading-dot">.</span>
          </h1>
          <p>
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: w.timezone,
            }).format(c.time * 1000)}{" "}
            <span className="muted-dot">·</span> {place.name},{" "}
            {place.country || `${place.latitude.toFixed(2)}°`}
          </p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="button primary" onClick={save}>
            <BookmarkPlus size={16} />
            Save place
          </button>
        </div>
      </div>
      {error && (
        <div className="inline-notice">
          Showing the last successful update. {error}
        </div>
      )}
      <div className="dashboard-top">
        <section className="today-card">
          <div className="today-top">
            <span className="location-tag">
              <MapPin size={16} />
              {place.name}
            </span>
            <span className="today-time">
              {clock(c.time, w.timezone)}{" "}
              <span className="today-live">CURRENT</span>
            </span>
          </div>
          <div className="today-main">
            <div>
              <div className="temperature-hero">
                {temperature(c.temperature_2m, units)}
                <span>{units === "metric" ? "C" : "F"}</span>
              </div>
              <h2>{condition(c.weather_code)}</h2>
              <p>
                Feels like {temperature(c.apparent_temperature, units)}{" "}
                <span>·</span> H: {temperature(today.temperature_2m_max, units)}{" "}
                L: {temperature(today.temperature_2m_min, units)}
              </p>
            </div>
            <motion.div
              className="hero-weather-icon"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <WeatherIcon
                code={c.weather_code}
                size={106}
                isDay={c.is_day !== 0}
              />
            </motion.div>
          </div>
          <div className="today-metrics">
            <span>
              <Wind size={17} />
              {wind(c.wind_speed_10m, units)}
            </span>
            <span>
              <Droplets size={17} />
              {number(c.relative_humidity_2m)}% humidity
            </span>
            <span>
              <Eye size={17} />
              {number(c.visibility == null ? null : c.visibility / 1000, 1)} km
              visibility
            </span>
          </div>
          <div className="weekly-strip">
            {w.daily.slice(0, 7).map((p, i) => (
              <Link href="/forecast" key={p.time}>
                <span>{i === 0 ? "Today" : day(p.time, w.timezone)}</span>
                <WeatherIcon code={p.weather_code} size={24} />
                <strong>
                  {temperature(p.temperature_2m_max, units)}{" "}
                  <small>{temperature(p.temperature_2m_min, units)}</small>
                </strong>
              </Link>
            ))}
          </div>
        </section>
        <Panel title="Today’s highlights" className="highlights">
          <div className="highlight-grid">
            <Stat
              label="Air quality"
              icon={<Leaf size={17} />}
              value={number(w.air_quality?.us_aqi)}
              detail={
                <Badge
                  level={
                    (w.air_quality?.us_aqi ?? 999) <= 100 ? "moderate" : "high"
                  }
                >
                  {aqiLabel(w.air_quality?.us_aqi)}
                </Badge>
              }
            />
            <Stat
              label="UV index"
              icon={<Sun size={17} />}
              value={number(c.uv_index, 1)}
              detail={
                c.uv_index == null
                  ? "Unavailable"
                  : c.uv_index < 3
                    ? "Low exposure"
                    : c.uv_index < 6
                      ? "Moderate exposure"
                      : "High exposure"
              }
            />
            <Stat
              label="Wind speed"
              icon={<Wind size={17} />}
              value={wind(c.wind_speed_10m, units)}
              detail={`Gusts ${wind(c.wind_gusts_10m, units)}`}
            />
            <Stat
              label="Pressure"
              icon={<Gauge size={17} />}
              value={
                <>
                  {number(c.pressure_msl)}
                  <small> hPa</small>
                </>
              }
              detail="At sea level"
            />
          </div>
          <div className="daylight">
            <div className="daylight-head">
              <span>
                <Sunrise size={16} />
                Sunrise <b>{clock(today.sunrise, w.timezone)}</b>
              </span>
              <span>
                Sunset <b>{clock(today.sunset, w.timezone)}</b>
                <Sunset size={16} />
              </span>
            </div>
            <div className="daylight-track">
              <div style={{ width: `${daylight * 100}%` }} />
              <Sun size={16} style={{ left: `${daylight * 100}%` }} />
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="The next 24 hours"
        eyebrow="HOURLY FORECAST"
        action={
          <Link className="text-button" href="/forecast">
            Full forecast <ArrowRight size={16} />
          </Link>
        }
      >
        <div className="hourly-rail">
          {hours.map((p, i) => (
            <div className={`hour-card ${i === 0 ? "now" : ""}`} key={p.time}>
              <span>{i === 0 ? "Next hour" : clock(p.time, w.timezone)}</span>
              <WeatherIcon code={p.weather_code} isDay={p.is_day !== 0} />
              <strong>{temperature(p.temperature_2m, units)}</strong>
              <small>
                <Droplets size={12} />
                {number(p.precipitation_probability)}%
              </small>
            </div>
          ))}
        </div>
      </Panel>
      <div className="dashboard-middle">
        <Panel
          title="Chance of rain"
          eyebrow="PRECIPITATION"
          action={<Badge level="neutral">Next 12 hours</Badge>}
        >
          <DataChart
            data={hours.slice(0, 12).map((p) => ({
              label: clock(p.time, w.timezone),
              chance: p.precipitation_probability,
            }))}
            series={[{ key: "chance", name: "Rain chance" }]}
            kind="bar"
            suffix="%"
            domain={[0, 100]}
            height={214}
          />
        </Panel>
        <Panel
          title="A wider perspective"
          eyebrow="WEATHER MAP"
          action={
            <Link
              className="icon-button"
              href="/map"
              aria-label="Expand weather map"
            >
              <ArrowUpRight size={19} />
            </Link>
          }
          className="mini-map-panel"
        >
          <WeatherMap point={place} compact />
          <div className="map-caption">
            <span>
              <MapPin size={13} />
              {place.name}
            </span>
            <Link href="/map">
              Explore layers <ArrowRight size={14} />
            </Link>
          </div>
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title={saved.length ? "Your saved places" : "Elsewhere in the world"}
          action={<span className="eyebrow">QUICK SWITCH</span>}
        >
          <div className="city-grid">
            {(saved.length ? saved.slice(0, 3) : cities).map((p) => (
              <button
                key={p.id || p.name}
                className="city-card"
                onClick={() => setPlace(p)}
              >
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.country ||
                      `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`}
                  </small>
                </div>
                <WeatherIcon
                  code={cityWeather[coords(p)]?.weather_code}
                  size={26}
                />
                <b>
                  {temperature(cityWeather[coords(p)]?.temperature_2m, units)}
                </b>
              </button>
            ))}
          </div>
        </Panel>
        <Link className="chat-prompt" href="/chat">
          <span className="sparkle-box">
            <Sparkles size={24} />
          </span>
          <div>
            <h2>A question about the weather?</h2>
            <p>Get an answer grounded in live data.</p>
          </div>
          <ArrowUpRight size={24} />
        </Link>
      </div>
      {summary && (
        <div className="inline-notice ai-summary">
          <Sparkles size={18} />
          <div>
            <strong>AI weather briefing</strong>
            <p>{summary}</p>
          </div>
        </div>
      )}
      <SourceNote
        sources={w.sources}
        note={`Updated ${clock(c.time, w.timezone)} · `}
      />
    </motion.div>
  );
}
