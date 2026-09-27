export type Point = { latitude: number; longitude: number };
export type Place = Point & {
  name: string;
  id?: string;
  admin1?: string;
  country?: string;
  position?: number;
};
export type User = {
  id: string;
  display_name: string;
  email?: string;
  avatar?: string;
  home_location?: Place;
  guest: boolean;
};
export type WeatherPoint = {
  time: number;
  temperature_2m: number | null;
  [key: string]: number | null;
};
export type Forecast = Point & {
  current: WeatherPoint;
  hourly: WeatherPoint[];
  daily: WeatherPoint[];
  air_quality: { us_aqi?: number; pm2_5?: number; pm10?: number } | null;
  air_hourly: WeatherPoint[];
  timezone: string;
  elevation: number;
  fetched_at: string;
  sources: string[];
  availability: Record<string, string>;
  units: Record<string, string>;
};
export type Risk = {
  score: number;
  level: string;
  severity: string;
  factors: { type: string; score: number; description: string }[];
  missing_metrics: string[];
  basis: string;
  time?: number;
};
export type OfficialAlert = {
  id: string;
  event: string;
  type: string;
  severity: string;
  headline?: string;
  description?: string;
  instruction?: string;
  expires?: string;
  source: string;
  official: boolean;
  geometry?: GeoJSON.Geometry;
};
export type Alerts = {
  alerts: OfficialAlert[];
  coverage: { source: string; status: string }[];
  screening: Risk;
  updated_at: string;
  message?: string;
};
export type Layer = {
  id: string;
  name: string;
  available: boolean;
  type: string;
  source: string;
  reason?: string;
  frames: { time: number }[];
};
export type Layers = {
  layers: Layer[];
  radar_frames: { time: number; path: string }[];
  radar_host: string;
  grid_note: string;
};
export type CropReport = {
  id?: string;
  crop: string;
  age_days: number;
  stage: string;
  crop_coefficient: number;
  irrigation_mm_72h: number | null;
  irrigation_advice: string;
  rain_mm_72h: number;
  soil_moisture: number | null;
  soil_depth: string;
  spraying_windows: number[];
  spraying_note: string;
  harvest_recommendation: string;
  heat_stress: boolean;
  disease_weather_risk: string;
  risk_score: number;
  risk_explanation: string;
  method: string;
  sources: string[];
  ai_summary?: string;
  ai_available: boolean;
};
export type RouteSample = Point & {
  distance_m: number;
  eta: number;
  weather: WeatherPoint;
  risk: Risk;
  hazards: {
    layer: string;
    properties: Record<string, unknown>;
    source: string;
  }[];
};
export type RouteAnalysis = {
  id?: string;
  name: string;
  distance_km: number;
  duration_minutes: number;
  samples: RouteSample[];
  geometry: GeoJSON.LineString;
  segments: GeoJSON.FeatureCollection;
  sources: string[];
  unavailable_feeds: string[];
  rest_stops: (Place & { safety_verified: boolean })[];
  rest_stops_status: string;
  max_risk_score: number;
  limitations: string;
};
export type TrendRow = {
  period: string;
  temperature: number | null;
  rainfall: number | null;
  humidity: number | null;
  wind: number | null;
  aqi: number | null;
  hours: number;
};
export type Trends = {
  series: TrendRow[];
  deltas: Record<string, number | null>;
  aqi_status: string;
  sources: string[];
  period: string;
};
export type HistoryData = {
  hourly: WeatherPoint[];
  daily: WeatherPoint[];
  timezone: string;
  sources: string[];
};
export type ChatAnswer = {
  explanation: string;
  risk_level: string;
  confidence_percent: number;
  recommendation: string;
  uncertainty: string;
  sources: string[];
  conversation_id: string;
  tools_used: { name: string; ok: boolean }[];
  confidence_note: string;
};
export type Comparison = {
  series: { time: number; observed: number; [key: string]: number | null }[];
  metrics: Record<
    string,
    {
      n: number;
      mae: number | null;
      rmse: number | null;
      bias: number | null;
      correlation: number | null;
    }
  >;
  availability: Record<string, string>;
  sources: string[];
  method: string;
};
export type Preferences = {
  alert_types: string[];
  severities: string[];
  push_enabled: boolean;
  voice_enabled: boolean;
  language: "en" | "hi";
  voice: string;
};
export type Config = {
  ai_enabled: boolean;
  google_client_id: string;
  push_enabled: boolean;
  firebase: Record<string, string>;
  firebase_vapid_key: string;
  environment: string;
  wrf_enabled: boolean;
  regional_alerts_enabled: boolean;
};
export type Units = "metric" | "imperial";
