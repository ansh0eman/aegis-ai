"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  reply?: unknown;
  error?: unknown;
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();

    if (!message || isLoading) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "The request could not be completed.",
        );
      }

      if (typeof data.reply !== "string") {
        throw new Error("The server returned an invalid response.");
      }

      const reply = data.reply;

      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong while sending the message.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Aegis AI</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Workspace
          </h1>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          Back home
        </Link>
      </header>

      <section
        aria-label="Conversation"
        aria-live="polite"
        className="min-h-72 flex-1 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Send a message to see the browser-to-server request flow.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white"
                  : "mr-auto max-w-[85%] rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-800"
              }
            >
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70">
                {message.role === "user" ? "You" : "Aegis AI"}
              </span>
              {message.content}
            </div>
          ))
        )}

        {isLoading ? (
          <p className="text-sm text-slate-500">Waiting for a response…</p>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <input
          id="message"
          name="message"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message"
          required
          autoComplete="off"
          disabled={isLoading}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Sending…" : "Send"}
        </button>
      </form>
    </main>
  );
}
