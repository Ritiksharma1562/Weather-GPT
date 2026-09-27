"use client";
import {
  ArrowDown,
  BrainCircuit,
  Cloud,
  Database,
  Globe2,
  Layers3,
  Radio,
  Server,
} from "lucide-react";
import { Panel } from "./common";
const sources = [
  [
    "Open-Meteo",
    "Current weather, forecasts, ECMWF model output, historical reanalysis, and climate scenarios.",
    "https://open-meteo.com/en/docs",
  ],
  [
    "CAMS via Open-Meteo",
    "Modeled air quality and US AQI. Not a reading from a sensor at your exact location.",
    "https://open-meteo.com/en/docs/air-quality-api",
  ],
  [
    "NOAA / National Weather Service",
    "Official active alerts in US service areas. Regional authorities require a connected feed.",
    "https://www.weather.gov/documentation/services-web-api",
  ],
  [
    "NASA POWER",
    "Daily historical agriculture and meteorological data, available through the NASA endpoint.",
    "https://power.larc.nasa.gov/docs/services/api/",
  ],
  [
    "RainViewer",
    "Available past radar frames, with coverage dependent on radar networks.",
    "https://www.rainviewer.com/api.html",
  ],
  [
    "OpenStreetMap / OSRM",
    "Road routes, map tiles, and mapped rest areas. Rest-stop safety and live road conditions are not verified.",
    "https://project-osrm.org/docs/v5.24.0/api/",
  ],
  [
    "FAO-56",
    "Generalized crop coefficients and evapotranspiration framework for water-demand screening.",
    "https://www.fao.org/4/X0490E/x0490e00.htm",
  ],
];
export function DocsView() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNDER THE HOOD</div>
          <h1>
            Know your sources<span className="heading-dot">.</span>
          </h1>
          <p>
            Where WeatherGPT’s information comes from, and how to interpret it.
          </p>
        </div>
      </div>
      <Panel title="Four ways to understand your weather">
        <div className="four-pillars">
          {[
            [
              Cloud,
              "Live Dashboard",
              "Conditions and forecasts for the places that matter.",
            ],
            [
              BrainCircuit,
              "AI Weather Chat",
              "Source-aware answers grounded through live tools.",
            ],
            [
              Layers3,
              "Interactive GIS Map",
              "Weather fields and connected risk layers over time.",
            ],
            [
              Globe2,
              "Climate Intelligence",
              "Historical trends and climate-model context.",
            ],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof Cloud;
            return (
              <div key={String(title)}>
                <I size={25} />
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Architecture overview">
        <div className="architecture">
          <div>
            <Globe2 size={22} />
            <strong>Frontend</strong>
            <span>Next.js · React</span>
          </div>
          <span className="architecture-arrow">→</span>
          <div>
            <Server size={22} />
            <strong>Backend</strong>
            <span>FastAPI · WebSocket</span>
          </div>
          <span className="architecture-arrow">→</span>
          <div>
            <BrainCircuit size={22} />
            <strong>Intelligence engines</strong>
            <span>AI · GIS · Weather</span>
          </div>
          <span className="architecture-arrow">→</span>
          <div>
            <Database size={22} />
            <strong>Persistent data</strong>
            <span>PostGIS · Redis</span>
          </div>
        </div>
        <div className="architecture-outputs">
          <ArrowDown size={19} />
          <span>Alerts</span>
          <span>Farming</span>
          <span>Travel & Copilot</span>
        </div>
      </Panel>
      <Panel title="Providers & attribution">
        <div className="provider-list">
          {sources.map(([title, text, url]) => (
            <a key={title} href={url} target="_blank" rel="noreferrer">
              <h3>{title} ↗</h3>
              <p>{text}</p>
            </a>
          ))}
        </div>
      </Panel>
      <Panel title="Reading the results">
        <div className="prose">
          <h2>Forecasts, observations, and GPS</h2>
          <p>
            A GPS position is not a weather measurement. Current conditions are
            model estimates near your location. Model comparison requires
            uploaded station or sensor observations; the comparison reports
            timestamp alignment and sample counts.
          </p>
          <h2>Risk screening and official warnings</h2>
          <p>
            Threshold-based scores help highlight forecast conditions. Official
            alerts are shown separately with their issuing source. Flood,
            landslide, lightning, cyclone, incident, and safe-zone feeds must be
            connected before those layers can provide information. An
            unavailable feed is unknown, never an all-clear.
          </p>
          <h2>AI confidence</h2>
          <p>
            The assistant’s confidence is its own assessment of the available
            evidence, not a calibrated probability. Answers show their sources
            and the tools used. For urgent decisions, follow local authorities
            and what you observe on the ground.
          </p>
          <h2>Exports and units</h2>
          <p>
            Climate and history can be exported as CSV. “Save PDF” opens a
            print-ready layout; choose Save as PDF in your browser. Crop
            calculations and datasets retain the explicitly labeled measurement
            units.
          </p>
          <h2>Running your own instance</h2>
          <p>
            The project includes startup instructions, API documentation, SQL
            migrations, tests, and deployment guides. Service keys are held by
            the backend. Commercial use of weather, routing, radar, and map
            services requires checking each provider’s current usage terms.
          </p>
          <a
            href={(
              process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws/live"
            )
              .replace(/^ws/, "http")
              .replace(/\/ws\/live$/, "/docs")}
            target="_blank"
            rel="noreferrer"
          >
            Open the API reference ↗
          </a>
        </div>
      </Panel>
    </div>
  );
}
