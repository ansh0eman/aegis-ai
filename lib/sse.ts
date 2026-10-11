export type ChatSseMessage =
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { conversationId: number } }
  | { event: "error"; data: { message: string } };

export type ParsedSseEvent = {
  event: string;
  data: string;
};

export function encodeSseEvent(message: ChatSseMessage): string {
  return `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
}

export function parseSseJsonData(data: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error("The response stream contained invalid data.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The response stream contained invalid data.");
  }
  return parsed as Record<string, unknown>;
}

export class SseParser {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];

  feed(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) break;

      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.processLine(line, events);
    }

    return events;
  }

  private processLine(line: string, events: ParsedSseEvent[]) {
    if (line === "") {
      if (this.dataLines.length > 0) {
        events.push({
          event: this.eventName || "message",
          data: this.dataLines.join("\n"),
        });
      }
      this.eventName = "";
      this.dataLines = [];
      return;
    }

    if (line.startsWith(":")) return;

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") this.eventName = value;
    if (field === "data") this.dataLines.push(value);
  }
}
