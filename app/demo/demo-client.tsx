"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const prompts = [
  {
    id: "review",
    prompt: "Summarize this week's access review.",
    reply: "In this scripted example, two members have active AI access and one account is disabled. The operator can review status, adjust per-user limits, and see each account change in the audit history below.",
  },
  {
    id: "limit",
    prompt: "What happens when a member reaches the daily limit?",
    reply: "Aegis checks the member's AI policy before accepting a chat request. When the daily request limit is reached, the server rejects the request with a clear error instead of calling the model. The limit resets on the next UTC day.",
  },
  {
    id: "audit",
    prompt: "How is an account change recorded?",
    reply: "An admin status change and its audit event are written in one SQLite transaction. If the audit insert fails, the status change rolls back. This sample response is scripted; no real account or audit record was touched.",
  },
] as const;

type DemoUser = {
  id: number;
  name: string;
  email: string;
  status: "active" | "disabled";
  aiEnabled: boolean;
  dailyLimit: number;
  usedToday: number;
};

type DemoAuditEvent = {
  id: number;
  time: string;
  action: string;
  target: string;
};

const initialUsers: DemoUser[] = [
  { id: 101, name: "Mira Patel", email: "mira@northstar.example", status: "active", aiEnabled: true, dailyLimit: 80, usedToday: 18 },
  { id: 102, name: "Jonah Reed", email: "jonah@northstar.example", status: "active", aiEnabled: true, dailyLimit: 40, usedToday: 31 },
  { id: 103, name: "Leila Haddad", email: "leila@northstar.example", status: "disabled", aiEnabled: false, dailyLimit: 25, usedToday: 0 },
];

const initialAudit: DemoAuditEvent[] = [
  { id: 1, time: "Sample history", action: "user.disabled", target: "Leila Haddad" },
  { id: 2, time: "Sample history", action: "user.provisioned", target: "Jonah Reed" },
  { id: 3, time: "Sample history", action: "user.provisioned", target: "Mira Patel" },
];

export default function DemoClient() {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [visibleReply, setVisibleReply] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [wasStopped, setWasStopped] = useState(false);
  const [runId, setRunId] = useState(0);
  const [users, setUsers] = useState<DemoUser[]>(() => initialUsers.map((user) => ({ ...user })));
  const [audit, setAudit] = useState<DemoAuditEvent[]>(() => initialAudit.map((event) => ({ ...event })));
  const [selectedUserId, setSelectedUserId] = useState(101);
  const [draftPolicy, setDraftPolicy] = useState({ aiEnabled: true, dailyLimit: "80" });
  const [policyError, setPolicyError] = useState<string | null>(null);
  const nextAuditId = useRef(4);

  const selectedPrompt = prompts.find((item) => item.id === selectedPromptId);
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const hasPolicyChanges = selectedUser !== undefined &&
    (selectedUser.aiEnabled !== draftPolicy.aiEnabled || selectedUser.dailyLimit !== Number(draftPolicy.dailyLimit));

  useEffect(() => {
    if (!isStreaming || !selectedPrompt) return;
    let offset = 0;
    const timer = window.setInterval(() => {
      offset = Math.min(offset + 5, selectedPrompt.reply.length);
      setVisibleReply(selectedPrompt.reply.slice(0, offset));
      if (offset === selectedPrompt.reply.length) {
        window.clearInterval(timer);
        setIsStreaming(false);
      }
    }, 35);
    return () => window.clearInterval(timer);
  }, [isStreaming, runId, selectedPrompt]);

  function playPrompt(id: string) {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSelectedPromptId(id);
    setVisibleReply(reduceMotion ? prompt.reply : "");
    setWasStopped(false);
    setRunId((current) => current + 1);
    setIsStreaming(!reduceMotion);
  }

  function resetChat() {
    setIsStreaming(false);
    setSelectedPromptId(null);
    setVisibleReply("");
    setWasStopped(false);
  }

  function addAudit(action: string, target: string) {
    const event: DemoAuditEvent = {
      id: nextAuditId.current++,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      action,
      target,
    };
    setAudit((current) => [event, ...current].slice(0, 8));
  }

  function toggleStatus(user: DemoUser) {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: nextStatus } : item));
    addAudit(nextStatus === "active" ? "user.enabled" : "user.disabled", user.name);
  }

  function selectUser(user: DemoUser) {
    setSelectedUserId(user.id);
    setDraftPolicy({ aiEnabled: user.aiEnabled, dailyLimit: String(user.dailyLimit) });
    setPolicyError(null);
  }

  function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !hasPolicyChanges) return;
    const dailyLimit = Number(draftPolicy.dailyLimit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) {
      setPolicyError("Daily limit must be a whole number from 1 to 1000.");
      return;
    }
    setUsers((current) => current.map((user) => user.id === selectedUser.id
      ? { ...user, aiEnabled: draftPolicy.aiEnabled, dailyLimit }
      : user));
    addAudit("demo.policy.changed", selectedUser.name);
    setPolicyError(null);
  }

  function resetGovernance() {
    setUsers(initialUsers.map((user) => ({ ...user })));
    setAudit(initialAudit.map((event) => ({ ...event })));
    setSelectedUserId(101);
    setDraftPolicy({ aiEnabled: true, dailyLimit: "80" });
    setPolicyError(null);
    nextAuditId.current = 4;
  }

  return (
    <main className="container app-main">
      <div className="page-heading">
        <div>
          <span className="badge badge-accent">Public simulation</span>
          <h1 className="mt-4">Explore Aegis AI</h1>
          <p>Try the interaction patterns with scripted replies and synthetic account data.</p>
        </div>
      </div>
      <p className="status-message mb-8">Demo interactions run in your browser. They do not call OpenAI, read private data, or save changes to SQLite.</p>

      <section aria-labelledby="demo-chat-title" className="mb-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="demo-chat-title" className="section-title">Simulated chat</h2><p className="mt-1 text-sm muted">Choose a prompt to see a scripted reply appear in increments.</p></div>
          <div className="flex gap-2">
            {isStreaming ? <button type="button" onClick={() => { setIsStreaming(false); setWasStopped(true); }} className="button button-quiet">Stop</button> : null}
            <button type="button" onClick={resetChat} disabled={!selectedPrompt} className="button button-quiet">Reset chat</button>
          </div>
        </div>
        <div className="demo-layout">
          <div className="panel chat-thread" aria-label="Scripted conversation">
            {!selectedPrompt ? (
              <div className="empty-state"><div><h3>Choose a scenario</h3><p>The conversation will appear here. Every answer is written in advance for this demo.</p></div></div>
            ) : (
              <div className="message-list">
                <div className="message message-user"><span className="message-label">You</span>{selectedPrompt.prompt}</div>
                <div className="message message-assistant"><span className="message-label">Aegis AI · scripted</span>{visibleReply || (isStreaming ? "Preparing scripted reply..." : "No reply shown.")}{isStreaming ? <span aria-hidden="true">▌</span> : null}</div>
                <p role="status" className="text-xs muted">{wasStopped ? "Playback stopped. The partial reply is only on this page." : isStreaming ? "Playing scripted response..." : "Scripted response complete."}</p>
              </div>
            )}
          </div>
          <aside className="panel p-5" aria-label="Demo scenarios">
            <h3 className="text-sm font-semibold">Sample prompts</h3>
            <div className="demo-prompt-list mt-4">
              {prompts.map((item) => (
                <button key={item.id} type="button" className="demo-prompt" aria-pressed={item.id === selectedPromptId} onClick={() => playPrompt(item.id)}>{item.prompt}</button>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 muted">The incremental display illustrates streaming. It is a local timer, not a live SSE connection.</p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="demo-governance-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="demo-governance-title" className="section-title">Simulated governance</h2><p className="mt-1 text-sm muted">Change sample status or policy values and watch the local audit history update.</p></div>
          <button type="button" onClick={resetGovernance} className="button button-quiet">Reset to defaults</button>
        </div>
        <div className="demo-governance">
          <div className="space-y-4">
            <div className="table-wrap">
              <table className="data-table min-w-[630px]">
                <thead><tr><th scope="col">Sample member</th><th scope="col">Status</th><th scope="col">AI access</th><th scope="col">Today</th><th scope="col">Actions</th></tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.id}>
                    <td><span className="block font-semibold">{user.name}</span><span className="text-xs muted">{user.email}</span></td>
                    <td><span className={`badge ${user.status === "active" ? "badge-success" : "badge-danger"}`}>{user.status}</span></td>
                    <td>{user.aiEnabled ? "Enabled" : "Off"}</td>
                    <td>{user.usedToday} / {user.dailyLimit} requests</td>
                    <td className="whitespace-nowrap"><button type="button" onClick={() => toggleStatus(user)} className="text-link">{user.status === "active" ? "Disable" : "Enable"}</button><button type="button" onClick={() => selectUser(user)} className="ml-4 text-link">Policy</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {selectedUser ? <form onSubmit={savePolicy} className="panel p-5" aria-label={`Sample AI policy for ${selectedUser.name}`}>
              <div className="mb-4"><h3 className="text-sm font-semibold">AI policy: {selectedUser.name}</h3><p className="mt-1 text-xs muted">Edits stay in this browser tab.</p></div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="input" checked={draftPolicy.aiEnabled} onChange={(event) => { setDraftPolicy({ ...draftPolicy, aiEnabled: event.target.checked }); setPolicyError(null); }} />AI enabled</label>
                <div><label htmlFor="demo-daily-limit" className="field-label">Daily request limit</label><input id="demo-daily-limit" className="input w-32" type="number" min={1} max={1000} step={1} required value={draftPolicy.dailyLimit} onChange={(event) => { setDraftPolicy({ ...draftPolicy, dailyLimit: event.target.value }); setPolicyError(null); }} /></div>
                <button type="submit" disabled={!hasPolicyChanges} className="button button-primary">Save sample policy</button>
              </div>
              {policyError ? <p role="alert" className="mt-3 text-sm error-text">{policyError}</p> : null}
            </form> : null}
          </div>
          <aside className="panel p-5" aria-label="Synthetic audit history">
            <h3 className="text-sm font-semibold">Sample audit history</h3>
            <p className="mt-1 text-xs muted">Actor: Demo operator. Policy edit events are illustrative; the real audit log covers provisioning and status changes.</p>
            <div className="audit-list mt-5" aria-live="polite">
              {audit.map((event) => <div key={event.id} className="audit-event"><span className="block font-mono text-xs text-[var(--accent)]">{event.action}</span><span className="mt-1 block">{event.target}</span><span className="mt-1 block text-xs muted">{event.time}</span></div>)}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
