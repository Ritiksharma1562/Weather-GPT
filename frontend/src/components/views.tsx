"use client";
import dynamic from "next/dynamic";
import { Dashboard } from "./dashboard";
import { Loading } from "./common";
const ForecastView = dynamic(
  () => import("./forecast-view").then((m) => m.ForecastView),
  { loading: () => <Loading /> },
);
const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  loading: () => <Loading />,
});
const ChatView = dynamic(() => import("./chat-view").then((m) => m.ChatView), {
  loading: () => <Loading />,
});
const AnalyticsView = dynamic(
  () => import("./analytics-view").then((m) => m.AnalyticsView),
  { loading: () => <Loading /> },
);
const HistoryView = dynamic(
  () => import("./history-view").then((m) => m.HistoryView),
  { loading: () => <Loading /> },
);
const ComparisonView = dynamic(
  () => import("./comparison-view").then((m) => m.ComparisonView),
  { loading: () => <Loading /> },
);
const AgricultureView = dynamic(
  () => import("./agriculture-view").then((m) => m.AgricultureView),
  { loading: () => <Loading /> },
);
const TravelView = dynamic(
  () => import("./travel-view").then((m) => m.TravelView),
  { loading: () => <Loading /> },
);
const AlertsView = dynamic(
  () => import("./alerts-view").then((m) => m.AlertsView),
  { loading: () => <Loading /> },
);
const SettingsView = dynamic(
  () => import("./settings-view").then((m) => m.SettingsView),
  { loading: () => <Loading /> },
);
const DocsView = dynamic(() => import("./docs-view").then((m) => m.DocsView), {
  loading: () => <Loading />,
});
export function View({ view }: { view: string }) {
  switch (view) {
    case "forecast":
      return <ForecastView />;
    case "map":
      return <MapView />;
    case "chat":
      return <ChatView />;
    case "analytics":
      return <AnalyticsView />;
    case "history":
      return <HistoryView />;
    case "comparison":
      return <ComparisonView />;
    case "agriculture":
      return <AgricultureView />;
    case "travel":
      return <TravelView />;
    case "alerts":
      return <AlertsView />;
    case "settings":
      return <SettingsView />;
    case "docs":
      return <DocsView />;
    default:
      return <Dashboard />;
  }
}
