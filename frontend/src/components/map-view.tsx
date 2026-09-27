"use client";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/context";
import { Loading } from "./common";
const WeatherMap = dynamic(() => import("./weather-map"), {
  ssr: false,
  loading: () => <Loading label="Loading map…" />,
});
export function MapView() {
  const { place, setPlace } = useApp();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEE THE BIGGER PICTURE</div>
          <h1>
            Weather, mapped<span className="heading-dot">.</span>
          </h1>
          <p>
            Explore weather layers and time. Select a point to move your
            forecast.
          </p>
        </div>
      </div>
      <WeatherMap
        point={place}
        controls
        onPick={(p) =>
          setPlace({
            ...p,
            name: `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`,
          })
        }
      />
      <p className="source-note">
        Radar: RainViewer. Forecast fields: Open-Meteo sampled grid around your
        selected point. Optional hazard layers appear when a provider is
        connected. Basemap contributors are credited on the map.
      </p>
    </div>
  );
}
