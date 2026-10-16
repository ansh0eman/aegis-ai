"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseSseJsonData, SseParser } from "@/lib/sse";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  status?: "interrupted" | "failed";
};
type ChatResponse = { error?: unknown };
type ConversationResponse = {
  conversationId?: unknown;
  messages?: unknown;
  error?: unknown;
};
type ActiveRequest = {
  id: number;
  controller: AbortController;
  assistantMessageIndex: number;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
};

export default function ChatClient({ email, isAdmin, isSharedPublicDemo = false }: { email: string; isAdmin: boolean; isSharedPublicDemo?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoringConversation = useRef(false);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const nextRequestId = useRef(0);

  useEffect(() => {
    const idFromUrl = new URLSearchParams(window.location.search).get(
      "conversationId",
    );
    if (!idFromUrl) return;
    restoringConversation.current = true;

    async function loadConversation() {
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(idFromUrl!)}`,
        );
        const data = (await response
          .json()
          .catch(() => null)) as ConversationResponse | null;
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "The conversation could not be loaded.",
          );
        }
        if (
          !data ||
          typeof data.conversationId !== "number" ||
          !Array.isArray(data.messages) ||
          !data.messages.every(
            (message): message is Message & { id: number } =>
              typeof message === "object" &&
              message !== null &&
              "id" in message &&
              typeof message.id === "number" &&
              "role" in message &&
              (message.role === "user" || message.role === "assistant") &&
              "content" in message &&
              typeof message.content === "string",
          )
        ) {
          throw new Error("The server returned an invalid conversation.");
        }
        setConversationId(data.conversationId);
        setMessages(data.messages);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The conversation could not be loaded.",
        );
      } finally {
        restoringConversation.current = false;
      }
    }
    void loadConversation();
  }, []);

  useEffect(
    () => () => {
      const current = activeRequest.current;
      activeRequest.current = null;
      current?.controller.abort();
      if (current?.reader) void current.reader.cancel().catch(() => {});
    },
    [],
  );

  function stopGenerating() {
    const current = activeRequest.current;
    if (!current) return;

    activeRequest.current = null;
    current.controller.abort();
    if (current.reader) void current.reader.cancel().catch(() => {});
    setMessages((existing) =>
      existing.map((message, index) =>
        index === current.assistantMessageIndex
          ? { ...message, status: "interrupted" }
          : message,
      ),
    );
    setIsLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (
      !message ||
      activeRequest.current ||
      restoringConversation.current
    ) {
      return;
    }

    const requestId = ++nextRequestId.current;
    const controller = new AbortController();
    const assistantMessageIndex = messages.length + 1;
    activeRequest.current = { id: requestId, controller, assistantMessageIndex };
    setMessages((existing) => [
      ...existing,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setError(null);
    setIsLoading(true);

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let streamStarted = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(conversationId === null ? {} : { conversationId }),
        }),
        signal: controller.signal,
      });
      if (activeRequest.current?.id !== requestId) return;

      const idHeader = response.headers.get("X-Conversation-Id");
      const responseId = Number(idHeader);
      if (idHeader && Number.isSafeInteger(responseId) && responseId > 0) {
        setConversationId(responseId);
        if (conversationId === null) {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("conversationId", String(responseId));
          window.history.replaceState(
            null,
            "",
            `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
          );
        }
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as ChatResponse | null;
        setMessages((existing) =>
          existing.filter((_, index) => index !== assistantMessageIndex),
        );
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "The request could not be completed.",
        );
      }

      streamStarted = true;
      const contentType = response.headers.get("Content-Type") ?? "";
      if (
        !response.body ||
        !idHeader ||
        !Number.isSafeInteger(responseId) ||
        responseId <= 0 ||
        !contentType.toLowerCase().includes("text/event-stream")
      ) {
        throw new Error("The server did not provide a valid event stream.");
      }

      reader = response.body.getReader();
      const current = activeRequest.current;
      if (!current || current.id !== requestId) {
        await reader.cancel();
        return;
      }
      current.reader = reader;

      const parser = new SseParser();
      const decoder = new TextDecoder();
      let receivedDone = false;

      const appendText = (text: string) => {
        setMessages((existing) => {
          if (activeRequest.current?.id !== requestId) return existing;
          return existing.map((item, index) =>
            index === assistantMessageIndex
              ? { ...item, content: item.content + text }
              : item,
          );
        });
      };

      const processEvents = (events: ReturnType<SseParser["feed"]>) => {
        for (const event of events) {
          if (activeRequest.current?.id !== requestId) return;
          if (receivedDone) {
            throw new Error("The response stream continued after completion.");
          }

          if (event.event === "delta") {
            const payload = parseSseJsonData(event.data);
            if (typeof payload.text !== "string") {
              throw new Error("The response stream contained invalid data.");
            }
            appendText(payload.text);
          } else if (event.event === "done") {
            const payload = parseSseJsonData(event.data);
            if (payload.conversationId !== responseId) {
              throw new Error("The response stream contained invalid data.");
            }
            receivedDone = true;
          } else if (event.event === "error") {
            const payload = parseSseJsonData(event.data);
            const safeMessage =
              typeof payload.message === "string"
                ? payload.message.slice(0, 240)
                : "The response could not be completed. Partial text was not saved.";
            throw new Error(safeMessage);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (activeRequest.current?.id !== requestId) return;
        if (done) break;
        processEvents(parser.feed(decoder.decode(value, { stream: true })));
      }
      processEvents(parser.feed(decoder.decode()));
      if (!receivedDone) {
        throw new Error("The response ended early. This partial reply was not saved.");
      }
    } catch (requestError) {
      if (activeRequest.current?.id !== requestId) return;
      if (reader) void reader.cancel().catch(() => {});

      const messageText =
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong while receiving the response.";
      if (streamStarted) {
        setMessages((existing) =>
          existing.map((item, index) =>
            index === assistantMessageIndex
              ? { ...item, status: "failed" }
              : item,
          ),
        );
      } else {
        setMessages((existing) =>
          existing.filter((_, index) => index !== assistantMessageIndex),
        );
      }
      setError(messageText);
    } finally {
      if (reader) {
        const current = activeRequest.current;
        if (current?.id === requestId) current.reader = undefined;
        try {
          reader.releaseLock();
        } catch {
          // The response body may already have been canceled.
        }
      }
      if (activeRequest.current?.id === requestId) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="site-header">
        <div className="container nav-row">
          <Link href="/" className="brand" aria-label="Aegis AI home"><span className="brand-mark" aria-hidden="true">A</span><span>Aegis AI</span></Link>
          <nav aria-label="Workspace navigation" className="nav-links">
            {isAdmin ? <Link href="/admin">Admin</Link> : null}
            <button type="button" onClick={handleLogout} className="hover:text-[var(--foreground)]">Log out</button>
          </nav>
        </div>
      </header>
      <main className="container app-main max-w-[980px]">
        {isSharedPublicDemo ? <p className="status-message warning mb-5">Shared demonstration environment. Other visitors may view messages saved in these accounts. Do not enter personal, confidential, or sensitive information.</p> : null}
        <div className="page-heading">
          <div><span className="badge badge-accent">{isSharedPublicDemo ? "Shared demo workspace" : "Private workspace"}</span><h1 className="mt-4">Conversation</h1><p>Signed in as {email}</p></div>
          <Link href="/demo" className="text-link text-sm">View public demo</Link>
        </div>
        <section aria-label="Conversation" aria-live="polite" className="panel chat-thread">
          {messages.length === 0 ? (
            <div className="empty-state"><div><h2>Start a conversation</h2><p>Ask a question to begin. Replies stream as they arrive, and completed messages are saved to this conversation.</p></div></div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}>
                  <span className="message-label">{message.role === "user" ? "You" : "Aegis AI"}</span>
                  {message.content || (isLoading && index === messages.length - 1 ? "Waiting for response..." : "")}
                  {message.status ? <span className="mt-2 block text-xs error-text">{message.status === "interrupted" ? "Interrupted. This partial reply was not saved." : "Incomplete. This partial reply was not saved."}</span> : null}
                </div>
              ))}
              {isLoading ? <p role="status" className="text-xs muted">Generating response...</p> : null}
            </div>
          )}
        </section>
        {error ? <p role="alert" className="status-message error mt-4">{error}</p> : null}
        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="message" className="field-label">Message</label>
          <div className="composer">
            <input id="message" name="message" type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Aegis AI a question" required autoComplete="off" disabled={isLoading} className="input" />
            {isLoading ? <button type="button" onClick={stopGenerating} className="button button-secondary">Stop generating</button> : <button type="submit" disabled={!input.trim()} className="button button-primary">Send message</button>}
          </div>
          <p className="field-help">Only completed assistant replies are saved.</p>
        </form>
      </main>
    </>
  );
}
