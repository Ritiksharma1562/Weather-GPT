"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CloudSun,
  Compass,
  History,
  LayoutDashboard,
  LocateFixed,
  Map,
  Menu,
  MessageCircle,
  Moon,
  Route,
  Settings,
  Sparkles,
  Sprout,
  Sun,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/lib/context";
import { PlaceSearch } from "./search";
import { AuthDialog } from "./auth-dialog";
const navigation = [
  { path: "dashboard", label: "Live dashboard", icon: LayoutDashboard },
  { path: "forecast", label: "Forecast", icon: CloudSun },
  { path: "map", label: "Weather map", icon: Map },
  { path: "chat", label: "AI weather chat", icon: Sparkles },
  { path: "analytics", label: "Climate intelligence", icon: BarChart3 },
  { path: "history", label: "Historical weather", icon: History },
  { path: "comparison", label: "Model comparison", icon: Activity },
  { path: "agriculture", label: "Farmer mode", icon: Sprout },
  { path: "travel", label: "Travel & Copilot", icon: Route },
  { path: "alerts", label: "Weather alerts", icon: Bell },
];
function ShellContent({ children }: { children: ReactNode }) {
  const path = usePathname().split("/")[1] || "dashboard";
  const [menu, setMenu] = useState(false);
  const {
    place,
    setPlace,
    theme,
    toggleTheme,
    units,
    setUnits,
    user,
    setAuthOpen,
    locate,
    locating,
    live,
  } = useApp();
  return (
    <div className="app-frame">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {menu && <div className="mobile-scrim" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link className="brand" href="/dashboard">
          <span className="brand-icon">
            <CloudSun size={28} />
          </span>
          <span>
            Weather<span className="brand-gpt">GPT</span>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="workspace-label">YOUR WEATHER WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => (
            <div key={item.path}>
              {index === 4 && <div className="nav-section">INTELLIGENCE</div>}
              {index === 7 && <div className="nav-section">ON THE GROUND</div>}
              <Link
                href={`/${item.path}`}
                onClick={() => setMenu(false)}
                className={`nav-item ${path === item.path ? "active" : ""}`}
                aria-current={path === item.path ? "page" : undefined}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
                {item.path === "chat" && <span className="nav-ai">AI</span>}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Compass size={22} />
            <strong>A clearer view of what’s ahead.</strong>
            <p>Weather intelligence for your everyday decisions.</p>
            <Link href="/docs">
              Explore the platform <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link
            href="/settings"
            className={`nav-item ${path === "settings" ? "active" : ""}`}
          >
            <Settings size={18} />
            Settings & profile
          </Link>
          <Link
            href="/docs"
            className={`nav-item ${path === "docs" ? "active" : ""}`}
          >
            <BookOpen size={18} />
            Sources & documentation
          </Link>
          <button
            className="account-button"
            onClick={() =>
              user && !user.guest
                ? window.location.assign("/settings")
                : setAuthOpen(true)
            }
          >
            <span className="avatar">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                user?.display_name?.slice(0, 1) || "G"
              )}
            </span>
            <span>
              <strong>{user?.display_name || "Guest explorer"}</strong>
              <small>
                {user && !user.guest
                  ? "Personal account"
                  : "Sign in to save your places"}
              </small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {navigation.find((n) => n.path === path)?.label ||
                  (path === "settings" ? "Settings" : "Documentation")}
              </strong>
            </div>
          </div>
          <div className="topbar-actions">
            <PlaceSearch onSelect={setPlace} />
            <button
              className="icon-button locate-button"
              onClick={locate}
              disabled={locating}
              aria-label="Use my current location"
            >
              <LocateFixed size={20} className={locating ? "spin" : ""} />
            </button>
            <button
              className="unit-toggle"
              onClick={() =>
                setUnits(units === "metric" ? "imperial" : "metric")
              }
              aria-label={`Switch to ${units === "metric" ? "Fahrenheit" : "Celsius"}`}
            >
              {units === "metric" ? "°C" : "°F"}
            </button>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              className="icon-button desktop-alerts"
              href="/alerts"
              aria-label="View weather alerts"
            >
              <Bell size={19} />
            </Link>
          </div>
        </header>
        <main id="main" className={`content view-${path}`} tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            <span className={`status-dot ${live ? "connected" : ""}`} />
            {live ? "Live connection" : "Refreshes every minute"}{" "}
            <span className="footer-separator">·</span> {place.name}
          </span>
          <span>
            WeatherGPT <span className="footer-separator">/</span> AI-Powered
            Climate Intelligence
          </span>
        </footer>
      </div>
      <AuthDialog />
      <Toaster
        richColors
        position="bottom-right"
        theme={theme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <ShellContent>{children}</ShellContent>
    </AppProvider>
  );
}
