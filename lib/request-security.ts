import "server-only";

export function isSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function sameOriginErrorResponse() {
  return Response.json(
    { error: "Cross-origin requests are not allowed." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export function isPublicRegistrationOpen(
  nodeEnv = process.env.NODE_ENV,
  allowInProduction = process.env.AEGIS_ALLOW_PUBLIC_REGISTRATION,
) {
  return nodeEnv !== "production" || allowInProduction === "true";
}
