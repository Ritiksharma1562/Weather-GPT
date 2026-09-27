"use client";
import { useEffect, useRef } from "react";
import type { Map as MapType } from "maplibre-gl";

/** Screen-space visualization of the sampled model's wind field; motion is accelerated for readability. */
export function WindFlow({
  map,
  data,
  mode,
}: {
  map: MapType | null;
  data: GeoJSON.FeatureCollection | null;
  mode: "particles" | "barbs";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !map || !data) return;
    const context = el.getContext("2d");
    if (!context) return;
    const samples = data.features.flatMap((f) =>
      f.geometry.type === "Point" &&
      Number.isFinite(f.properties?.wind_speed_10m) &&
      Number.isFinite(f.properties?.wind_direction_10m)
        ? [
            {
              lon: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
              speed: Number(f.properties!.wind_speed_10m),
              direction: Number(f.properties!.wind_direction_10m),
            },
          ]
        : [],
    );
    if (!samples.length) return;
    const bounds = {
      minLon: Math.min(...samples.map((s) => s.lon)),
      maxLon: Math.max(...samples.map((s) => s.lon)),
      minLat: Math.min(...samples.map((s) => s.lat)),
      maxLat: Math.max(...samples.map((s) => s.lat)),
    };
    let frame = 0,
      animation = 0,
      stopped = false,
      lastTime = performance.now();
    const random = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const createParticle = (i: number) => ({
      lon: bounds.minLon + random(i + 1) * (bounds.maxLon - bounds.minLon),
      lat: bounds.minLat + random(i + 510) * (bounds.maxLat - bounds.minLat),
      age: Math.floor(random(i + 91) * 80),
    });
    const particles = Array.from({ length: 120 }, (_, i) => createParticle(i));
    const resize = () => {
      const rect = map.getContainer().getBoundingClientRect();
      el.width = Math.round(rect.width * devicePixelRatio);
      el.height = Math.round(rect.height * devicePixelRatio);
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    map.on("resize", resize);
    const width = () => el.width / devicePixelRatio,
      height = () => el.height / devicePixelRatio;
    const draw = (now: number) => {
      if (stopped) return;
      const seconds = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (mode === "barbs") {
        context.clearRect(0, 0, width(), height());
        for (const sample of samples) {
          const p = map.project([sample.lon, sample.lat]);
          context.save();
          context.translate(p.x, p.y);
          context.rotate(
            ((sample.direction - 90 - map.getBearing()) * Math.PI) / 180,
          );
          context.strokeStyle = "#edfaff";
          context.fillStyle = "#edfaff";
          context.lineWidth = 1.6;
          context.shadowColor = "#10273d";
          context.shadowBlur = 3;
          let knots = Math.round(sample.speed / 1.852 / 5) * 5,
            at = 20;
          context.beginPath();
          context.moveTo(-8, 0);
          context.lineTo(22, 0);
          context.stroke();
          while (knots >= 50) {
            context.beginPath();
            context.moveTo(at, 0);
            context.lineTo(at - 4, -10);
            context.lineTo(at - 8, 0);
            context.closePath();
            context.fill();
            at -= 10;
            knots -= 50;
          }
          while (knots >= 10) {
            context.beginPath();
            context.moveTo(at, 0);
            context.lineTo(at - 4, -10);
            context.stroke();
            at -= 5;
            knots -= 10;
          }
          if (knots >= 5) {
            context.beginPath();
            context.moveTo(at, 0);
            context.lineTo(at - 2, -5);
            context.stroke();
          }
          if (sample.speed < 2) {
            context.beginPath();
            context.arc(-8, 0, 4, 0, Math.PI * 2);
            context.stroke();
          }
          context.restore();
        }
      } else {
        context.globalCompositeOperation = "destination-in";
        context.fillStyle = "rgba(0,0,0,0.91)";
        context.fillRect(0, 0, width(), height());
        context.globalCompositeOperation = "source-over";
        context.strokeStyle = "rgba(230,250,255,.85)";
        context.lineWidth = 1.3;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (
            p.age++ > 100 ||
            p.lon < bounds.minLon ||
            p.lon > bounds.maxLon ||
            p.lat < bounds.minLat ||
            p.lat > bounds.maxLat
          ) {
            particles[i] = createParticle(i + frame * 13);
            continue;
          }
          let u = 0,
            v = 0,
            total = 0;
          for (const s of samples) {
            const weight =
              1 /
              Math.max(0.00001, (s.lon - p.lon) ** 2 + (s.lat - p.lat) ** 2);
            const radians = (s.direction * Math.PI) / 180;
            u += ((-Math.sin(radians) * s.speed) / 3.6) * weight;
            v += ((-Math.cos(radians) * s.speed) / 3.6) * weight;
            total += weight;
          }
          const before = map.project([p.lon, p.lat]);
          p.lon +=
            ((u / total) * seconds * 700) /
            (111320 * Math.max(0.1, Math.cos((p.lat * Math.PI) / 180)));
          p.lat += ((v / total) * seconds * 700) / 111320;
          const after = map.project([p.lon, p.lat]);
          context.beginPath();
          context.moveTo(before.x, before.y);
          context.lineTo(after.x, after.y);
          context.stroke();
        }
      }
      frame++;
      animation = requestAnimationFrame(draw);
    };
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches &&
      mode === "particles"
    ) {
      map.off("resize", resize);
      return;
    }
    animation = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(animation);
      map.off("resize", resize);
      context.clearRect(0, 0, width(), height());
    };
  }, [map, data, mode]);
  return <canvas ref={canvas} className="wind-flow" aria-hidden="true" />;
}
