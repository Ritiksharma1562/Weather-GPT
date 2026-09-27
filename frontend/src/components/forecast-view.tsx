"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/context";
import {
  clock,
  condition,
  dateLabel,
  day,
  number,
  temperature,
  wind,
} from "@/lib/weather";
import { ErrorState, Loading, Panel, SourceNote, WeatherIcon } from "./common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
const DataChart = dynamic(() => import("./charts").then((m) => m.DataChart), {
  ssr: false,
});
const metrics = {
  temperature_2m: ["Temperature", "°"],
  apparent_temperature: ["Feels like", "°"],
  precipitation_probability: ["Rain probability", "%"],
  wind_speed_10m: ["Wind speed", ""],
  relative_humidity_2m: ["Humidity", "%"],
  cloud_cover: ["Cloud cover", "%"],
  uv_index: ["UV index", ""],
};
export function ForecastView() {
  const { weather, place, loading, error, refresh, units } = useApp();
  const [metric, setMetric] = useState<keyof typeof metrics>("temperature_2m");
  if (loading && !weather) return <Loading />;
  if (!weather) return <ErrorState message={error} retry={refresh} />;
  const hours = weather.hourly
    .filter((p) => p.time >= weather.current.time)
    .slice(0, 72);
  const value = (v: number | null) =>
    v == null
      ? null
      : units === "imperial" &&
          (metric === "temperature_2m" || metric === "apparent_temperature")
        ? Math.round(((v * 9) / 5 + 32) * 10) / 10
        : units === "imperial" && metric === "wind_speed_10m"
          ? Math.round((v / 1.609344) * 10) / 10
          : v;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLAN AHEAD</div>
          <h1>
            Your forecast<span className="heading-dot">.</span>
          </h1>
          <p>72 hours of detail. A 15-day outlook for {place.name}.</p>
        </div>
        <label className="compact-label">
          Explore metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as keyof typeof metrics)}
          >
            {Object.entries(metrics).map(([k, [label]]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Panel title={`${metrics[metric][0]} over the next 72 hours`}>
        <DataChart
          data={hours.map((p) => ({
            label: `${day(p.time, weather.timezone)} ${clock(p.time, weather.timezone)}`,
            value: value(p[metric]),
          }))}
          series={[{ key: "value", name: metrics[metric][0] }]}
          suffix={metrics[metric][1]}
          kind={metric === "precipitation_probability" ? "bar" : "area"}
          height={300}
        />
      </Panel>
      <Tabs defaultValue="daily">
        <TabsList className="tabs-list">
          <TabsTrigger value="daily">15-day outlook</TabsTrigger>
          <TabsTrigger value="hourly">Hourly details</TabsTrigger>
        </TabsList>
        <TabsContent value="daily">
          <Panel>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Conditions</th>
                    <th>Low / High</th>
                    <th>Feels like</th>
                    <th>Rain chance</th>
                    <th>Rainfall</th>
                    <th>Wind</th>
                    <th>UV</th>
                  </tr>
                </thead>
                <tbody>
                  {weather.daily.map((p, i) => (
                    <tr key={p.time}>
                      <td>
                        <strong>
                          {i === 0 ? "Today" : day(p.time, weather.timezone)}
                        </strong>
                        <small>{dateLabel(p.time, weather.timezone)}</small>
                      </td>
                      <td>
                        <span className="weather-cell">
                          <WeatherIcon code={p.weather_code} size={23} />
                          {condition(p.weather_code)}
                        </span>
                      </td>
                      <td>
                        {temperature(p.temperature_2m_min, units)} /{" "}
                        <strong>
                          {temperature(p.temperature_2m_max, units)}
                        </strong>
                      </td>
                      <td>
                        {temperature(p.apparent_temperature_min, units)} /{" "}
                        {temperature(p.apparent_temperature_max, units)}
                      </td>
                      <td className="cyan">
                        {number(p.precipitation_probability_max)}%
                      </td>
                      <td>{number(p.precipitation_sum, 1)} mm</td>
                      <td>{wind(p.wind_speed_10m_max, units)}</td>
                      <td>{number(p.uv_index_max, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="hourly">
          <Panel>
            <div className="table-scroll tall-table">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Temperature</th>
                    <th>Feels like</th>
                    <th>Rain</th>
                    <th>Cloud</th>
                    <th>Wind</th>
                    <th>Humidity</th>
                    <th>UV</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((p) => (
                    <tr key={p.time}>
                      <td>
                        {day(p.time, weather.timezone)}{" "}
                        {clock(p.time, weather.timezone)}
                      </td>
                      <td>{temperature(p.temperature_2m, units)}</td>
                      <td>{temperature(p.apparent_temperature, units)}</td>
                      <td>{number(p.precipitation_probability)}%</td>
                      <td>{number(p.cloud_cover)}%</td>
                      <td>{wind(p.wind_speed_10m, units)}</td>
                      <td>{number(p.relative_humidity_2m)}%</td>
                      <td>{number(p.uv_index, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
      <SourceNote
        sources={weather.sources}
        note="Confidence decreases further into the forecast. Times use the selected location’s time zone."
      />
    </div>
  );
}
