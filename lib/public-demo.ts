import "server-only";

import { basename } from "node:path";
import { isValidEmail, normalizeEmail } from "./auth-validation";
import type { CurrentUser } from "./auth";

export type PublicDemoConfig = {
  adminEmail: string;
  memberEmails: [string, string];
  emails: [string, string, string];
};

function configuredEmails(env: NodeJS.ProcessEnv = process.env): PublicDemoConfig | null {
  const raw = [
    env.PUBLIC_DEMO_ADMIN_EMAIL,
    env.PUBLIC_DEMO_USER1_EMAIL,
    env.PUBLIC_DEMO_USER2_EMAIL,
  ];
  if (raw.some((email) => typeof email !== "string" || !email.trim())) return null;
  const emails = raw.map((email) => normalizeEmail(email!)) as [string, string, string];
  if (emails.some((email) => !isValidEmail(email)) || new Set(emails).size !== 3) {
    return null;
  }
  return { adminEmail: emails[0], memberEmails: [emails[1], emails[2]], emails };
}

export function isPublicDemoEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return env.PUBLIC_DEMO_ACCOUNTS_ENABLED === "true";
}

export function getPublicDemoConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!isPublicDemoEnvironment(env)) return null;
  if (env.AEGIS_PUBLIC_DEMO_DATABASE !== "true" || basename(env.AEGIS_DATABASE_PATH ?? "") !== "aegis-public-demo.db") return null;
  return configuredEmails(env);
}

export function isPublicDemoAdmin(
  user: Pick<CurrentUser, "email" | "role">,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!isPublicDemoEnvironment(env)) return user.role === "admin";
  const config = getPublicDemoConfig(env);
  return Boolean(config && user.role === "admin" && normalizeEmail(user.email) === config.adminEmail);
}

export function isPublicDemoMemberEmail(email: string, config = getPublicDemoConfig()) {
  return Boolean(config?.memberEmails.includes(normalizeEmail(email)));
}

export function getPublicDemoCredentials(env: NodeJS.ProcessEnv = process.env) {
  if (env.PUBLIC_DEMO_REVEAL_CREDENTIALS !== "true") return null;
  const config = getPublicDemoConfig(env);
  const passwords = [
    env.PUBLIC_DEMO_ADMIN_PASSWORD,
    env.PUBLIC_DEMO_USER1_PASSWORD,
    env.PUBLIC_DEMO_USER2_PASSWORD,
  ];
  if (!config || passwords.some((password) => !password || password.length < 12)) return null;
  return config.emails.map((email, index) => ({ email, password: passwords[index]! }));
}

export function isPublicDemoOpenAiEnabled(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(getPublicDemoConfig(env)) && env.PUBLIC_DEMO_OPENAI_ENABLED === "true";
}

export function isPublicDemoSessionSecure(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_COOKIE_SECURE === "true";
}

export function publicDemoDailyLimit(env: NodeJS.ProcessEnv = process.env) {
  const configured = Number(env.PUBLIC_DEMO_DAILY_REQUEST_LIMIT);
  return Number.isSafeInteger(configured) && configured >= 1
    ? Math.min(configured, 100)
    : 20;
}

export function publicDemoPromptLimit(env: NodeJS.ProcessEnv = process.env) {
  return boundedSetting(env.PUBLIC_DEMO_MAX_PROMPT_CHARS, 1200, 1, 2000);
}

export function publicDemoOutputTokenLimit(env: NodeJS.ProcessEnv = process.env) {
  return boundedSetting(env.PUBLIC_DEMO_MAX_OUTPUT_TOKENS, 512, 1, 1024);
}

export function publicDemoTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  return boundedSetting(env.PUBLIC_DEMO_MAX_DURATION_MS, 25_000, 1_000, 30_000);
}

function boundedSetting(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}
