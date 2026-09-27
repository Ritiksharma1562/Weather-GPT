"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api, coords, session, token } from "./api";
import type { Config, Forecast, Place, Units, User } from "./types";
type AppState = {
  place: Place;
  setPlace: (p: Place) => void;
  weather: Forecast | null;
  loading: boolean;
  error: string;
  refresh: () => void;
  units: Units;
  setUnits: (u: Units) => void;
  theme: string;
  toggleTheme: () => void;
  user: User | null;
  setUser: (u: User | null) => void;
  config: Config | null;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  saved: Place[];
  reloadSaved: () => Promise<void>;
  locate: () => void;
  locating: boolean;
  live: boolean;
};
const Context = createContext<AppState | null>(null);
export const initialPlace: Place = {
  name: "New Delhi",
  latitude: 28.6139,
  longitude: 77.209,
  country: "India",
};
export function AppProvider({ children }: { children: ReactNode }) {
  const [place, updatePlace] = useState<Place>(initialPlace);
  const [weather, setWeather] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, updateUnits] = useState<Units>("metric");
  const [theme, setTheme] = useState("dark");
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [saved, setSaved] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [live, setLive] = useState(false);
  const [revision, setRevision] = useState(0);
  const latestLive = useRef(0);
  useEffect(() => {
    const changed = (event: Event) =>
      setUser((event as CustomEvent<User>).detail);
    window.addEventListener("wg-session", changed);
    return () => window.removeEventListener("wg-session", changed);
  }, []);
  const setPlace = useCallback((p: Place) => {
    updatePlace(p);
    localStorage.setItem("wg-place", JSON.stringify(p));
  }, []);
  const setUnits = (u: Units) => {
    updateUnits(u);
    localStorage.setItem("wg-units", u);
  };
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("wg-theme", next);
  };
  const reloadSaved = useCallback(async () => {
    if (user && !user.guest) {
      try {
        setSaved(await api<Place[]>("/places"));
      } catch {
        setSaved([]);
      }
    } else setSaved([]);
  }, [user]);
  const locate = useCallback(() => {
    if (!navigator.geolocation)
      return toast.error("Location is not supported by this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const point = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        try {
          setPlace(await api<Place>(`/locations/reverse?${coords(point)}`));
        } catch {
          setPlace({ ...point, name: "Current location" });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast.error(
          "Location access was unavailable. Search for a city instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [setPlace]);
  useEffect(() => {
    const chosen =
      localStorage.getItem("wg-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(chosen);
    updateUnits(
      localStorage.getItem("wg-units") === "imperial" ? "imperial" : "metric",
    );
    try {
      const p = JSON.parse(localStorage.getItem("wg-place") || "null");
      if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        updatePlace(p);
    } catch {
      /* Ignore invalid local preferences. */
    }
    session()
      .then((s) => setUser(s.user))
      .catch((e) => toast.error(e.message));
    api<Config>("/config")
      .then(setConfig)
      .catch((e) => toast.error(e.message));
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted" && !localStorage.getItem("wg-place"))
          locate();
      })
      .catch(() => {});
  }, [locate]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    void reloadSaved();
  }, [reloadSaved]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWeather(null);
    setError("");
    async function load() {
      try {
        const data = await api<Forecast>(`/weather/forecast?${coords(place)}`);
        if (!cancelled) {
          setWeather(data);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      if (Date.now() - latestLive.current > 65000) void load();
    }, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [place.latitude, place.longitude, revision]);
  useEffect(() => {
    if (!user) return;
    let closed = false,
      ws: WebSocket | null = null,
      reconnect: ReturnType<typeof setTimeout>;
    const connect = async () => {
      if (closed) return;
      ws = new WebSocket(
        process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws/live",
      );
      ws.onopen = () => ws?.send(JSON.stringify({ token: token(), ...place }));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "weather" && !closed) {
            setWeather(msg.data);
            setLoading(false);
            setError("");
            setLive(true);
            latestLive.current = Date.now();
          }
          if (msg.type === "alert")
            toast.warning(msg.data.headline || msg.data.event);
        } catch {
          /* Discard malformed frames. */
        }
      };
      ws.onclose = () => {
        setLive(false);
        if (!closed)
          reconnect = setTimeout(async () => {
            try {
              const renewed = await session();
              setUser(renewed.user);
            } catch {
              /* Polling remains active. */
            }
          }, 65000);
      };
      ws.onerror = () => ws?.close();
    };
    void connect();
    return () => {
      closed = true;
      clearTimeout(reconnect);
      ws?.close();
      setLive(false);
    };
  }, [user, place.latitude, place.longitude]);
  return (
    <Context.Provider
      value={{
        place,
        setPlace,
        weather,
        loading,
        error,
        refresh: () => setRevision((r) => r + 1),
        units,
        setUnits,
        theme,
        toggleTheme,
        user,
        setUser,
        config,
        authOpen,
        setAuthOpen,
        saved,
        reloadSaved,
        locate,
        locating,
        live,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("App context is missing");
  return value;
}
