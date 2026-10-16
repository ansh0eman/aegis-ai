import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, lt, sql } from "drizzle-orm";
import type { db } from "../db";
import { demoRequestBuckets } from "../db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const RETAIN_MS = 7 * DAY_MS;

export function getTrustedDemoIpScope(
  headers: Headers,
  trustedProxy: string | undefined,
  hashSecret: string | undefined,
) {
  // Railway documents X-Real-IP as its client-IP header. Never consume it
  // unless deployment explicitly declares that requests come through Railway.
  if (trustedProxy !== "railway" || !hashSecret) return null;
  const ip = headers.get("x-real-ip")?.trim();
  if (!ip || ip.includes(",") || isIP(ip) === 0) return null;

  return `ip:${createHmac("sha256", hashSecret).update(ip).digest("hex")}`;
}

export function admitDemoRequest(
  database: typeof db,
  options: {
    now?: number;
    globalDailyLimit: number;
    perIpHourlyLimit: number;
    ipScope: string | null;
  },
) {
  const now = options.now ?? Date.now();
  const globalStart = Math.floor(now / DAY_MS) * DAY_MS;
  const ipStart = Math.floor(now / HOUR_MS) * HOUR_MS;

  // BEGIN IMMEDIATE serializes the read/check/increment pair across SQLite
  // connections, so simultaneous requests cannot claim the same final slot.
  return database.transaction((tx) => {
    tx.delete(demoRequestBuckets)
      .where(lt(demoRequestBuckets.windowStart, now - RETAIN_MS))
      .run();

    const globalRow = tx.select({ requestCount: demoRequestBuckets.requestCount })
      .from(demoRequestBuckets)
      .where(and(
        eq(demoRequestBuckets.scope, "global"),
        eq(demoRequestBuckets.windowStart, globalStart),
      ))
      .all()[0];
    const ipRow = options.ipScope
      ? tx.select({ requestCount: demoRequestBuckets.requestCount })
        .from(demoRequestBuckets)
        .where(and(
          eq(demoRequestBuckets.scope, options.ipScope),
          eq(demoRequestBuckets.windowStart, ipStart),
        ))
        .all()[0]
      : undefined;

    if ((globalRow?.requestCount ?? 0) >= options.globalDailyLimit) {
      return { admitted: false as const, reason: "global_limit" as const };
    }
    if ((ipRow?.requestCount ?? 0) >= options.perIpHourlyLimit) {
      return { admitted: false as const, reason: "ip_limit" as const };
    }

    const increment = (scope: string, windowStart: number) => tx
      .insert(demoRequestBuckets)
      .values({ scope, windowStart, requestCount: 1 })
      .onConflictDoUpdate({
        target: [demoRequestBuckets.scope, demoRequestBuckets.windowStart],
        set: { requestCount: sql`${demoRequestBuckets.requestCount} + 1` },
      })
      .run();

    increment("global", globalStart);
    if (options.ipScope) increment(options.ipScope, ipStart);
    return { admitted: true as const, reason: null };
  }, { behavior: "immediate" });
}
