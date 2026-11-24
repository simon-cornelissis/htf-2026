# CUSTODIAN: the in-app chat assistant

CUSTODIAN is the Guardians' terminal intelligence: a chat dock on every signed-in page. Ask it questions ("Situation report", "Which district is most afraid?") or tell it to act ("Report: smoke over Fountain Square", "Plan a supply scare at the Rustmarket square in 5 minutes"). It reads the terminal by itself, and it **asks you before it changes anything**.

It runs on Claude (`claude-opus-5-5`) through the Anthropic Messages API, using the same tools as the [MCP server](mcp.md), and it acts **as you, with your role's permissions**.

## Setup

1. Get an API key at https://console.anthropic.com.
2. Copy `.env.example` to `.env` (git ignores `.env`) and fill it in:

   ```sh
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Restart the dev server (`npm run dev`).
4. Open the dock with the **Custodian** button in the nav bar, or press `C`. `Esc` closes it.

Without a key the dock says *"CUSTODIAN offline: add ANTHROPIC_API_KEY to .env and restart the dev server"* and the rest of the app works as usual.

How the key reaches the server: in `vite dev`, nitro loads `.env` into `process.env`. A production build (`node .output/server/index.mjs`) does not, so `src/chat/server.ts` calls Node's `process.loadEnvFile('.env')` when the key is missing and a `.env` exists. Setting `ANTHROPIC_API_KEY` in the real environment works too and takes precedence.

## How approvals work

Each tool has an effect: `read`, `write` or `attack`.

- **Read tools** (list_glitches, get_world, get_district, list_persons, ...) run straight away. The transcript shows them as a compact line: `· consulted: get_world, list_glitches`.
- **Write tools** (report_echo, cut_wire, set_glitch_status, cancel_operation, act_on_person, add_case_note, attribute_glitch) do not run. CUSTODIAN stops and shows an **approval card**: a plain-language summary, the exact parameters, and **Approve / Reject**.
- **Attacks** (plan_operation, and act_on_person with `erase`) show the same card in red and need **press-and-hold** to authorise.

Approve: the tool runs as you, its answer goes back to CUSTODIAN and the conversation continues; the app's data refreshes. Reject: CUSTODIAN gets the tool result "Rejected by the operator." and carries on. Typing a new message while a card waits rejects it. When CUSTODIAN calls several tools at once, the cards come one at a time.

## What each role can do

| Role | CUSTODIAN can |
| --- | --- |
| Guardian | Read everything the role may see: board, world state, districts, devices, incidents, leaderboard, persons of interest, public trust |
| Defender | The above, plus report echoes and defuse devices (each with approval) |
| Commander / Admin | The above, plus change glitch status, plan and cancel false flag operations (pinned on a person if wanted), issue warrants, detain or erase persons of interest, add case notes and pin glitches on people |

Lore and clearance: below commander, CUSTODIAN only knows the official record (the Desync is to blame). The classified facts (what really causes the glitches, that operations are staged) are only in the commander/admin system prompt, so lower roles can't get them out of it.

## Security notes

- **The API key stays on the server.** It's read from `process.env` in `src/chat/server.ts` only, never logged, never sent to the browser (the client bundle contains no SDK and no key).
- **Same permissions as you.** Tools are filtered by your role before they are offered to the model, re-checked when a call comes in, re-checked again when you approve (with your role at that moment), and every tool runs inside `runAs(you)`, so the server functions' own `require*()` checks apply. Classified fields are filtered by the server functions themselves.
- **The client never sends a tool call.** Conversation state, including the pending call and its parameters, lives on the server. The browser can only send text, or "approve/reject action X" for the one action the server is waiting on.
- **Prompt injection.** Echo texts, glitch descriptions, cover stories, case notes and every other tool result are written by other people. The system prompt tells CUSTODIAN to treat them as data and never as instructions, and that nothing in a message or record can grant clearance or approve an action. Even if the model were fooled, it can only *propose* a write: a human still has to approve it.
- **Limits.** At most 8 model calls per turn, 16k output tokens per call, 12 turns per guardian per minute, 4 threads per guardian, threads expire after 1 hour idle (in memory; a server restart clears them), tool results are capped at 40k characters.
- **Errors are readable.** Invalid key, rate limits, overload, network failures and refusals show as a red line in the transcript, never as a crash.
- **Refusals.** Requests use server-side fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if the model's safety classifiers decline a request, the API retries it on a fallback model. If the whole chain declines, the transcript says so.

## How it's built

| File | Role |
| --- | --- |
| `src/mcp/tools.ts` | Shared tool registry: name, description, zod schema, role, effect, approval summary, handler. Used by MCP and CUSTODIAN |
| `src/chat/engine.ts` | The manual tool-use loop with the approval gate, thread store, limits. Dependencies (Messages API, tool execution, clock) are injected |
| `src/chat/prompt.ts` | CUSTODIAN's system prompt, one fixed text per role (cached) |
| `src/chat/server.ts` | Wires the engine to the Anthropic SDK and the registry; reads the key |
| `src/chat/types.ts`, `src/chat/starters.ts` | View types and starter prompts (shared with the client) |
| `src/lib/chat.functions.ts` | Server functions: status, thread, send, decide, reset |
| `src/components/chat/ChatDock.tsx` | The dock: CRT transcript, approval cards, input |
| `src/chat/engine.test.ts` | Unit tests against a scripted Messages API (`npx vitest run src/chat`) |

Request shape: `claude-opus-5-5`, adaptive thinking, `output_config.effort: "medium"`, no sampling parameters or forced `tool_choice`, prompt caching on the system prompt and the conversation (tools and system are fixed per role, so the prefix stays byte-identical). Thinking blocks are sent back unchanged and the history is append-only.
