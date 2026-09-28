const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
import type { User } from "./types";
let accessToken = "";
let sessionPromise: Promise<Session> | null = null;
export type Session = { access_token: string; expires_in: number; user: User };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function token() {
  return accessToken;
}
export function acceptSession(session: Session) {
  accessToken = session.access_token;
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("wg-session", { detail: session.user }),
    );
  return session;
}
export function clearSession() {
  accessToken = "";
}
export async function session(): Promise<Session> {
  if (!sessionPromise) {
    const refresh = async () => {
      const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (refreshed.ok) return acceptSession(await refreshed.json());
      if (refreshed.status !== 401)
        throw new ApiError(
          "Session service unavailable. Please retry.",
          refreshed.status,
        );
      const guest = await fetch(`${API_BASE}/api/auth/guest`,) { method: "POST" };
      if (!guest.ok)
        throw new ApiError(
          "Unable to start a session. Check that the server is running.",
          guest.status,
        );
      return acceptSession(await guest.json());
    };
    sessionPromise = (async (): Promise<Session> => {
      if (typeof navigator !== "undefined" && navigator.locks)
        return await navigator.locks.request(
          "weathergpt-refresh",
          async () => await refresh(),
        );
      return await refresh();
    })().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise!;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body)
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await session();
    return api<T>(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail
          .map(
            (x: { msg: string; loc: string[] }) =>
              `${x.loc.slice(1).join(" ")}: ${x.msg}`,
          )
          .join("; ")
      : body.detail;
    throw new ApiError(
      detail || "Request failed. Please retry.",
      response.status,
    );
  }
  return response.json();
}
export function coords(point: { latitude: number; longitude: number }) {
  return `latitude=${point.latitude}&longitude=${point.longitude}`;
}

export async function speak(text: string, voice = "coral") {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/ai/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);

  await audio.play();
}