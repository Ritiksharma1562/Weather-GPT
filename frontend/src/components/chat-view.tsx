"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  LoaderCircle,
  MessageCircle,
  Mic,
  Plus,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { api, speak } from "@/lib/api";
import { useApp } from "@/lib/context";
import type { ChatAnswer } from "@/lib/types";
import { Badge } from "./common";
type Message = {
  role: "user" | "assistant";
  text?: string;
  answer?: ChatAnswer;
};
type History = {
  role: "user" | "assistant";
  conversation_id: string;
  content: ChatAnswer & { message?: string };
  created_at: string;
};
const prompts = [
  "Will it rain today?",
  "Is it a good day to travel?",
  "Will fog affect driving tonight?",
  "क्या आज बारिश होगी?",
];
export function ChatView() {
  const { place, config, user, setAuthOpen } = useApp();
  const [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [conversation, setConversation] = useState<string | null>(null),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [history, setHistory] = useState<History[]>([]);
  const bottom = useRef<HTMLDivElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const send = async (text = draft) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const result = await api<ChatAnswer>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          latitude: place.latitude,
          longitude: place.longitude,
          message: text,
          conversation_id: conversation,
        }),
      });
      setConversation(result.conversation_id);
      setMessages((m) => [...m, { role: "assistant", answer: result }]);
    } catch (e) {
      setError((e as Error).message);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const r = new MediaRecorder(stream.current, { mimeType });
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        setRecording(false);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);

        const form = new FormData();
        form.append(
          "file",
          new Blob(chunks, { type: mimeType }),
          mimeType === "audio/webm" ? "question.webm" : "question.mp4",
        );

        setBusy(true);
        try {
          const result = await api<{ text: string }>("/ai/transcribe", {
            method: "POST",
            body: form,
          });

          // ✅ Null-safe
          if (!result || !result.text) {
            toast.error("Couldn't recognize your speech. Please speak again.");
            return;
          }

          setDraft(result.text);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      };

      r.start();
      setRecording(true);
      timer.current = setTimeout(
        () => r.state === "recording" && r.stop(),
        60000,
      );
    } catch {
      toast.error(
        "Microphone access was unavailable. You can type your question instead.",
      );
    }
  };
  return (
    <div className="page-stack chat-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI WEATHER CHAT</div>
          <h1>
            Ask the forecast<span className="heading-dot">.</span>
          </h1>
          <p>
            Answers grounded in live weather for {place.name}. English & हिन्दी.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={async () => {
              if (user?.guest) return setAuthOpen(true);
              try {
                setHistory(await api<History[]>("/ai/history"));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <MessageCircle size={16} />
            History
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setMessages([]);
              setConversation(null);
              setError("");
            }}
          >
            <Plus size={16} />
            New chat
          </button>
        </div>
      </div>
      {config && !config.ai_enabled && (
        <div className="inline-notice">
          <strong>The AI assistant isn’t connected yet.</strong>
          <p>
            Add the OpenAI service key in the backend settings to enable chat
            and AI voice. The weather dashboard and analysis tools are available
            now.
          </p>
        </div>
      )}
      {history.length > 0 && (
        <div className="conversation-list">
          {Array.from(new Set(history.map((h) => h.conversation_id))).map(
            (id) => (
              <button
                className="button secondary"
                key={id}
                onClick={() => {
                  setConversation(id);
                  setMessages(
                    history
                      .filter((h) => h.conversation_id === id)
                      .map((h) => ({
                        role: h.role,
                        text: h.content.message,
                        answer: h.role === "assistant" ? h.content : undefined,
                      })),
                  );
                  setHistory([]);
                }}
              >
                {history
                  .find((h) => h.conversation_id === id && h.role === "user")
                  ?.content.message?.slice(0, 60) || "Weather conversation"}
              </button>
            ),
          )}
        </div>
      )}
      <div className="chat-surface">
        <div className="messages">
          {!messages.length && (
            <div className="chat-welcome">
              <div className="chat-orb">
                <Sparkles size={35} />
              </div>
              <h2>A little clarity, whatever the weather.</h2>
              <p>
                Ask about rain, plan your journey, or understand conditions
                around you.
              </p>
              <div className="suggested-prompts">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => void send(p)}
                    disabled={!config?.ai_enabled || busy}
                  >
                    {p}
                    <ArrowUp size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div className="message user-message" key={i}>
                <span className="message-avatar">
                  {user?.display_name[0] || "Y"}
                </span>
                <div>
                  <strong>You</strong>
                  <p>{m.text}</p>
                </div>
              </div>
            ) : (
              <div className="message assistant-message" key={i}>
                <span className="message-avatar">
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>
                    WeatherGPT <span>LIVE DATA</span>
                  </strong>
                  <p>{m.answer?.explanation}</p>
                  <div className="answer-badges">
                    <Badge level={m.answer?.risk_level}>
                      {m.answer?.risk_level} risk
                    </Badge>
                    <Badge>
                      {m.answer?.confidence_percent}% self-assessed confidence
                    </Badge>
                  </div>
                  <div className="recommendation">
                    <Check size={17} />
                    <p>{m.answer?.recommendation}</p>
                  </div>
                  <p className="answer-uncertainty">{m.answer?.uncertainty}</p>
                  <details>
                    <summary>Sources & tools used</summary>
                    <div className="answer-sources">
                      {m.answer?.sources.map((s) => (
                        <span key={s}>
                          {s.startsWith("https://") ? (
                            <a href={s} target="_blank" rel="noreferrer">
                              {s}
                            </a>
                          ) : (
                            s
                          )}
                        </span>
                      ))}
                      {(m.answer?.tools_used ?? []).map((t, index) => (
                        <span key={index}>
                          {t.name.replaceAll("_", " ")}:{" "}
                          {t.ok ? "completed" : "unavailable"}
                        </span>
                      ))}
                    </div>
                  </details>
                  <button
                    className="text-button"
                    onClick={() =>
                      speak(m.answer!.explanation).catch((e) =>
                        toast.error(e.message),
                      )
                    }
                  >
                    <Volume2 size={15} />
                    Listen · AI-generated voice
                  </button>
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="message assistant-message">
              <span className="message-avatar">
                <LoaderCircle size={18} className="spin" />
              </span>
              <p>Checking the latest weather and relevant sources…</p>
            </div>
          )}
          {error && (
            <div className="inline-notice" role="alert">
              {error}
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Ask a weather question"
            placeholder="Ask about the weather… / मौसम के बारे में पूछें…"
            value={draft}
            maxLength={4000}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-bottom">
            <span>Live data · Source-aware answers</span>
            <div>
              <button
                type="button"
                className={`icon-button ${recording ? "recording" : ""}`}
                onClick={record}
                disabled={!config?.ai_enabled || busy}
                aria-label={recording ? "Stop recording" : "Record question"}
              >
                {recording ? <Square size={17} /> : <Mic size={19} />}
              </button>
              <button
                className="send-button"
                aria-label="Send question"
                disabled={!config?.ai_enabled || busy || !draft.trim()}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        </form>
        <p className="chat-footnote">
          AI can make mistakes. Check time, location, sources, and official
          warnings before acting.
        </p>
      </div>
    </div>
  );
}
