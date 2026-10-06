"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold text-blue-700">Aegis AI</Link>
        <h1 className="mt-5 text-2xl font-semibold text-slate-950">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-2 text-sm text-slate-600">{isRegister ? "Register to open your private workspace." : "Log in to continue to your workspace."}</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div><label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">Email</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
          <div><label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">Password</label><input id="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />{isRegister ? <p className="mt-1 text-xs text-slate-500">Use at least 12 characters.</p> : null}</div>
          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{isSubmitting ? "Please wait…" : isRegister ? "Create account" : "Log in"}</button>
        </form>
        <p className="mt-6 text-sm text-slate-600">{isRegister ? "Already have an account? " : "New to Aegis AI? "}<Link href={isRegister ? "/login" : "/register"} className="font-semibold text-blue-700 hover:text-blue-900">{isRegister ? "Log in" : "Create an account"}</Link></p>
      </section>
    </main>
  );
}
