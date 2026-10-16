# Recruiter evaluation guide

## A two-to-three-minute walkthrough

1. **Landing page:** show the project scope and architecture claims. The page is a reference app, not a claim of certification or hosted production service.
2. **Interactive demo:** open `/demo`, switch between Maya (simulated admin), Alex and Jordan (simulated members), and inspect how the illustrative rules differ by persona.
3. **Governance:** change a synthetic member status and quota/policy; show the local synthetic audit entry, then reset. This interaction exists in browser state only.
4. **Chat:** run one fixed scripted prompt and show incremental presentation. Scripted responses are authored examples. They do not call OpenAI or consume provider credits.
5. **Backend behavior, if a local/private account is available:** sign into the real app, inspect persisted conversation reload, policy rejection, admin status mutation and audit. Private inference requires an operator-supplied server key. Never provide a recruiter's access to owner credentials or a private database.
6. **Optional live inference:** only if an operator has deliberately enabled the isolated Quick Demo Groq path; label it as live, state that provider costs/tier depend on the operator account, and use non-sensitive prompts.

## What is genuine versus illustrative

| Surface | Behavior |
| --- | --- |
| Synthetic playground persona/RBAC panels | Client-side illustration; not security controls |
| Synthetic status/policy/audit edits | Local browser state, resettable; no SQLite write |
| Fixed scripted chat | Prewritten responses with incremental presentation; no inference API |
| Optional Quick Demo live chat | Server-side Groq path behind explicit operator gates and limits |
| Authenticated workspace/admin | Real session, database ownership/role checks, policies, persistence and audits when configured |
| Public shared-account demo | Real backend but intentionally shared account data; only when isolated and configured by operator |

Conversation isolation means one authenticated user can only load conversations owned by that user. The synthetic persona model does not test or prove that boundary. There is no public Aegis deployment or shared credential asserted by this guide. If you host a demo, publish its URL and any disposable shared credentials deliberately after verifying isolation and reset procedures.
