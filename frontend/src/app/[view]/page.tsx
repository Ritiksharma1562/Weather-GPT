import { notFound } from "next/navigation";
import { View } from "@/components/views";
const pages = [
  "dashboard",
  "forecast",
  "map",
  "chat",
  "analytics",
  "history",
  "comparison",
  "agriculture",
  "travel",
  "alerts",
  "settings",
  "docs",
];
export function generateStaticParams() {
  return pages.map((view) => ({ view }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!pages.includes(view)) notFound();
  return <View view={view} />;
}
