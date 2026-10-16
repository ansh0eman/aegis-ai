export type DemoRole = "admin" | "member";
export type DemoStatus = "active" | "disabled";
export type DemoSection = "chat" | "governance" | "audit";
export type DemoAuditAction =
  | "user.provisioned"
  | "user.disabled"
  | "user.enabled"
  | "user.ai_policy_updated";

export type DemoPolicy = {
  aiEnabled: boolean;
  maxPromptChars: number;
  maxRequestsPerDay: number;
};

export type DemoPersona = {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  status: DemoStatus;
  policy: DemoPolicy;
  usedToday: number;
};

export type DemoMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  source?: "scripted" | "live";
};

export type DemoConversation = {
  id: number;
  ownerPersonaId: string;
  title: string;
  createdAt: string;
  messages: DemoMessage[];
};

export type DemoAuditEvent = {
  id: number;
  actorPersonaId: string;
  targetPersonaId: string;
  action: DemoAuditAction;
  previous: Record<string, string | number | boolean> | null;
  next: Record<string, string | number | boolean>;
  createdAt: string;
  synthetic: true;
};

export type DemoPlaygroundState = {
  personas: DemoPersona[];
  conversations: DemoConversation[];
  auditEvents: DemoAuditEvent[];
  selectedPersonaId: string;
  activeSection: DemoSection;
  activeConversationByPersona: Record<string, number | null>;
  nextConversationId: number;
  nextMessageId: number;
  nextAuditId: number;
};

export type AccessRule = {
  label: string;
  allowed: boolean;
  detail: string;
};

export type SendDenial = "account_disabled" | "ai_disabled" | "daily_limit";

export const MAX_ALLOWED_PROMPT_CHARS = 20000;
export const MAX_ALLOWED_REQUESTS_PER_DAY = 1000;

const initialPersonaFixtures: DemoPersona[] = [
  {
    id: "maya",
    name: "Maya Chen",
    email: "maya@aegis-demo.example",
    role: "admin",
    status: "active",
    policy: { aiEnabled: true, maxPromptChars: 4000, maxRequestsPerDay: 100 },
    usedToday: 12,
  },
  {
    id: "alex",
    name: "Alex Morgan",
    email: "alex@aegis-demo.example",
    role: "member",
    status: "active",
    policy: { aiEnabled: true, maxPromptChars: 4000, maxRequestsPerDay: 60 },
    usedToday: 23,
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    email: "jordan@aegis-demo.example",
    role: "member",
    status: "active",
    policy: { aiEnabled: true, maxPromptChars: 4000, maxRequestsPerDay: 40 },
    usedToday: 9,
  },
];

export function createInitialDemoState(now = new Date()): DemoPlaygroundState {
  const personas = initialPersonaFixtures.map((persona) => ({
    ...persona,
    policy: { ...persona.policy },
  }));
  const createdAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const initialEvents: DemoAuditEvent[] = ["alex", "jordan"].map(
    (targetPersonaId, index) => ({
      id: index + 1,
      actorPersonaId: "maya",
      targetPersonaId,
      action: "user.provisioned",
      previous: null,
      next: { role: "member", status: "active" },
      createdAt,
      synthetic: true,
    }),
  );

  return {
    personas,
    conversations: [],
    auditEvents: initialEvents,
    selectedPersonaId: "maya",
    activeSection: "chat",
    activeConversationByPersona: { maya: null, alex: null, jordan: null },
    nextConversationId: 1,
    nextMessageId: 1,
    nextAuditId: initialEvents.length + 1,
  };
}

export function getSelectedPersona(state: DemoPlaygroundState) {
  return state.personas.find((persona) => persona.id === state.selectedPersonaId)!;
}

export function getPersonaConversations(
  state: DemoPlaygroundState,
  personaId: string,
) {
  return state.conversations
    .filter((conversation) => conversation.ownerPersonaId === personaId)
    .sort((left, right) => right.id - left.id);
}

export function getActiveConversation(state: DemoPlaygroundState) {
  const conversationId = state.activeConversationByPersona[state.selectedPersonaId];
  return state.conversations.find(
    (conversation) =>
      conversation.id === conversationId &&
      conversation.ownerPersonaId === state.selectedPersonaId,
  ) ?? null;
}

export function getSendDenial(persona: DemoPersona): SendDenial | null {
  if (persona.status !== "active") return "account_disabled";
  if (!persona.policy.aiEnabled) return "ai_disabled";
  if (persona.usedToday >= persona.policy.maxRequestsPerDay) return "daily_limit";
  return null;
}

export function getAccessRules(persona: DemoPersona): AccessRule[] {
  const isAdmin = persona.role === "admin";
  const canSend = getSendDenial(persona) === null;
  const remaining = Math.max(0, persona.policy.maxRequestsPerDay - persona.usedToday);
  return [
    { label: "Send chat messages", allowed: canSend, detail: sendDenialText(getSendDenial(persona)) },
    { label: "Access administration", allowed: isAdmin && persona.status === "active", detail: isAdmin ? "Admin role" : "Members do not have admin access" },
    { label: "Manage member accounts", allowed: isAdmin && persona.status === "active", detail: isAdmin ? "Can enable or disable members" : "Admin role required" },
    { label: "Change AI policies", allowed: isAdmin && persona.status === "active", detail: isAdmin ? "Can change member AI access and limits" : "Admin role required" },
    { label: "View audit logs", allowed: isAdmin && persona.status === "active", detail: isAdmin ? "Can view administrative audit events" : "Admin role required" },
    { label: "View other conversations", allowed: false, detail: "Conversations stay private to their owner, including for admins" },
    { label: "Account status", allowed: persona.status === "active", detail: persona.status === "active" ? "Account is active" : "Disabled accounts cannot use the workspace" },
    { label: "AI access", allowed: persona.policy.aiEnabled, detail: persona.policy.aiEnabled ? "Policy allows AI requests" : "AI policy is disabled" },
    { label: "Daily requests remaining", allowed: remaining > 0, detail: `${remaining} of ${persona.policy.maxRequestsPerDay} remaining` },
  ];
}

export function sendDenialText(denial: SendDenial | null) {
  if (denial === "account_disabled") return "This account is disabled. Ask an admin to enable it.";
  if (denial === "ai_disabled") return "AI access is disabled by this user's policy.";
  if (denial === "daily_limit") return "The daily request limit has been reached. An admin can raise the quota.";
  return "Ready to send a scripted prompt.";
}

export function selectDemoPersona(state: DemoPlaygroundState, personaId: string) {
  if (!state.personas.some((persona) => persona.id === personaId)) return state;
  return { ...state, selectedPersonaId: personaId, activeSection: "chat" as const };
}

export function selectDemoSection(
  state: DemoPlaygroundState,
  section: DemoSection,
) {
  if (section !== "chat" && getSelectedPersona(state).role !== "admin") return state;
  return { ...state, activeSection: section };
}

function isActiveAdmin(state: DemoPlaygroundState, actorPersonaId: string) {
  const actor = state.personas.find((persona) => persona.id === actorPersonaId);
  return state.selectedPersonaId === actorPersonaId && actor?.role === "admin" && actor.status === "active";
}

function addAuditEvent(
  state: DemoPlaygroundState,
  event: Omit<DemoAuditEvent, "id" | "createdAt" | "synthetic">,
  now = new Date(),
): DemoPlaygroundState {
  const auditEvent: DemoAuditEvent = {
    ...event,
    id: state.nextAuditId,
    createdAt: now.toISOString(),
    synthetic: true,
  };
  return {
    ...state,
    auditEvents: [auditEvent, ...state.auditEvents],
    nextAuditId: state.nextAuditId + 1,
  };
}

export function updateDemoMemberStatus(
  state: DemoPlaygroundState,
  actorPersonaId: string,
  targetPersonaId: string,
  status: DemoStatus,
  now = new Date(),
) {
  if (!isActiveAdmin(state, actorPersonaId) || actorPersonaId === targetPersonaId) return state;
  const target = state.personas.find((persona) => persona.id === targetPersonaId);
  if (!target || target.role !== "member" || target.status === status) return state;

  const action: DemoAuditAction = status === "disabled" ? "user.disabled" : "user.enabled";
  const updated = {
    ...state,
    personas: state.personas.map((persona) => persona.id === targetPersonaId
      ? { ...persona, status }
      : persona),
  };
  return addAuditEvent(updated, {
    actorPersonaId,
    targetPersonaId,
    action,
    previous: { status: target.status },
    next: { status },
  }, now);
}

export function updateDemoMemberPolicy(
  state: DemoPlaygroundState,
  actorPersonaId: string,
  targetPersonaId: string,
  patch: Partial<DemoPolicy>,
  now = new Date(),
) {
  if (!isActiveAdmin(state, actorPersonaId)) return state;
  const target = state.personas.find((persona) => persona.id === targetPersonaId);
  if (!target || target.role !== "member") return state;
  const nextPolicy = { ...target.policy, ...patch };
  if (
    typeof nextPolicy.aiEnabled !== "boolean" ||
    !Number.isSafeInteger(nextPolicy.maxPromptChars) ||
    nextPolicy.maxPromptChars < 1 ||
    nextPolicy.maxPromptChars > MAX_ALLOWED_PROMPT_CHARS ||
    !Number.isSafeInteger(nextPolicy.maxRequestsPerDay) ||
    nextPolicy.maxRequestsPerDay < 1 ||
    nextPolicy.maxRequestsPerDay > MAX_ALLOWED_REQUESTS_PER_DAY
  ) return state;
  if (
    nextPolicy.aiEnabled === target.policy.aiEnabled &&
    nextPolicy.maxPromptChars === target.policy.maxPromptChars &&
    nextPolicy.maxRequestsPerDay === target.policy.maxRequestsPerDay
  ) return state;

  const updated = {
    ...state,
    personas: state.personas.map((persona) => persona.id === targetPersonaId
      ? { ...persona, policy: nextPolicy }
      : persona),
  };
  return addAuditEvent(updated, {
    actorPersonaId,
    targetPersonaId,
    action: "user.ai_policy_updated",
    previous: { ...target.policy },
    next: { ...nextPolicy },
  }, now);
}

export function selectDemoConversation(
  state: DemoPlaygroundState,
  personaId: string,
  conversationId: number | null,
) {
  if (personaId !== state.selectedPersonaId) return state;
  if (conversationId !== null && !state.conversations.some(
    (conversation) => conversation.id === conversationId && conversation.ownerPersonaId === personaId,
  )) return state;
  return {
    ...state,
    activeConversationByPersona: {
      ...state.activeConversationByPersona,
      [personaId]: conversationId,
    },
  };
}

export function beginDemoPrompt(
  state: DemoPlaygroundState,
  prompt: string,
  reply: string,
  now = new Date(),
  source: "scripted" | "live" = "scripted",
): { state: DemoPlaygroundState; accepted: boolean; reason: string; conversationId?: number; assistantMessageId?: number } {
  const persona = getSelectedPersona(state);
  const denial = getSendDenial(persona);
  if (denial) return { state, accepted: false, reason: sendDenialText(denial) };
  if (prompt.length > persona.policy.maxPromptChars) {
    return { state, accepted: false, reason: `This prompt exceeds the ${persona.policy.maxPromptChars} character limit.` };
  }

  const selectedId = state.activeConversationByPersona[persona.id];
  let conversation = state.conversations.find(
    (item) => item.id === selectedId && item.ownerPersonaId === persona.id,
  );
  let nextConversationId = state.nextConversationId;
  let nextMessageId = state.nextMessageId;
  let conversations = state.conversations;
  if (!conversation) {
    conversation = {
      id: nextConversationId++,
      ownerPersonaId: persona.id,
      title: prompt.slice(0, 54),
      createdAt: now.toISOString(),
      messages: [],
    };
    conversations = [...conversations, conversation];
  }

  const userMessage: DemoMessage = { id: nextMessageId++, role: "user", content: prompt };
  const assistantMessage: DemoMessage = { id: nextMessageId++, role: "assistant", content: "", source };
  conversations = conversations.map((item) => item.id === conversation!.id
    ? { ...item, messages: [...item.messages, userMessage, assistantMessage] }
    : item);
  const updated: DemoPlaygroundState = {
    ...state,
    conversations,
    personas: state.personas.map((item) => item.id === persona.id
      ? { ...item, usedToday: item.usedToday + 1 }
      : item),
    activeConversationByPersona: { ...state.activeConversationByPersona, [persona.id]: conversation.id },
    nextConversationId,
    nextMessageId,
  };
  return {
    state: updated,
    accepted: true,
    reason: "Scripted prompt accepted. The response is a local simulation.",
    conversationId: conversation.id,
    assistantMessageId: assistantMessage.id,
  };
}

export function appendDemoAssistantText(
  state: DemoPlaygroundState,
  ownerPersonaId: string,
  conversationId: number,
  assistantMessageId: number,
  chunk: string,
) {
  if (state.selectedPersonaId !== ownerPersonaId) return state;
  const ownedConversation = state.conversations.find(
    (conversation) => conversation.id === conversationId && conversation.ownerPersonaId === ownerPersonaId,
  );
  if (!ownedConversation || !ownedConversation.messages.some(
    (message) => message.id === assistantMessageId && message.role === "assistant",
  )) return state;
  return {
    ...state,
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== conversationId || conversation.ownerPersonaId !== ownerPersonaId) return conversation;
      return {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === assistantMessageId && message.role === "assistant"
            ? { ...message, content: message.content + chunk }
            : message,
        ),
      };
    }),
  };
}
