import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, lt, sql } from "drizzle-orm";
import type { db } from "../db";
import { demoRequestBuckets } from "../db/schema";
import { normalizeEmail } from "./auth-validation";

const HOUR_MS = 60 * 60 * 1000;

function digest(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function admitPublicDemoLogin(
  database: typeof db,
  emailInput: string,
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  const secret = env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return "unavailable" as const;

  const scopes = [`login:email:${digest(normalizeEmail(emailInput), secret)}`];
  if (env.DEMO_TRUSTED_PROXY === "railway") {
    const ip = headers.get("x-real-ip")?.trim();
    if (ip && !ip.includes(",") && isIP(ip) !== 0) {
      scopes.push(`login:ip:${digest(ip, secret)}`);
    }
  }

  const windowStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const perEmailLimit = boundedLimit(env.PUBLIC_DEMO_LOGIN_PER_EMAIL_HOURLY_LIMIT, 6, 1, 20);
  const perIpLimit = boundedLimit(env.PUBLIC_DEMO_LOGIN_PER_IP_HOURLY_LIMIT, 20, 1, 100);
  return database.transaction((tx) => {
    tx.delete(demoRequestBuckets).where(lt(demoRequestBuckets.windowStart, now - 7 * 24 * HOUR_MS)).run();
    for (const scope of scopes) {
      const [row] = tx.select({ count: demoRequestBuckets.requestCount })
        .from(demoRequestBuckets)
        .where(and(eq(demoRequestBuckets.scope, scope), eq(demoRequestBuckets.windowStart, windowStart)))
        .limit(1).all();
      const limit = scope.startsWith("login:ip:") ? perIpLimit : perEmailLimit;
      if ((row?.count ?? 0) >= limit) return "limited" as const;
    }

    for (const scope of scopes) {
      tx.insert(demoRequestBuckets)
        .values({ scope, windowStart, requestCount: 1 })
        .onConflictDoUpdate({
          target: [demoRequestBuckets.scope, demoRequestBuckets.windowStart],
          set: { requestCount: sql`${demoRequestBuckets.requestCount} + 1` },
        })
        .run();
    }
    return "accepted" as const;
  }, { behavior: "immediate" });
}

function boundedLimit(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}
