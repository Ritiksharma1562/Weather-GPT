import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "WeatherGPT — Climate Intelligence",
  description:
    "Live weather, grounded AI, interactive weather maps, and climate intelligence for your everyday decisions.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
