"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import SiteHeader from "@/app/ui/site-header";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result: { error?: unknown } = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Authentication failed.");
      }
      router.replace("/chat");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader page="auth" />
      <main className="container grid min-h-[calc(100dvh-72px)] items-center gap-12 py-10 md:grid-cols-[1fr_470px]">
        <div className="max-w-lg">
          <p className="eyebrow">Private workspace</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{isRegister ? "Create your workspace account." : "Welcome back to Aegis."}</h1>
          <p className="mt-5 text-base leading-7 muted">{isRegister ? "Create an account to use the authenticated chat workspace. Public registration may be closed in production." : "Sign in to continue your conversations and access the controls available to your role."}</p>
          <Link href="/demo" className="text-link mt-7 inline-block text-sm">Explore the public simulation</Link>
        </div>
        <section className="panel w-full p-6 sm:p-8" aria-label={isRegister ? "Create account" : "Sign in"}>
          <h2 className="text-xl font-semibold tracking-tight">{isRegister ? "Create account" : "Sign in"}</h2>
          <p className="mt-1 text-sm muted">{isRegister ? "Use your work email and a strong password." : "Enter your account credentials."}</p>
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div><label htmlFor="email" className="field-label">Email address</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="input" /></div>
            <div><label htmlFor="password" className="field-label">Password</label><input id="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="input" />{isRegister ? <p className="field-help">Use at least 12 characters.</p> : null}</div>
            {error ? <p role="alert" className="status-message error">{error}</p> : null}
            <button type="submit" disabled={isSubmitting} className="button button-primary w-full">{isSubmitting ? "Please wait..." : isRegister ? "Create account" : "Sign in"}</button>
          </form>
          <p className="mt-6 text-sm muted">{isRegister ? "Already have an account? " : "Need an account? "}<Link href={isRegister ? "/login" : "/register"} className="text-link">{isRegister ? "Sign in" : "Register"}</Link></p>
        </section>
      </main>
    </>
  );
}
