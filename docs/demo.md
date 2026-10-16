# Demo boundaries and recruiter walkthrough

## Synthetic interactive playground

`/demo` is public and does not require login. It presents three fictional personas: Maya Chen (admin), Alex Morgan (member), and Jordan Lee (member). The governance view simulates account status and policy/quota values, changing them in browser-side state and adding synthetic audit entries. Its scripted prompt scenarios show illustrative chat responses incrementally; they are static examples, not model inference. Reset restores the initial synthetic state. Reload also discards in-memory changes.

Optional **live** Quick Demo inference is a separate experience. The client calls only `/api/demo/chat`, which validates a prompt and uses a separately configured `GROQ_API_KEY`. It has bounded prompt/output/duration settings, a shared database-backed daily budget, an optional trusted-proxy IP limit, and a process-local concurrency cap. It does not use the private OpenAI key or write chat records into users/conversations/policies/audits. It is disabled by default; account billing tier must be checked manually, and “free tier confirmed” is an operator setting rather than a provider assertion.

## Shared-account Full Application Demo

This is not the same as the client-side playground. If an operator deliberately configures the dedicated `aegis-public-demo.db` path, creates three accounts, enables shared demo access, and configures HTTPS, the normal login, RBAC, `/chat`, user/policy administration, and audit workflows run against those demo accounts. Their records are intentionally shared among visitors who sign into the same account. Do not use real/private data. No hosted shared demo URL or credentials are claimed here.

Public demo configuration fails closed unless `AEGIS_PUBLIC_DEMO_DATABASE=true`, `AEGIS_DATABASE_PATH` ends in `aegis-public-demo.db`, and the three configured email identities are valid/distinct. Setup/reset are guarded local operator scripts, not HTTP endpoints. The setup can generate credentials once for the operator; only publish credentials after a separate explicit decision and isolated deployment review.

## Two-to-three-minute evaluation path

1. Open the public landing page and choose the interactive demo. Confirm the page labels simulated content.
2. In the synthetic playground, switch among Maya, Alex, and Jordan. Compare the illustrated allowed actions.
3. Change a sample member status or policy/quota. Observe the synthetic audit row and reset the playground. These changes are only client state.
4. Try the fixed scripted prompts and see the response reveal incrementally. This scripted mode makes no provider request and uses no OpenAI credits.
5. If—and only if—a separately hosted live Quick Demo is enabled by an operator, identify that mode clearly and avoid confidential prompts.
6. If a separately configured shared-account deployment and deliberately published credentials exist, use it to inspect real backend account status enforcement, policy admission, audit records, and conversation separation. Verify which pieces are shared demo data. Do not infer that the synthetic persona switch proves server authorization.

There is no guaranteed public URL, public credential, or deployment date in this repository. The README links the source repository and portfolio, not a live Aegis service.
