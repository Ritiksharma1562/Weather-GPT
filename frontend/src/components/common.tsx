"use client";
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudMoon,
  Moon,
  LoaderCircle,
  RefreshCw,
  Sun,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
export function WeatherIcon({
  code,
  size = 28,
  isDay = true,
}: {
  code: number | null | undefined;
  size?: number;
  isDay?: boolean;
}) {
  const Icon =
    code == null
      ? Cloud
      : code === 0
        ? isDay
          ? Sun
          : Moon
        : code < 3
          ? isDay
            ? CloudSun
            : CloudMoon
          : code < 50
            ? Cloud
            : code < 60
              ? CloudDrizzle
              : code < 70
                ? CloudRain
                : code < 80
                  ? CloudSnow
                  : code < 90
                    ? CloudRain
                    : CloudLightning;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
export function Loading({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={26} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <TriangleAlert size={24} />
      <div>
        <strong>We couldn’t load this data</strong>
        <p>{message}</p>
        {retry && (
          <button className="button secondary" onClick={retry}>
            <RefreshCw size={15} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  level = "",
}: {
  children: ReactNode;
  level?: string;
}) {
  return (
    <span className={`badge ${level.toLowerCase().replaceAll(" ", "-")}`}>
      {children}
    </span>
  );
}
export function SourceNote({
  sources,
  note,
}: {
  sources?: string[];
  note?: string;
}) {
  return (
    <div className="source-note">
      {note && <span>{note}</span>}
      {sources?.length ? <span>Source: {sources.join(" · ")}</span> : null}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <strong className="stat-value">{value}</strong>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}
