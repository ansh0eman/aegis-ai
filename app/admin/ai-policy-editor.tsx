"use client";

import { useEffect, useState, type FormEvent } from "react";

type AiPolicy = {
  userId: number;
  aiEnabled: boolean;
  maxPromptChars: number;
  maxRequestsPerDay: number;
};

type PolicyResponse = { policy?: AiPolicy; error?: unknown };

export default function AiPolicyEditor({
  userId,
  email,
}: {
  userId: number;
  email: string;
}) {
  const [policy, setPolicy] = useState<AiPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPolicy() {
      try {
        const response = await fetch(`/api/admin/users/${userId}/ai-policy`);
        const result = (await response.json()) as PolicyResponse;
        if (!response.ok || !result.policy) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "The AI policy could not be loaded.",
          );
        }
        if (!cancelled) setPolicy(result.policy);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The AI policy could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || isSaving) return;
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/ai-policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEnabled: policy.aiEnabled,
          maxPromptChars: policy.maxPromptChars,
          maxRequestsPerDay: policy.maxRequestsPerDay,
        }),
      });
      const result = (await response.json()) as PolicyResponse;
      if (!response.ok || !result.policy) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "The AI policy could not be saved.",
        );
      }
      setPolicy(result.policy);
      setMessage("Policy saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The AI policy could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label={`AI policy for ${email}`} className="space-y-3">
      <h3 className="font-semibold text-slate-950">AI policy · {email}</h3>
      {isLoading ? <p className="text-sm text-slate-500">Loading policy…</p> : null}
      {!isLoading && policy ? (
        <form onSubmit={savePolicy} className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={policy.aiEnabled}
              onChange={(event) =>
                setPolicy({ ...policy, aiEnabled: event.target.checked })
              }
            />
            AI enabled
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Max prompt chars (1–20000)
            <input
              type="number"
              min={1}
              max={20000}
              step={1}
              required
              value={policy.maxPromptChars}
              onChange={(event) =>
                setPolicy({ ...policy, maxPromptChars: Number(event.target.value) })
              }
              className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-950"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Daily requests (1–1000)
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              required
              value={policy.maxRequestsPerDay}
              onChange={(event) =>
                setPolicy({ ...policy, maxRequestsPerDay: Number(event.target.value) })
              }
              className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-950"
            />
          </label>
          <button
            type="submit"
            disabled={isSaving || isLoading}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save policy"}
          </button>
          {message ? <span role="status" className="text-sm text-green-700">{message}</span> : null}
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
