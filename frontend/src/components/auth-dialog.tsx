"use client";
import { useEffect, useRef, useState } from "react";
import { CloudSun, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { acceptSession, api, type Session } from "@/lib/api";
import { useApp } from "@/lib/context";
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (result: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string | number>,
          ) => void;
        };
      };
    };
  }
}
export function AuthDialog() {
  const { authOpen, setAuthOpen, setUser, config } = useApp();
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const google = useRef<HTMLDivElement>(null);
  const finish = (s: Session) => {
    acceptSession(s);
    setUser(s.user);
    setAuthOpen(false);
    toast.success(`Welcome, ${s.user.display_name}`);
  };
  useEffect(() => {
    if (!authOpen || !config?.google_client_id) return;
    const init = () => {
      if (!window.google || !google.current) return;
      window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: (r) => {
          setBusy(true);
          api<Session>("/auth/google", {
            method: "POST",
            body: JSON.stringify({ credential: r.credential }),
          })
            .then(finish)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        },
      });
      window.google.accounts.id.renderButton(google.current, {
        theme: "outline",
        size: "large",
        width: 300,
      });
    };
    let script = document.getElementById(
      "google-identity",
    ) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "google-identity";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", init);
    const t = setTimeout(init, 100);
    return () => {
      script?.removeEventListener("load", init);
      clearTimeout(t);
    };
  }, [authOpen, config?.google_client_id]);
  return (
    <Dialog open={authOpen} onOpenChange={setAuthOpen}>
      <DialogContent>
        <div className="auth-logo">
          <CloudSun size={32} />
        </div>
        <DialogTitle>
          {signup ? "Make weather personal" : "Welcome to WeatherGPT"}
        </DialogTitle>
        <DialogDescription>
          Save your places, conversations, field reports, and trips.
        </DialogDescription>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            const body = {
              email: form.get("email"),
              password: form.get("password"),
              ...(signup ? { display_name: form.get("name") } : {}),
            };
            try {
              finish(
                await api<Session>(`/auth/${signup ? "signup" : "login"}`, {
                  method: "POST",
                  body: JSON.stringify(body),
                }),
              );
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label>
              Display name
              <input name="name" autoComplete="name" required maxLength={100} />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              aria-label="Password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 12 : 1}
              maxLength={128}
            />
            {signup && <small>At least 12 characters.</small>}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy && <LoaderCircle size={17} className="spin" />}
            {signup ? "Create account" : "Sign in"}
          </button>
        </form>
        {config?.google_client_id && (
          <div className="google-login" ref={google} />
        )}
        <button
          className="text-button auth-switch"
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <button
          className="button secondary full"
          onClick={() => setAuthOpen(false)}
        >
          Continue exploring as a guest
        </button>
      </DialogContent>
    </Dialog>
  );
}
