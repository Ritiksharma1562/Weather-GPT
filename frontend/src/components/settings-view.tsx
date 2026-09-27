"use client";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  LogOut,
  MapPin,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api, clearSession, session } from "@/lib/api";
import { useApp } from "@/lib/context";
import type { Place, Preferences, User } from "@/lib/types";
import { Panel, SourceNote } from "./common";
import { Switch } from "./ui/switch";
import { PlaceSearch } from "./search";
const defaults: Preferences = {
  alert_types: [
    "rain",
    "flood",
    "cyclone",
    "heat",
    "cold",
    "fog",
    "landslide",
    "thunderstorm",
    "wind",
    "fire",
  ],
  severities: ["Yellow", "Orange", "Red"],
  push_enabled: false,
  voice_enabled: false,
  language: "en",
  voice: "coral",
};
export function SettingsView() {
  const {
    user,
    setUser,
    setAuthOpen,
    units,
    setUnits,
    theme,
    toggleTheme,
    config,
    saved,
    reloadSaved,
    setPlace,
    place,
  } = useApp();
  const [name, setName] = useState(user?.display_name || ""),
    [avatar, setAvatar] = useState(user?.avatar || ""),
    [home, setHome] = useState<Place | null>(user?.home_location || null),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [busy, setBusy] = useState(false);
  const guest = !user || user.guest;
  useEffect(() => {
    if (user) {
      setName(user.display_name);
      setAvatar(user.avatar || "");
      setHome(user.home_location || null);
      if (!user.guest)
        api<Preferences>("/preferences")
          .then(setPrefs)
          .catch((e) => toast.error(e.message));
    }
  }, [user]);
  const save = async () => {
    if (guest) return setAuthOpen(true);
    setBusy(true);
    try {
      const updated = await api<User>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: name,
          avatar: avatar || null,
          home_location: home
            ? {
                name: home.name,
                latitude: home.latitude,
                longitude: home.longitude,
              }
            : null,
        }),
      });
      await api("/preferences", { method: "PUT", body: JSON.stringify(prefs) });
      setUser(updated);
      toast.success("Profile and preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enablePush = async () => {
    if (guest) return setAuthOpen(true);
    if (!config?.push_enabled)
      return toast.error("Push delivery is not connected yet");
    setBusy(true);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator))
        throw new Error("This browser does not support push notifications");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Notification permission was not granted");
      const [
        { initializeApp, getApps },
        { getMessaging, getToken, isSupported },
      ] = await Promise.all([
        import("firebase/app"),
        import("firebase/messaging"),
      ]);
      if (!(await isSupported()))
        throw new Error("Messaging is not supported in this browser");
      const app = getApps()[0] || initializeApp(config.firebase);
      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(app), {
        vapidKey: config.firebase_vapid_key,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error("Push subscription could not be created");
      await api("/notifications/register", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      const next = { ...prefs, push_enabled: true };
      await api("/preferences", { method: "PUT", body: JSON.stringify(next) });
      setPrefs(next);
      toast.success("Push notifications enabled for saved places");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reorder = async (index: number, change: number) => {
    const next = [...saved];
    [next[index], next[index + change]] = [next[index + change], next[index]];
    try {
      await api("/places/order", {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      await reloadSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggleList = (key: "alert_types" | "severities", value: string) =>
    setPrefs((p) => ({
      ...p,
      [key]: p[key].includes(value)
        ? p[key].filter((x) => x !== value)
        : [...p[key], value],
    }));
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>
            Settings & profile<span className="heading-dot">.</span>
          </h1>
          <p>Personalize your places, notifications, and voice.</p>
        </div>
        <button className="button primary" onClick={save} disabled={busy}>
          <Save size={16} />
          Save changes
        </button>
      </div>
      {guest && (
        <div className="inline-notice">
          You’re exploring as a guest.{" "}
          <button className="text-button" onClick={() => setAuthOpen(true)}>
            Sign in or create an account
          </button>{" "}
          to save profile, places, and notification preferences.
        </div>
      )}
      <div className="two-column">
        <Panel title="Your profile">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={1}
                maxLength={100}
                required
                disabled={guest}
              />
            </label>
            <label>
              Email address
              <input value={user?.email || "Guest session"} readOnly />
            </label>
            <label>
              Avatar image URL
              <input
                type="url"
                value={avatar}
                placeholder="https://…"
                onChange={(e) => setAvatar(e.target.value)}
                disabled={guest}
              />
            </label>
            <label>
              Home location
              <PlaceSearch initial={home?.name || ""} onSelect={setHome} />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => setHome(place)}
            >
              Use {place.name} as home
            </button>
          </form>
        </Panel>
        <Panel title="Appearance & units">
          <div className="setting-row">
            <div>
              <strong>Dark appearance</strong>
              <p>Uses your system preference until you choose a theme.</p>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
              aria-label="Dark appearance"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Unit system</strong>
              <p>Temperature and wind throughout the weather views.</p>
            </div>
            <select
              aria-label="Unit system"
              style={{ width: 120 }}
              value={units}
              onChange={(e) =>
                setUnits(e.target.value as "metric" | "imperial")
              }
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </div>
          <SourceNote note="Climate records, crop calculations, and downloadable datasets use the units shown beside their values." />
        </Panel>
      </div>
      <Panel
        title="Saved places"
        action={
          <button
            className="text-button"
            onClick={async () => {
              if (guest) return setAuthOpen(true);
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
            }}
          >
            Save {place.name}
          </button>
        }
      >
        {saved.length ? (
          saved.map((p, i) => (
            <div className="saved-place" key={p.id}>
              <button className="saved-place-name" onClick={() => setPlace(p)}>
                <MapPin size={18} />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.latitude.toFixed(3)}°, {p.longitude.toFixed(3)}°
                  </small>
                </span>
              </button>
              <div>
                <button
                  className="icon-button"
                  aria-label={`Move ${p.name} up`}
                  disabled={i === 0}
                  onClick={() => reorder(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${p.name} down`}
                  disabled={i === saved.length - 1}
                  onClick={() => reorder(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${p.name}`}
                  onClick={async () => {
                    try {
                      await api(`/places/${p.id}`, { method: "DELETE" });
                      await reloadSaved();
                      toast.success(
                        `${p.name} removed. You can save it again anytime.`,
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="panel-intro">
            No places saved yet. Save your current location from the dashboard.
          </p>
        )}
      </Panel>
      <div className="two-column">
        <Panel title="Notifications">
          <div className="setting-row">
            <div>
              <strong>Push notifications</strong>
              <p>
                {config?.push_enabled
                  ? "Official alerts for your saved places."
                  : "Firebase connection required for delivery."}
              </p>
            </div>
            <Switch
              checked={prefs.push_enabled}
              disabled={guest || !config?.push_enabled}
              aria-label="Push notifications"
              onCheckedChange={async (v) => {
                if (v) await enablePush();
                else {
                  setPrefs((p) => ({ ...p, push_enabled: false }));
                  try {
                    await api("/preferences", {
                      method: "PUT",
                      body: JSON.stringify({ ...prefs, push_enabled: false }),
                    });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
              }}
            />
          </div>
          <div className="settings-section">
            <h3>Severity levels</h3>
            <div className="checks">
              {["Green", "Yellow", "Orange", "Red"].map((s) => (
                <label className="check-row" key={s}>
                  <input
                    type="checkbox"
                    checked={prefs.severities.includes(s)}
                    onChange={() => toggleList("severities", s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <h3>Alert types</h3>
            <div className="checks">
              {defaults.alert_types.map((s) => (
                <label className="check-row" key={s}>
                  <input
                    type="checkbox"
                    checked={prefs.alert_types.includes(s)}
                    onChange={() => toggleList("alert_types", s)}
                  />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Voice & language">
          <div className="setting-row">
            <div>
              <strong>Voice alerts</strong>
              <p>AI-generated speech during Copilot sessions.</p>
            </div>
            <Switch
              checked={prefs.voice_enabled}
              disabled={!config?.ai_enabled}
              aria-label="Voice alerts"
              onCheckedChange={(v) =>
                setPrefs((p) => ({ ...p, voice_enabled: v }))
              }
            />
          </div>
          <div className="stack settings-section">
            <label>
              Language
              <select
                value={prefs.language}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    language: e.target.value as "en" | "hi",
                  }))
                }
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>
            <label>
              AI voice
              <select
                value={prefs.voice}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, voice: e.target.value }))
                }
              >
                {[
                  "coral",
                  "alloy",
                  "nova",
                  "shimmer",
                  "onyx",
                  "echo",
                  "fable",
                  "sage",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <SourceNote note="Chat also responds in Hindi when you write in Hindi. Microphone permission is requested only when recording." />
        </Panel>
      </div>
      {!guest && (
        <button
          className="button secondary signout-button"
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST" });
              clearSession();
              setUser((await session()).user);
              toast.success("Signed out");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      )}
    </div>
  );
}
