"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseSseJsonData, SseParser } from "@/lib/sse";
import {
  appendDemoAssistantText,
  beginDemoPrompt,
  createInitialDemoState,
  getAccessRules,
  getActiveConversation,
  getSendDenial,
  getPersonaConversations,
  getSelectedPersona,
  selectDemoConversation,
  selectDemoPersona,
  selectDemoSection,
  sendDenialText,
  updateDemoMemberPolicy,
  updateDemoMemberStatus,
  type DemoPersona,
  type DemoSection,
  type DemoStatus,
} from "@/lib/demo-playground";

const scenarios = [
  {
    id: "access-review",
    prompt: "Summarize this week's access review.",
    reply: "This scripted review shows two active members. One member recently used 23 of 60 daily requests, while the other used 9 of 40. Admins can adjust access and limits, and each change appears in the synthetic audit history.",
  },
  {
    id: "quota",
    prompt: "What happens when I reach my daily request limit?",
    reply: "Aegis checks the account status, AI policy, and daily usage before accepting a chat request. Once the configured limit is reached, the server rejects the request before contacting the model. This response is scripted for the demo.",
  },
  {
    id: "conversation-privacy",
    prompt: "Can an admin read my private conversations?",
    reply: "No. Conversations are scoped to their owner. Admins can manage member accounts, policies, and audit events, but the application does not grant them access to another user's conversation history.",
  },
  {
    id: "audit",
    prompt: "What is recorded when an account is disabled?",
    reply: "A successful status change records the acting admin, target member, previous and new status, and timestamp. The real application commits the user change and audit event in one database transaction. This example is synthetic.",
  },
] as const;

type PendingPlayback = {
  personaId: string;
  conversationId: number;
  assistantMessageId: number;
  reply: string;
  mode: "scripted" | "live";
};

type ActiveLiveRequest = {
  controller: AbortController;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
};

const sectionLabels: Record<DemoSection, string> = {
  chat: "Workspace",
  governance: "Governance",
  audit: "Audit history",
};

function AccessRules({ persona }: { persona: DemoPersona }) {
  const rules = getAccessRules(persona);
  const remaining = Math.max(0, persona.policy.maxRequestsPerDay - persona.usedToday);

  return (
    <div className="playground-rules-content">
      <div className="rules-persona">
        <span className="eyebrow">Current identity</span>
        <h2>{persona.name}</h2>
        <p>{persona.role} · {persona.status}</p>
      </div>
      <div className="quota-summary">
        <span className="muted">Daily requests remaining</span>
        <strong>{remaining}<span> / {persona.policy.maxRequestsPerDay}</span></strong>
        <div className="quota-track" aria-label={`${remaining} of ${persona.policy.maxRequestsPerDay} daily requests remaining`}>
          <span style={{ width: `${persona.policy.maxRequestsPerDay === 0 ? 0 : Math.min(100, remaining / persona.policy.maxRequestsPerDay * 100)}%` }} />
        </div>
      </div>
      <ul className="rule-list">
        {rules.map((rule) => (
          <li key={rule.label}>
            <span className={`rule-mark ${rule.allowed ? "is-allowed" : "is-denied"}`} aria-hidden="true">{rule.allowed ? "✓" : "×"}</span>
            <span className="rule-copy">
              <strong>{rule.label}</strong>
              <span>{rule.detail}</span>
            </span>
            <span className={`rule-status ${rule.allowed ? "is-allowed" : "is-denied"}`}>{rule.allowed ? "Allowed" : "Denied"}</span>
          </li>
        ))}
      </ul>
      <p className="rules-footnote">Role and policy checks shown here are simulated in this browser.</p>
    </div>
  );
}

function ConversationPane({
  state,
  persona,
  activeConversation,
  pendingPlayback,
  mode,
  liveInferenceAvailable,
  onModeChange,
  prompt,
  onPromptChange,
  onPromptSubmit,
  isConnecting,
  playbackMessage,
  notice,
  onNewConversation,
  onSelectConversation,
  onPrompt,
  onStop,
}: {
  state: ReturnType<typeof createInitialDemoState>;
  persona: DemoPersona;
  activeConversation: ReturnType<typeof getActiveConversation>;
  pendingPlayback: PendingPlayback | null;
  mode: "scripted" | "live";
  liveInferenceAvailable: boolean;
  playbackMessage: string;
  notice: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: number) => void;
  onPrompt: (prompt: string, reply?: string) => void;
  onModeChange: (mode: "scripted" | "live") => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onPromptSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isConnecting: boolean;
  onStop: () => void;
}) {
  const conversations = getPersonaConversations(state, persona.id);
  const denial = sendDenialText(
    persona.status === "disabled" ? "account_disabled" :
      !persona.policy.aiEnabled ? "ai_disabled" :
        persona.usedToday >= persona.policy.maxRequestsPerDay ? "daily_limit" : null,
  );
  const canSend = persona.status === "active" && persona.policy.aiEnabled && persona.usedToday < persona.policy.maxRequestsPerDay;

  return (
    <div className="workspace-content">
      <header className="playground-section-heading">
        <div>
          <span className="eyebrow">{mode === "live" ? "Live inference" : "Scripted simulation"}</span>
          <h2>Chat workspace</h2>
          <p>{mode === "live" ? "Responses come from Groq. This mode is separately rate-limited and is not connected to production chat data." : "Choose a scripted scenario. No prompt is sent to an API."}</p>
        </div>
        <div className="demo-mode-control" role="group" aria-label="Choose response mode">
          <button type="button" className={`button ${mode === "scripted" ? "button-secondary" : "button-quiet"}`} aria-pressed={mode === "scripted"} disabled={Boolean(pendingPlayback) || isConnecting} onClick={() => onModeChange("scripted")}>Scripted</button>
          <button type="button" className={`button ${mode === "live" ? "button-secondary" : "button-quiet"}`} aria-pressed={mode === "live"} disabled={!liveInferenceAvailable || Boolean(pendingPlayback) || isConnecting} onClick={() => onModeChange("live")}>Live model</button>
          {pendingPlayback || isConnecting ? <button type="button" className="button button-quiet" onClick={onStop}>{mode === "live" ? "Stop response" : "Stop playback"}</button> : null}
        </div>
      </header>

      {!liveInferenceAvailable ? <p className="demo-live-unavailable" role="note">Live inference is disabled until a Groq free-tier account and billing status are verified on the server. Scripted examples remain available.</p> : null}

      <p className={`demo-mode-notice ${mode === "live" ? "is-live" : ""}`} role="status">
        {mode === "live"
          ? "Live mode sends your prompt to Groq. Do not enter personal or confidential information."
          : "Scripted mode uses local sample responses only. It makes no provider request and uses no API credits."}
      </p>

      {persona.status === "disabled" ? (
        <div className="disabled-workspace" role="alert">
          <span className="disabled-workspace-mark" aria-hidden="true">!</span>
          <div><span className="eyebrow">Workspace access blocked</span><h3>This account is disabled.</h3><p>An admin must re-enable {persona.name}&apos;s account before the workspace can be used. Existing sample conversations remain private and will appear again if access is restored.</p></div>
        </div>
      ) : <div className="conversation-workspace">
        <aside className="conversation-rail" aria-label={`${persona.name}'s conversations`}>
          <div className="conversation-rail-heading">
            <div><h3>Conversations</h3><span>{conversations.length} private to {persona.name.split(" ")[0]}</span></div>
            <button type="button" className="new-conversation" onClick={onNewConversation} aria-label="Start a new conversation">+</button>
          </div>
          {conversations.length ? (
            <nav className="conversation-links" aria-label="Conversation history">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className="conversation-link"
                  aria-current={activeConversation?.id === conversation.id ? "page" : undefined}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <span>{conversation.title}</span>
                  <small>{conversation.messages.length / 2} demo turn{conversation.messages.length === 2 ? "" : "s"}</small>
                </button>
              ))}
            </nav>
          ) : <p className="conversation-empty">Your sample conversations will appear here.</p>}
        </aside>

        <div className="conversation-main">
          <div className="playground-messages" aria-label="Conversation messages">
            {activeConversation?.messages.length ? activeConversation.messages.map((message) => (
              <article key={message.id} className={`playground-message ${message.role === "user" ? "from-user" : "from-assistant"}`}>
                <span className="message-label">{message.role === "user" ? persona.name : `Aegis AI · ${message.source ?? "scripted"}`}</span>
                <p>{message.content || (pendingPlayback?.assistantMessageId === message.id ? pendingPlayback.mode === "live" ? "Waiting for the first response chunk…" : "Preparing scripted response…" : "Response stopped before text appeared.")}</p>
                {pendingPlayback?.assistantMessageId === message.id ? <span className="typing-caret" aria-hidden="true">▌</span> : null}
              </article>
            )) : (
              <div className="playground-empty-state">
                <span className="empty-kicker">{mode === "live" ? "Aegis AI / live inference" : "Aegis AI / simulated"}</span>
                <h3>Explore a governed conversation.</h3>
                <p>{mode === "live" ? "The model response appears as the provider sends text chunks." : "Responses are written in advance and displayed incrementally to illustrate streaming."}</p>
              </div>
            )}
          </div>

          <div className="playback-feedback" aria-live="polite" role="status">
            {notice ?? playbackMessage ?? (canSend ? "Choose a prompt to begin. Each accepted prompt uses one simulated request." : denial)}
          </div>
          {mode === "live" ? (
            <form className="demo-live-composer" onSubmit={onPromptSubmit}>
              <label htmlFor="demo-live-prompt">Your prompt</label>
              <textarea id="demo-live-prompt" className="input" rows={3} maxLength={2000} value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder="Ask a general question. Avoid personal or confidential information." disabled={isConnecting || Boolean(pendingPlayback)} />
              <div className="demo-composer-footer"><span>Maximum 1,200 characters. Live input is sent to Groq.</span><button className="button button-primary" type="submit" disabled={isConnecting || Boolean(pendingPlayback) || !prompt.trim() || !canSend}>{isConnecting ? "Connecting…" : pendingPlayback ? "Generating…" : "Send prompt"}</button></div>
            </form>
          ) : null}

          <div className="scenario-picker" aria-label={mode === "live" ? "Suggested prompts" : "Scripted prompts"}>
            <div className="scenario-heading"><span>{mode === "live" ? "Try a prompt" : "Scripted examples"}</span><span>{Math.max(0, persona.policy.maxRequestsPerDay - persona.usedToday)} simulated requests available</span></div>
            <div className="scenario-grid">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className="scenario-button"
                  disabled={Boolean(pendingPlayback) || isConnecting || !canSend}
                  onClick={() => onPrompt(scenario.prompt, scenario.reply)}
                >
                  <span>{scenario.prompt}</span><span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

function GovernancePane({
  personas,
  onStatus,
  onAiAccess,
  onQuota,
}: {
  personas: DemoPersona[];
  onStatus: (personaId: string, status: DemoStatus) => void;
  onAiAccess: (personaId: string, enabled: boolean) => void;
  onQuota: (personaId: string, value: number) => void;
}) {
  const members = personas.filter((persona) => persona.role === "member");
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((member) => [member.id, String(member.policy.maxRequestsPerDay)])),
  );
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="workspace-content">
      <header className="playground-section-heading">
        <div>
          <span className="eyebrow">Admin view · simulated</span>
          <h2>Governance workspace</h2>
          <p>Manage synthetic member access and policy. Changes apply immediately to that persona in this playground.</p>
        </div>
      </header>
      <div className="member-governance-list">
        {members.map((member) => {
          const remaining = Math.max(0, member.policy.maxRequestsPerDay - member.usedToday);
          return (
            <article className="member-governance" key={member.id}>
              <div className="member-summary">
                <span className="member-avatar" aria-hidden="true">{member.name.split(" ").map((part) => part[0]).join("")}</span>
                <div className="member-identity">
                  <h3>{member.name}</h3><p>{member.email}</p>
                </div>
                <span className={`badge ${member.status === "active" ? "badge-success" : "badge-danger"}`}>{member.status}</span>
              </div>
              <div className="member-usage">
                <span className="eyebrow">Synthetic usage</span>
                <strong>{member.usedToday}<span> / {member.policy.maxRequestsPerDay}</span></strong>
                <p>{remaining} requests remain today</p>
                <div className="quota-track" aria-label={`${member.usedToday} of ${member.policy.maxRequestsPerDay} requests used`}>
                  <span style={{ width: `${Math.min(100, member.usedToday / member.policy.maxRequestsPerDay * 100)}%` }} />
                </div>
              </div>
              <div className="member-controls">
                <div className="member-control-row">
                  <div><strong>Account access</strong><span>{member.status === "active" ? "Can use the workspace" : "Workspace actions are blocked"}</span></div>
                  <button type="button" className={`button ${member.status === "active" ? "button-danger" : "button-secondary"}`} onClick={() => { onStatus(member.id, member.status === "active" ? "disabled" : "active"); setMessage(`${member.name}'s account status was updated in the simulation.`); }}>
                    {member.status === "active" ? "Disable account" : "Enable account"}
                  </button>
                </div>
                <div className="member-control-row">
                  <div><strong>AI access</strong><span>{member.policy.aiEnabled ? "Enabled by policy" : "Disabled by policy"}</span></div>
                  <button type="button" aria-pressed={member.policy.aiEnabled} className={`button ${member.policy.aiEnabled ? "button-secondary" : "button-primary"}`} onClick={() => { onAiAccess(member.id, !member.policy.aiEnabled); setMessage(`${member.name}'s AI access policy was updated in the simulation.`); }}>
                    {member.policy.aiEnabled ? "Turn off AI" : "Turn on AI"}
                  </button>
                </div>
                <form className="member-control-row quota-editor" onSubmit={(event) => {
                  event.preventDefault();
                  const nextQuota = Number(quotaDrafts[member.id]);
                  if (!Number.isSafeInteger(nextQuota) || nextQuota < 1 || nextQuota > 1000) {
                    setMessage("Daily quota must be a whole number from 1 to 1000.");
                    return;
                  }
                  onQuota(member.id, nextQuota);
                  setMessage(`${member.name}'s daily quota was updated in the simulation.`);
                }}>
                  <label htmlFor={`quota-${member.id}`}><strong>Daily request quota</strong><span>Valid range: 1–1000 requests</span></label>
                  <div className="quota-form-controls">
                    <input id={`quota-${member.id}`} className="input" type="number" min={1} max={1000} step={1} required value={quotaDrafts[member.id] ?? member.policy.maxRequestsPerDay} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [member.id]: event.target.value }))} />
                    <button className="button button-quiet" type="submit" disabled={Number(quotaDrafts[member.id]) === member.policy.maxRequestsPerDay}>Save quota</button>
                  </div>
                </form>
              </div>
            </article>
          );
        })}
      </div>
      <p className="playback-feedback" role="status" aria-live="polite">{message ?? "Only the admin persona can change these synthetic member accounts."}</p>
      <p className="governance-privacy-note">Conversation contents are private to each persona. The governance view contains account and policy data only.</p>
    </div>
  );
}

function AuditPane({ state }: { state: ReturnType<typeof createInitialDemoState> }) {
  const nameFor = (personaId: string) => state.personas.find((persona) => persona.id === personaId)?.name ?? "Unknown demo identity";
  return (
    <div className="workspace-content">
      <header className="playground-section-heading">
        <div>
          <span className="eyebrow">Synthetic records only</span>
          <h2>Simulated audit history</h2>
          <p>Events are kept in local React state and disappear when the page reloads.</p>
        </div>
        <span className="badge badge-accent">{state.auditEvents.length} sample events</span>
      </header>
      {state.auditEvents.length ? (
        <div className="demo-audit-list">
          {state.auditEvents.map((event) => (
            <article className="demo-audit-event" key={event.id}>
              <div className="audit-event-top"><span className="audit-action">{event.action}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
              <p><strong>{nameFor(event.actorPersonaId)}</strong> changed <strong>{nameFor(event.targetPersonaId)}</strong></p>
              <div className="audit-values"><span>Before: {event.previous ? JSON.stringify(event.previous) : "No previous account"}</span><span>After: {JSON.stringify(event.next)}</span></div>
              <span className="audit-synthetic-label">Synthetic demo event</span>
            </article>
          ))}
        </div>
      ) : <div className="playground-empty-state"><h3>No sample changes yet</h3><p>Change a member status or AI policy in Governance to add a synthetic event.</p></div>}
    </div>
  );
}

function IdentityPicker({
  personas,
  selectedId,
  onSelect,
}: {
  personas: DemoPersona[];
  selectedId: string;
  onSelect: (personaId: string) => void;
}) {
  return (
    <>
      <label className="mobile-identity-picker">
        <span className="eyebrow">Switch demo identity</span>
        <select className="input" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
          {personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name} · {persona.role}</option>)}
        </select>
      </label>
      <div className="desktop-identity-picker" role="group" aria-label="Switch demo identity">
        {personas.map((persona) => (
          <button key={persona.id} type="button" className="persona-option" aria-pressed={persona.id === selectedId} onClick={() => onSelect(persona.id)}>
            <span className="persona-avatar" aria-hidden="true">{persona.name.split(" ").map((part) => part[0]).join("")}</span>
            <span className="persona-details"><strong>{persona.name}</strong><span>{persona.role} · {persona.status}</span></span>
            <span className="persona-check" aria-hidden="true">{persona.id === selectedId ? "●" : "○"}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export default function DemoClient({ liveInferenceAvailable }: { liveInferenceAvailable: boolean }) {
  const [state, setState] = useState(createInitialDemoState);
  const stateRef = useRef(state);
  const [mode, setMode] = useState<"scripted" | "live">("scripted");
  const [prompt, setPrompt] = useState("");
  const [pendingPlayback, setPendingPlayback] = useState<PendingPlayback | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playbackMessage, setPlaybackMessage] = useState("");
  const activeLiveRequest = useRef<ActiveLiveRequest | null>(null);
  const persona = getSelectedPersona(state);
  const activeConversation = getActiveConversation(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!pendingPlayback || pendingPlayback.mode !== "scripted") return;
    let offset = 0;
    const timer = window.setInterval(() => {
      const end = Math.min(offset + 7, pendingPlayback.reply.length);
      const chunk = pendingPlayback.reply.slice(offset, end);
      offset = end;
      setState((current) => appendDemoAssistantText(
        current,
        pendingPlayback.personaId,
        pendingPlayback.conversationId,
        pendingPlayback.assistantMessageId,
        chunk,
      ));
      if (offset >= pendingPlayback.reply.length) {
        window.clearInterval(timer);
        setPendingPlayback(null);
        setPlaybackMessage("Scripted response complete.");
      }
    }, 32);
    return () => window.clearInterval(timer);
  }, [pendingPlayback]);

  function cancelLiveRequest() {
    const active = activeLiveRequest.current;
    if (!active) return;
    activeLiveRequest.current = null;
    active.controller.abort();
    if (active.reader) void active.reader.cancel().catch(() => {});
    setIsConnecting(false);
  }

  function switchPersona(personaId: string) {
    cancelLiveRequest();
    setPendingPlayback(null);
    setNotice(null);
    setPlaybackMessage("");
    setState((current) => selectDemoPersona(current, personaId));
  }

  function selectSection(section: DemoSection) {
    cancelLiveRequest();
    setPendingPlayback(null);
    setNotice(null);
    setState((current) => selectDemoSection(current, section));
  }

  function runScriptedPrompt(prompt: string, reply: string) {
    if (pendingPlayback) return;
    const result = beginDemoPrompt(stateRef.current, prompt, reply);
    setState(result.state);
    setNotice(result.accepted ? null : result.reason);
    setPlaybackMessage(result.accepted ? "" : result.reason);
    if (result.accepted && result.conversationId && result.assistantMessageId) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setState((current) => appendDemoAssistantText(
          current,
          persona.id,
          result.conversationId!,
          result.assistantMessageId!,
          reply,
        ));
        setPlaybackMessage("Scripted response complete. Reduced motion preference applied.");
        return;
      }
      setPendingPlayback({
        personaId: persona.id,
        conversationId: result.conversationId,
        assistantMessageId: result.assistantMessageId,
        reply,
        mode: "scripted",
      });
    }
  }

  async function runLivePrompt(rawPrompt: string) {
    if (activeLiveRequest.current || pendingPlayback || !liveInferenceAvailable) return;
    const prompt = rawPrompt.trim();
    const currentState = stateRef.current;
    const currentPersona = getSelectedPersona(currentState);
    const denial = getSendDenial(currentPersona);
    if (denial) {
      setNotice(sendDenialText(denial));
      return;
    }
    if (!prompt) {
      setNotice("Enter a prompt before sending.");
      return;
    }
    if (prompt.length > currentPersona.policy.maxPromptChars || prompt.length > 2_000) {
      setNotice(`Prompt must be ${Math.min(currentPersona.policy.maxPromptChars, 2_000)} characters or fewer.`);
      return;
    }

    const active: ActiveLiveRequest = { controller: new AbortController() };
    activeLiveRequest.current = active;
    setNotice(null);
    setPlaybackMessage("Connecting to the live inference service…");
    setIsConnecting(true);

    try {
      const response = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: active.controller.signal,
      });

      if (activeLiveRequest.current !== active) return;
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof data?.error === "string" ? data.error : "Live inference could not be started.");
      }
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!response.body || !contentType.toLowerCase().includes("text/event-stream")) {
        throw new Error("The live inference service returned an invalid response stream.");
      }

      const result = beginDemoPrompt(stateRef.current, prompt, "", new Date(), "live");
      if (!result.accepted || result.conversationId === undefined || result.assistantMessageId === undefined) {
        throw new Error(result.reason || "This demo identity cannot send a prompt.");
      }
      setState(result.state);
      setPrompt("");
      setPendingPlayback({
        personaId: currentPersona.id,
        conversationId: result.conversationId,
        assistantMessageId: result.assistantMessageId,
        reply: "",
        mode: "live",
      });
      setPlaybackMessage("Live response is streaming. The accepted request uses one simulated persona request.");
      setIsConnecting(false);

      const reader = response.body.getReader();
      active.reader = reader;
      const parser = new SseParser();
      const decoder = new TextDecoder();
      let completed = false;
      const consumeEvents = (text: string) => {
        for (const event of parser.feed(text)) {
          let data: Record<string, unknown>;
          try {
            data = parseSseJsonData(event.data);
          } catch {
            throw new Error("The live response stream contained invalid data.");
          }
          if (event.event === "delta") {
            if (typeof data.text !== "string") throw new Error("The live response stream was invalid.");
            setState((existing) => appendDemoAssistantText(
              existing,
              currentPersona.id,
              result.conversationId!,
              result.assistantMessageId!,
              data.text as string,
            ));
          } else if (event.event === "done") {
            completed = true;
          } else if (event.event === "error") {
            throw new Error(typeof data.message === "string" ? data.message : "The live response was interrupted.");
          }
        }
      };

      while (activeLiveRequest.current === active) {
        const { value, done } = await reader.read();
        if (done) break;
        consumeEvents(decoder.decode(value, { stream: true }));
      }
      if (activeLiveRequest.current !== active) return;
      consumeEvents(decoder.decode());
      if (!completed) throw new Error("The live response ended before completion. Its partial text remains in this local conversation.");
      setPendingPlayback(null);
      setPlaybackMessage("Live response complete. This conversation exists only in the current page session.");
    } catch (error) {
      if (activeLiveRequest.current !== active) return;
      const message = error instanceof Error ? error.message : "Live inference failed. Try a scripted example.";
      setNotice(message);
      setPlaybackMessage("");
      setPendingPlayback((current) => current?.mode === "live" ? null : current);
    } finally {
      if (activeLiveRequest.current === active) {
        activeLiveRequest.current = null;
        setIsConnecting(false);
      }
      if (active.reader) {
        try { active.reader.releaseLock(); } catch { /* Reader may already be released. */ }
      }
    }
  }

  function runPrompt(prompt: string, scriptedReply?: string) {
    if (mode === "live") {
      void runLivePrompt(prompt);
      return;
    }
    if (scriptedReply) runScriptedPrompt(prompt, scriptedReply);
  }

  function handleLivePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConnecting && !pendingPlayback) void runLivePrompt(prompt);
  }

  function resetPlayground() {
    cancelLiveRequest();
    setPendingPlayback(null);
    setNotice(null);
    setPlaybackMessage("Playground reset. All synthetic identities, conversations, usage, and audit events returned to defaults.");
    setState(createInitialDemoState());
  }

  function updateStatus(targetPersonaId: string, status: DemoStatus) {
    setState((current) => updateDemoMemberStatus(current, current.selectedPersonaId, targetPersonaId, status));
  }

  function updateAiAccess(targetPersonaId: string, aiEnabled: boolean) {
    setState((current) => updateDemoMemberPolicy(current, current.selectedPersonaId, targetPersonaId, { aiEnabled }));
  }

  function updateQuota(targetPersonaId: string, maxRequestsPerDay: number) {
    setState((current) => updateDemoMemberPolicy(current, current.selectedPersonaId, targetPersonaId, { maxRequestsPerDay }));
  }

  function startNewConversation() {
    cancelLiveRequest();
    setPendingPlayback(null);
    setNotice(null);
    setPlaybackMessage("");
    setState((current) => selectDemoConversation(current, persona.id, null));
  }

  useEffect(() => () => {
    const active = activeLiveRequest.current;
    activeLiveRequest.current = null;
    active?.controller.abort();
    if (active?.reader) void active.reader.cancel().catch(() => {});
  }, []);

  return (
    <main className="playground-page">
      <div className="playground-topline">
        <div className="playground-title"><span className="badge badge-accent">PUBLIC SIMULATION</span><h1>Enterprise access, in context.</h1><p>Switch roles and see how account status, AI policy, and conversation ownership shape the workspace.</p></div>
        <button type="button" className="button button-quiet reset-playground" onClick={resetPlayground}>Reset playground</button>
      </div>

      <div className="mobile-demo-notice status-message">Synthetic identities and governance data. Live inference is optional, separately limited, and never uses production chat data.</div>

      <div className="playground-shell">
        <aside className="playground-sidebar" aria-label="Demo workspace navigation">
          <div className="sidebar-section">
            <div className="sidebar-label-row"><span className="sidebar-label">Identities</span><span className="sidebar-hint">switch role</span></div>
            <IdentityPicker personas={state.personas} selectedId={persona.id} onSelect={switchPersona} />
          </div>

          <nav className="playground-nav" aria-label="Demo sections">
            <span className="sidebar-label">Workspace</span>
            <button type="button" className={`playground-nav-item ${state.activeSection === "chat" ? "is-current" : ""}`} aria-current={state.activeSection === "chat" ? "page" : undefined} onClick={() => selectSection("chat")}><span aria-hidden="true">▤</span> Chat workspace</button>
            {persona.role === "admin" ? <>
              <button type="button" className={`playground-nav-item ${state.activeSection === "governance" ? "is-current" : ""}`} aria-current={state.activeSection === "governance" ? "page" : undefined} onClick={() => selectSection("governance")}><span aria-hidden="true">◫</span> Governance</button>
              <button type="button" className={`playground-nav-item ${state.activeSection === "audit" ? "is-current" : ""}`} aria-current={state.activeSection === "audit" ? "page" : undefined} onClick={() => selectSection("audit")}><span aria-hidden="true">≡</span> Audit history</button>
            </> : null}
          </nav>

          {state.activeSection === "chat" ? (
            <div className="sidebar-conversations">
              <div className="sidebar-label-row"><span className="sidebar-label">Recent conversations</span><span className="sidebar-hint">{getPersonaConversations(state, persona.id).length}</span></div>
              <div className="sidebar-conversation-list">
                {getPersonaConversations(state, persona.id).length ? getPersonaConversations(state, persona.id).map((conversation) => (
                  <button key={conversation.id} type="button" className="sidebar-conversation" aria-current={activeConversation?.id === conversation.id ? "page" : undefined} onClick={() => {
                    setPendingPlayback(null);
                    setNotice(null);
                    setState((current) => selectDemoConversation(current, persona.id, conversation.id));
                  }}>
                    <span aria-hidden="true">◦</span><span>{conversation.title}</span>
                  </button>
                )) : <p className="sidebar-empty">No conversations yet</p>}
              </div>
            </div>
          ) : null}

          <div className="sidebar-bottom"><span className="live-dot" aria-hidden="true" /> Demo state is local to this page</div>
        </aside>

        <section className="playground-main" aria-label={sectionLabels[state.activeSection]}>
          {state.activeSection === "chat" ? (
            <ConversationPane
              state={state}
              persona={persona}
              activeConversation={activeConversation}
              pendingPlayback={pendingPlayback}
              playbackMessage={playbackMessage}
              notice={notice}
              onNewConversation={startNewConversation}
              onSelectConversation={(conversationId) => {
                setPendingPlayback(null);
                setNotice(null);
                setState((current) => selectDemoConversation(current, persona.id, conversationId));
              }}
              onPrompt={runPrompt}
              mode={mode}
              liveInferenceAvailable={liveInferenceAvailable}
              onModeChange={(nextMode) => { setMode(nextMode); setNotice(null); setPlaybackMessage(""); }}
              prompt={prompt}
              onPromptChange={setPrompt}
              onPromptSubmit={handleLivePromptSubmit}
              isConnecting={isConnecting}
              onStop={() => {
                cancelLiveRequest();
                setPendingPlayback(null);
                setPlaybackMessage(mode === "live" ? "Live response stopped. Partial text remains only in this page session; the admitted request still counts toward the simulated quota." : "Playback stopped. The partial scripted reply remains in this persona's conversation.");
              }}
            />
          ) : state.activeSection === "governance" && persona.role === "admin" ? (
            <GovernancePane personas={state.personas} onStatus={updateStatus} onAiAccess={updateAiAccess} onQuota={updateQuota} />
          ) : state.activeSection === "audit" && persona.role === "admin" ? (
            <AuditPane state={state} />
          ) : null}
        </section>

        <aside className="playground-access-desktop" aria-label="Current access rules">
          <div className="access-panel-heading"><span className="eyebrow">Live permissions</span><span className="access-lock" aria-hidden="true">●</span></div>
          <AccessRules persona={persona} />
        </aside>
      </div>

      <details className="playground-access-mobile">
        <summary><span>Access Rules</span><span>{persona.role} · {persona.status}</span></summary>
        <AccessRules persona={persona} />
      </details>
      <p className="playground-disclaimer">Identities, governance, quotas, and audit events are synthetic and reset when this page reloads. Scripted examples make no provider request. Live prompts are sent to Groq only when the server-side free-tier gate is explicitly enabled, and remain outside production chat storage. Do not enter personal or confidential information.</p>
    </main>
  );
}
