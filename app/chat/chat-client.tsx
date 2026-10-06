"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { id?: number; role: "user" | "assistant"; content: string };
type ChatResponse = { error?: unknown };
type ConversationResponse = { conversationId?: unknown; messages?: unknown; error?: unknown };

export default function ChatClient({ email }: { email: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoringConversation = useRef(false);

  useEffect(() => {
    const idFromUrl = new URLSearchParams(window.location.search).get("conversationId");
    if (!idFromUrl) return;
    restoringConversation.current = true;

    async function loadConversation() {
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(idFromUrl!)}`);
        const data = (await response.json().catch(() => null)) as ConversationResponse | null;
        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "The conversation could not be loaded.");
        }
        if (
          !data || typeof data.conversationId !== "number" || !Array.isArray(data.messages) ||
          !data.messages.every((message): message is Message & { id: number } =>
            typeof message === "object" && message !== null && "id" in message &&
            typeof message.id === "number" && "role" in message &&
            (message.role === "user" || message.role === "assistant") &&
            "content" in message && typeof message.content === "string")
        ) throw new Error("The server returned an invalid conversation.");
        setConversationId(data.conversationId);
        setMessages(data.messages);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "The conversation could not be loaded.");
      } finally {
        restoringConversation.current = false;
      }
    }
    void loadConversation();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading || restoringConversation.current) return;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(conversationId === null ? {} : { conversationId }) }),
      });
      const idHeader = response.headers.get("X-Conversation-Id");
      const responseId = Number(idHeader);
      if (idHeader && Number.isSafeInteger(responseId) && responseId > 0) {
        setConversationId(responseId);
        if (conversationId === null) {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("conversationId", String(responseId));
          window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        }
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ChatResponse | null;
        throw new Error(typeof data?.error === "string" ? data.error : "The request could not be completed.");
      }
      if (!response.body || !idHeader || !Number.isSafeInteger(responseId) || responseId <= 0) {
        throw new Error("The server did not provide a valid response stream.");
      }

      const assistantMessageIndex = messages.length + 1;
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const append = (text: string) => {
        if (!text) return;
        setMessages((current) => current.map((item, index) => index === assistantMessageIndex ? { ...item, content: item.content + text } : item));
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(decoder.decode(value, { stream: true }));
      }
      append(decoder.decode());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong while receiving the response.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div><p className="text-sm font-medium text-blue-700">Aegis AI</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Workspace</h1><p className="text-sm text-slate-500">Signed in as {email}</p></div>
        <div className="flex items-center gap-4"><Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-950">Back home</Link><button onClick={handleLogout} className="text-sm font-semibold text-slate-600 hover:text-slate-950">Log out</button></div>
      </header>
      <section aria-label="Conversation" aria-live="polite" className="min-h-72 flex-1 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {messages.length === 0 ? <p className="text-sm text-slate-500">Send a message to see the browser-to-server request flow.</p> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white" : "mr-auto max-w-[85%] rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-800"}><span className="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70">{message.role === "user" ? "You" : "Aegis AI"}</span>{message.content}</div>)}
        {isLoading ? <p className="text-sm text-slate-500">Waiting for a response…</p> : null}
      </section>
      {error ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3"><label htmlFor="message" className="sr-only">Message</label><input id="message" name="message" type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a message" required autoComplete="off" disabled={isLoading} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" /><button type="submit" disabled={isLoading || !input.trim()} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{isLoading ? "Sending…" : "Send"}</button></form>
    </main>
  );
}
