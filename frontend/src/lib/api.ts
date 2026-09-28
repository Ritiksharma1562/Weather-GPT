const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

import type { User } from "./types";

let accessToken = "";
let sessionPromise: Promise<Session> | null = null;

export type Session = {
  access_token: string;
  expires_in: number;
  user: User;
};

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

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("wg-session", { detail: session.user }),
    );
  }

  return session;
}

export function clearSession() {
  accessToken = "";
}

export async function session(): Promise<Session> {
  if (!sessionPromise) {
    const refresh = async () => {
      const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshed.ok) {
        return acceptSession(await refreshed.json());
      }

      // New user → refresh cookie nahi hoti
      if (refreshed.status === 401 || refreshed.status === 403) {
        const guest = await fetch(`${API_BASE}/auth/guest`, {
          method: "POST",
        });

        if (!guest.ok) {
          throw new ApiError("Unable to start guest session.", guest.status);
        }

        return acceptSession(await guest.json());
      }

      throw new ApiError("Session service unavailable.", refreshed.status);
    };

    sessionPromise = refresh().finally(() => {
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

  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await session();
    return api<T>(path, options, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.detail || "Request failed", response.status);
  }

  return response.json();
}

export function coords(point: {
  latitude: number;
  longitude: number;
}) {
  return `latitude=${point.latitude}&longitude=${point.longitude}`;
}

export async function speak(text: string, voice = "coral") {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/ai/speech`, {
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