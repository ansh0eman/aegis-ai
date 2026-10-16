import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDemoAssistantText,
  beginDemoPrompt,
  createInitialDemoState,
  getAccessRules,
  getPersonaConversations,
  getSendDenial,
  selectDemoConversation,
  selectDemoPersona,
  selectDemoSection,
  updateDemoMemberPolicy,
  updateDemoMemberStatus,
} from "../lib/demo-playground.ts";

const fixedDate = new Date("2026-10-16T08:00:00.000Z");
const createState = () => createInitialDemoState(fixedDate);
const persona = (state, id) => state.personas.find((item) => item.id === id);

function sendPrompt(state, prompt = "A sample question", reply = "A sample scripted reply.") {
  return beginDemoPrompt(state, prompt, reply, fixedDate);
}

test("the three identities expose roles and permissions that match Aegis RBAC", () => {
  const state = createState();
  assert.deepEqual(state.personas.map(({ name, role, status }) => [name, role, status]), [
    ["Maya Chen", "admin", "active"],
    ["Alex Morgan", "member", "active"],
    ["Jordan Lee", "member", "active"],
  ]);
  const adminRules = getAccessRules(persona(state, "maya"));
  assert.equal(adminRules.find((rule) => rule.label === "Manage member accounts").allowed, true);
  assert.equal(adminRules.find((rule) => rule.label === "View audit logs").allowed, true);
  assert.equal(adminRules.find((rule) => rule.label === "View other conversations").allowed, false);
  const memberRules = getAccessRules(persona(state, "alex"));
  assert.equal(memberRules.find((rule) => rule.label === "Access administration").allowed, false);
  assert.equal(memberRules.find((rule) => rule.label === "Change AI policies").allowed, false);
});

test("members cannot enter admin sections or mutate member account and policy data", () => {
  let state = selectDemoPersona(createState(), "alex");
  assert.equal(selectDemoSection(state, "governance"), state);
  assert.equal(selectDemoSection(state, "audit"), state);
  assert.equal(updateDemoMemberStatus(state, "alex", "jordan", "disabled", fixedDate), state);
  assert.equal(updateDemoMemberPolicy(state, "alex", "jordan", { aiEnabled: false }, fixedDate), state);
  assert.equal(state.auditEvents.length, 2);
  assert.equal(persona(state, "jordan").status, "active");
  assert.equal(updateDemoMemberStatus(createState(), "maya", "maya", "disabled", fixedDate).personas[0].status, "active");
});

test("the admin identity can use scripted chat within its own configured quota", () => {
  const result = sendPrompt(createState(), "Admin's own sample prompt", "Local scripted answer.");
  assert.equal(result.accepted, true);
  assert.equal(persona(result.state, "maya").usedToday, 13);
  assert.equal(getPersonaConversations(result.state, "maya").length, 1);
});

test("admin status changes are audited once and repeated identical updates are no-ops", () => {
  let state = createState();
  state = updateDemoMemberStatus(state, "maya", "jordan", "disabled", fixedDate);
  assert.equal(persona(state, "jordan").status, "disabled");
  assert.deepEqual(state.auditEvents[0], {
    id: 3,
    actorPersonaId: "maya",
    targetPersonaId: "jordan",
    action: "user.disabled",
    previous: { status: "active" },
    next: { status: "disabled" },
    createdAt: fixedDate.toISOString(),
    synthetic: true,
  });
  const afterChange = state;
  state = updateDemoMemberStatus(state, "maya", "jordan", "disabled", fixedDate);
  assert.equal(state, afterChange);
  state = updateDemoMemberStatus(state, "maya", "jordan", "active", fixedDate);
  assert.equal(persona(state, "jordan").status, "active");
  assert.equal(state.auditEvents[0].action, "user.enabled");
});

test("a disabled account, disabled AI policy, and exhausted quota each block a prompt", () => {
  let state = selectDemoPersona(createState(), "jordan");
  state = updateDemoMemberStatus(selectDemoPersona(state, "maya"), "maya", "jordan", "disabled", fixedDate);
  state = selectDemoPersona(state, "jordan");
  assert.equal(getSendDenial(persona(state, "jordan")), "account_disabled");
  assert.equal(sendPrompt(state).accepted, false);

  state = selectDemoPersona(state, "maya");
  state = updateDemoMemberStatus(state, "maya", "jordan", "active", fixedDate);
  state = updateDemoMemberPolicy(state, "maya", "jordan", { aiEnabled: false }, fixedDate);
  state = selectDemoPersona(state, "jordan");
  assert.equal(getSendDenial(persona(state, "jordan")), "ai_disabled");
  assert.equal(sendPrompt(state).accepted, false);

  state = selectDemoPersona(state, "maya");
  state = updateDemoMemberPolicy(state, "maya", "jordan", { aiEnabled: true, maxRequestsPerDay: 9 }, fixedDate);
  state = selectDemoPersona(state, "jordan");
  assert.equal(getSendDenial(persona(state, "jordan")), "daily_limit");
  assert.equal(sendPrompt(state).accepted, false);
});

test("quota changes affect later requests and valid limits match the SQLite schema", () => {
  let state = createState();
  state = updateDemoMemberPolicy(state, "maya", "alex", { maxRequestsPerDay: 23 }, fixedDate);
  state = selectDemoPersona(state, "alex");
  assert.equal(sendPrompt(state).accepted, false);

  state = selectDemoPersona(state, "maya");
  state = updateDemoMemberPolicy(state, "maya", "alex", { maxRequestsPerDay: 24 }, fixedDate);
  state = selectDemoPersona(state, "alex");
  const accepted = sendPrompt(state);
  assert.equal(accepted.accepted, true);
  assert.equal(persona(accepted.state, "alex").usedToday, 24);
  assert.equal(getSendDenial(persona(accepted.state, "alex")), "daily_limit");
  assert.equal(updateDemoMemberPolicy(accepted.state, "alex", "alex", { maxRequestsPerDay: 25 }, fixedDate), accepted.state);
  assert.equal(updateDemoMemberPolicy(accepted.state, "maya", "alex", { maxRequestsPerDay: 1001 }, fixedDate), accepted.state);
});

test("conversations remain scoped per persona, survive identity switches, and reject cross-owner selection", () => {
  let state = selectDemoPersona(createState(), "alex");
  const first = sendPrompt(state, "Alex private question", "Alex scripted answer.");
  state = first.state;
  state = appendDemoAssistantText(state, "alex", first.conversationId, first.assistantMessageId, "Alex scripted answer.");
  const alexConversation = getPersonaConversations(state, "alex")[0];

  state = selectDemoPersona(state, "jordan");
  assert.equal(getPersonaConversations(state, "jordan").length, 0);
  assert.equal(selectDemoConversation(state, "jordan", alexConversation.id), state);
  const second = sendPrompt(state, "Jordan separate question", "Jordan scripted answer.");
  state = second.state;
  assert.equal(getPersonaConversations(state, "jordan").length, 1);
  assert.equal(getPersonaConversations(state, "alex").length, 1);

  state = selectDemoPersona(state, "alex");
  assert.equal(getPersonaConversations(state, "alex")[0].messages[0].content, "Alex private question");
  assert.equal(appendDemoAssistantText(state, "alex", second.conversationId, second.assistantMessageId, "leak"), state);
  state = selectDemoPersona(state, "maya");
  assert.equal(getPersonaConversations(state, "maya").length, 0);
});

test("policy changes record prior and new values and identical updates do not add events", () => {
  let state = createState();
  state = updateDemoMemberPolicy(state, "maya", "alex", { aiEnabled: false, maxRequestsPerDay: 45 }, fixedDate);
  const event = state.auditEvents[0];
  assert.equal(event.action, "user.ai_policy_updated");
  assert.deepEqual(event.previous, { aiEnabled: true, maxPromptChars: 4000, maxRequestsPerDay: 60 });
  assert.deepEqual(event.next, { aiEnabled: false, maxPromptChars: 4000, maxRequestsPerDay: 45 });
  assert.equal(event.synthetic, true);
  const afterChange = state;
  state = updateDemoMemberPolicy(state, "maya", "alex", { aiEnabled: false, maxRequestsPerDay: 45 }, fixedDate);
  assert.equal(state, afterChange);
});

test("reset restores initial personas, policies, usage, conversations, and synthetic audit events", () => {
  let state = createState();
  state = updateDemoMemberStatus(state, "maya", "jordan", "disabled", fixedDate);
  state = selectDemoPersona(state, "alex");
  const sent = sendPrompt(state);
  assert.equal(sent.accepted, true);
  state = sent.state;
  assert.equal(state.conversations.length, 1);
  const reset = createState();
  assert.equal(reset.selectedPersonaId, "maya");
  assert.equal(reset.activeSection, "chat");
  assert.deepEqual(reset.personas, createInitialDemoState(fixedDate).personas);
  assert.equal(reset.conversations.length, 0);
  assert.equal(reset.auditEvents.length, 2);
  assert.equal(reset.nextConversationId, 1);
});
