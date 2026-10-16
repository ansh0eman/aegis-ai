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
    <section aria-label={`AI policy for ${email}`} className="p-2 sm:p-3">
      <h3 className="font-semibold">AI policy: {email}</h3>
      <p className="mt-1 text-xs muted">Changes to access and limits apply to future chat requests.</p>
      {isLoading ? <p role="status" className="status-message mt-4">Loading policy...</p> : null}
      {!isLoading && policy ? (
        <form onSubmit={savePolicy} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="input"
              checked={policy.aiEnabled}
              onChange={(event) =>
                setPolicy({ ...policy, aiEnabled: event.target.checked })
              }
            />
            AI enabled
          </label>
          <label className="block text-sm font-medium">
            <span className="field-label">Max prompt characters</span>
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
              className="input w-36"
            />
          </label>
          <label className="block text-sm font-medium">
            <span className="field-label">Daily requests</span>
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
              className="input w-36"
            />
          </label>
          <button
            type="submit"
            disabled={isSaving || isLoading}
            className="button button-primary"
          >
            {isSaving ? "Saving..." : "Save policy"}
          </button>
          {message ? <span role="status" className="text-sm success-text">{message}</span> : null}
        </form>
      ) : null}
      {error ? <p role="alert" className="status-message error mt-4">{error}</p> : null}
    </section>
  );
}
