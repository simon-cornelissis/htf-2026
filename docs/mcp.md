# MCP server: let Claude work the terminal

Guardians of the Grid has a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. Connect Claude Code, Claude Desktop or any other MCP client, and Claude can do what you can do in the app: read the board, brief you on the world, report echoes, defuse devices and, if you're a commander, stage false flag operations.

Claude always acts **as you**, with **your role's permissions**. It goes through the same server functions and role checks as the UI, so nothing is possible over MCP that isn't possible in the app.

## Setup

1. Start the app (`npm run dev`, http://localhost:3000) and sign in.
2. Open **MCP access** (`/mcp`), name a token (e.g. "Claude Code on my laptop") and click **Create token**. Copy it right away, because it is shown only once.
3. Connect your client.

**Claude Code**, from a terminal:

```sh
claude mcp add --transport http achrona http://localhost:3000/mcp --header "Authorization: Bearer <YOUR_TOKEN>"
```

Then run `claude` and type `/mcp` to check that `achrona` is connected.

**Project config** (`.mcp.json`): copy `.mcp.json.example` to `.mcp.json`. It reads the token from an environment variable, so the token never ends up in the repo:

```sh
cp .mcp.json.example .mcp.json
export ACHRONA_MCP_TOKEN=achrona_pat_...   # PowerShell: $env:ACHRONA_MCP_TOKEN = "achrona_pat_..."
```

```json
{
  "mcpServers": {
    "achrona": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${ACHRONA_MCP_TOKEN}" }
    }
  }
}
```

**Other clients**: point them at `http://localhost:3000/mcp` (Streamable HTTP) and send the header `Authorization: Bearer <token>`. The MCP access page shows both snippets with your token filled in.

## Tools per role

Clients only see the tools your role may use. A connected client picks up a role change on its next request.

| Tool | Guardian | Defender | Commander / Admin | What it does |
| --- | :-: | :-: | :-: | --- |
| `whoami` | ✓ | ✓ | ✓ | Who the connection acts as, and what that role allows |
| `list_glitches` | ✓ | ✓ | ✓ | List and search glitches (status, open only, district, site, text) |
| `get_glitch` | ✓ | ✓ | ✓ | One glitch file with every echo |
| `get_world` | ✓ | ✓ | ✓ | Grid integrity, open glitches, armed devices, mood per district (most afraid first) |
| `list_districts` | ✓ | ✓ | ✓ | Every district and its five landmarks (site ids) |
| `get_district` | ✓ | ✓ | ✓ | Mood and its drivers, chatter, open glitches; commanders also get the operations log |
| `list_active_bombs` | ✓ | ✓ | ✓ | Armed devices with seconds left, plus recent detonations |
| `list_incidents` | ✓ | ✓ | ✓ | Incident history of the last week with casualties |
| `get_bomb` | ✓ | ✓ | ✓ | A device's wires (0 = leftmost), manual and strikes |
| `get_leaderboard` | ✓ | ✓ | ✓ | Defenders ranked by points |
| `list_persons` | ✓ | ✓ | ✓ | Persons of interest index (status, district, heat), filterable |
| `get_person` | ✓ | ✓ | ✓ | One case file (by id `PI-03` or alias); classified entries stay redacted below commander |
| `get_exposure` | ✓ | ✓ | ✓ | Public trust; commanders get the cover-up integrity reading |
| `report_echo` | | ✓ | ✓ | Open a new glitch, or add an echo to an existing one |
| `cut_wire` | | ✓ | ✓ | Cut a wire on an armed device (defuse!) |
| `set_glitch_status` | | | ✓ | LEAKED → ASSESSING → CONTAINING → FIXED |
| `list_operation_types` | | | ✓ | Operation types with their mood effects, harm and site amplifiers |
| `plan_operation` | | | ✓ | Stage a false flag at a landmark, now or up to 24 h ahead, optionally pinned on a person (`pinnedOn`) |
| `cancel_operation` | | | ✓ | Call off a planned operation before it goes off |
| `list_operations` | | | ✓ | Operations log across all districts |
| `act_on_person` | | | ✓ | Warrant, detain or erase a person of interest |
| `add_case_note` | | | ✓ | Add a (optionally classified) note to a case file |
| `attribute_glitch` | | | ✓ | Pin a glitch on a person of interest |

Role-specific data follows the app's rules too: defenders don't see which glitches were staged, and they see operations only as anonymous "rumours".

Sites can be given as an id (`rustmarket:square`), a landmark name (`Barter Ring`) or in words (`Rustmarket square`). Districts take an id or a name.

**Resources:** `achrona://districts` (all districts and site ids as JSON).
**Prompts:** `situation_report` (everyone), `defuse` (defenders and up), `plan_attack` (commanders).

## Example prompts

- "Which district is most afraid, and why?"
- "Give me a situation report."
- "Is anything ticking right now? Defuse the device at Broken Bridge Halt." (The fuse is 3 minutes, so Claude has to be quick.)
- "Report lights flickering in sequence at Clockworks Central."
- "Move GL-0137 to ASSESSING."
- "Plan a supply scare at the Rustmarket square in 5 minutes."
- "Which operation would scare Greenhold the most? Plan it for tonight with a believable cover story."
- "Cancel every operation I planned in Old Reach."

## Security notes

- **Personal access tokens.** Tokens are random 256-bit values with the prefix `achrona_pat_`. Only their sha256 hash is stored (`api_tokens` table), and the plain token is shown once. Every request looks the token up by hash and stamps "last used". The page lists your tokens with a fingerprint (start of the hash); hold **Revoke** to delete one, and clients using it are cut off on their next request. You can have up to 10 tokens.
- **Same permissions as you.** Each request runs inside `runAs(guardian)`, so every server function's `require*()` check applies. The tool list is filtered by role on top of that, as defence in depth, not as the only check.
- **No deletes.** Deleting glitches or echoes stays human-only in the app. No tool exposes it, for any role.
- **Origin check (DNS rebinding).** Desktop clients send no `Origin` header. Browser requests are only accepted from the app's own origin or localhost; extra origins (e.g. an MCP inspector) can be allowed with `MCP_ALLOWED_ORIGINS=https://a.example,https://b.example`.
- **Stateless transport.** Each POST gets its own server instance scoped to the token's guardian; there are no MCP sessions to hijack. `GET` (event stream) and `DELETE` answer `405`.
- **Tokens are never logged.** Error responses say what's wrong (missing, unknown or revoked token) without echoing it.
- **Keep tokens out of git.** Use `.mcp.json.example` with `${ACHRONA_MCP_TOKEN}`, or add `.mcp.json` to `.gitignore` if you put a token in it.
- Locally the app runs over plain HTTP. When deployed, serve `/mcp` over HTTPS only, because a bearer token is as good as your password for everything your role can do.

## How it's built

| File | Role |
| --- | --- |
| `src/routes/_authed/mcp.tsx` | `/mcp`: the MCP access page in a browser, and the MCP endpoint (`server.handlers.POST`) for clients |
| `src/mcp/http.ts` | Origin check, bearer token auth, stateless `WebStandardStreamableHTTPServerTransport` |
| `src/mcp/tools.ts` | The shared tool registry (name, zod schema, role, effect, approval summary, handler), used by this server **and** by CUSTODIAN, the in-app chat ([chat.md](chat.md)) |
| `src/mcp/server.ts` | `McpServer`: registers the registry's tools for the caller's role, plus the resource and prompts |
| `src/mcp/tokens.ts` | Token generation, hashing and lookup |
| `src/mcp/world-lookup.ts` | Resolves district and site names an LLM uses into ids |
| `src/mcp/capabilities.ts` | Tool names and plain-word capabilities per role (shared with the page; a unit test keeps it in sync with the registry) |
| `src/lib/mcp.functions.ts` | Server functions for the page: list, create and revoke tokens |

A quick check with the official inspector: `npx @modelcontextprotocol/inspector`, transport "Streamable HTTP", URL `http://localhost:3000/mcp`, header `Authorization: Bearer <token>`. It runs on localhost, which the origin check allows.
