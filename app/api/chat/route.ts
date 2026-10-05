import OpenAI from "openai";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    body.message.trim().length === 0
  ) {
    return Response.json(
      { error: "Message must be a non-empty string." },
      { status: 400 },
    );
  }

  const message = body.message.trim();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "The AI service is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const openAIStream = await openai.responses.create({
      model: "gpt-6-luna",
      input: message,
      stream: true,
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            for await (const event of openAIStream) {
              if (event.type === "response.output_text.delta") {
                controller.enqueue(encoder.encode(event.delta));
              } else if (
                event.type === "error" ||
                event.type === "response.failed" ||
                event.type === "response.incomplete"
              ) {
                controller.error(new Error("The AI response stream failed."));
                return;
              }
            }

            controller.close();
          } catch {
            controller.error(new Error("The AI response stream failed."));
          }
        })();
      },
    });

    return new Response(responseStream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "The AI service is unavailable. Please try again." },
      { status: 502 },
    );
  }
}
