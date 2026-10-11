import type { ChatSseMessage } from "./sse";

type ProviderEvent = {
  type: string;
  delta?: unknown;
};

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError")
  );
}

export async function* streamChatEvents(
  providerEvents: AsyncIterable<ProviderEvent>,
  conversationId: number,
  persistAssistant: (content: string) => void,
  signal: AbortSignal,
): AsyncGenerator<ChatSseMessage> {
  let assistantText = "";
  let providerCompleted = false;

  try {
    for await (const event of providerEvents) {
      if (signal.aborted) return;

      if (event.type === "response.output_text.delta") {
        if (typeof event.delta !== "string") {
          yield {
            event: "error",
            data: { message: "The response stream was invalid. Partial text was not saved." },
          };
          return;
        }
        assistantText += event.delta;
        yield { event: "delta", data: { text: event.delta } };
      } else if (event.type === "response.completed") {
        providerCompleted = true;
      } else if (
        event.type === "error" ||
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      ) {
        yield {
          event: "error",
          data: { message: "The response could not be completed. Partial text was not saved." },
        };
        return;
      }
    }
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return;
    yield {
      event: "error",
      data: { message: "The response could not be completed. Partial text was not saved." },
    };
    return;
  }

  if (signal.aborted) return;
  if (!providerCompleted) {
    yield {
      event: "error",
      data: { message: "The response ended early. Partial text was not saved." },
    };
    return;
  }

  try {
    // The route uses synchronous SQLite, so persistence completes before done is yielded.
    persistAssistant(assistantText);
  } catch {
    yield {
      event: "error",
      data: { message: "The response could not be saved. Partial text was not saved." },
    };
    return;
  }

  if (!signal.aborted) {
    yield { event: "done", data: { conversationId } };
  }
}
