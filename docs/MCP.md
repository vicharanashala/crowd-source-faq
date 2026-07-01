# MCP — Model Context Protocol Integration

## What is MCP?

The **Model Context Protocol (MCP)** is a standardized protocol for connecting AI agents to external tools and data sources. In this project, MCP is used in two ways:

1. **Hermes Agent MCP client** — connects to MCP servers at startup, making their tools available as first-class agent tools
2. **CodeGraphContext MCP server** — indexes this codebase into a knowledge graph, enabling semantic code search and call-graph analysis

---

## Table of Contents

1. [Hermes MCP Client](#1-hermes-mcp-client)
2. [CodeGraphContext MCP Server](#2-codegraphcontext-mcp-server)
3. [Available MCP Servers](#3-available-mcp-servers)
4. [Adding a New MCP Server](#4-adding-a-new-mcp-server)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Hermes MCP Client

Hermes Agent (the AI agent running this session) has a built-in native MCP client. On startup, it reads `mcp_servers` from `~/.hermes/config.yaml`, connects to each server, discovers available tools, and registers them with a `mcp_{server}_{tool}` naming prefix.

### How it works

```
Startup:
  1. Read ~/.hermes/config.yaml → mcp_servers section
  2. For each server: spawn stdio subprocess OR open HTTP connection
  3. Initialize MCP session → list_tools() discovery
  4. Register each tool in Hermes tool registry (prefixed mcp_{server}_{tool})
  5. Inject into all platform toolsets (CLI, Discord, Telegram, etc.)

Runtime:
  • MCP tools are called synchronously from agent's perspective
  • Actually run asynchronously on a dedicated background event loop
  • Results returned as JSON with {result} or {error}
  • Connections persist across conversations (within same agent process)
  • Failed connections retry with exponential backoff (up to 5 retries, max 60s)
```

### Tool naming

| Server | Tool | Registered as |
|--------|------|---------------|
| `codegraphcontext` | `find_code` | `mcp_codegraphcontext_find_code` |
| `codegraphcontext` | `trace_path` | `mcp_codegraphcontext_trace_path` |
| `codegraphcontext` | `query_graph` | `mcp_codegraphcontext_query_graph` |
| `codegraphcontext` | `index_repository` | `mcp_codegraphcontext_index_repository` |
| `playwright` | `browser_navigate` | `mcp_playwright_browser_navigate` |
| `context7` | `query_docs` | `mcp_context7_query_docs` |

### Transport types

**Stdio** (command-based, local):
```yaml
mcp_servers:
  server_name:
    command: "npx"              # or "uvx", "python", absolute path
    args: ["-y", "@some/mcp-server"]
    env:                        # ONLY these vars passed to subprocess (safe baseline inherited)
      SOME_API_KEY: "secret"
    timeout: 120               # per-tool-call timeout
    connect_timeout: 60        # initial connection timeout
```

**HTTP** (remote):
```yaml
mcp_servers:
  remote_api:
    url: "https://mcp.example.com/mcp"
    headers:
      Authorization: "Bearer sk-..."
    timeout: 180
    connect_timeout: 30
```

### Security

Environment variable filtering is enforced for stdio servers. Only safe baseline variables are inherited (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`, `XDG_*`). All other env vars (API keys, tokens, secrets) are excluded unless explicitly added via the `env` key.

Credential patterns in error messages are automatically redacted (GitHub PATs `ghp_*`, OpenAI `sk-*`, Bearer tokens, `key=`, `API_KEY=`, etc.).

### Configuration file

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  codegraphcontext:
    command: /opt/anaconda3/bin/cgc
    args: ["mcp", "start"]
    connect_timeout: 120
    timeout: 180

  context7:
    command: npx
    args: ["-y", "@context7/mcp-server"]
    timeout: 120
    connect_timeout: 60

  playwright:
    command: npx
    args: ["-y", "@playwright/mcp"]
    timeout: 120
    connect_timeout: 60
```

Or use the CLI (interactive):
```bash
hermes mcp add <server_name> --command <binary> --args "<args>"
hermes mcp list        # verify connections
```

---

## 2. CodeGraphContext MCP Server

Indexes this repository into a Neo4j-backed knowledge graph. Provides semantic code search, call graph analysis, complexity metrics, and cross-repo intelligence.

**Binary:** `/opt/anaconda3/bin/cgc` (installed separately)
**Start:** `cgc mcp start` (runs as long-lived daemon)
**Database:** `~/.codegraphcontext/global/db/kuzudb` (lock file prevents concurrent runs)

### Available tools

#### `index_repository`
Add a repository to the knowledge graph. Modes:
- `full` — all files + similarity/semantic edges (slow, comprehensive)
- `moderate` — filtered files + similarity/semantic
- `fast` — filtered files only, no similarity/semantic

```ts
mcp_codegraphcontext_index_repository(
  repo_path="/Users/yashhwanth/Documents/crowd-source-faq",
  mode="full",
  is_dependency=false
)
```

#### `find_code`
Semantic code search with BM25 + structural label boosting.

```ts
mcp_codegraphcontext_find_code(
  query="authentication middleware protect route",
  repo_path="/Users/yashhwanth/Documents/crowd-source-faq"
)
// Returns ranked results with relevance scores
// Modes: compact (signatures only), full (with source), files (just paths)
```

#### `trace_path`
Trace call chains through the codebase. Modes:
- `calls` — caller/callee relationships
- `data_flow` — value propagation with args at each hop
- `cross_service` — through HTTP/async Route nodes

```ts
mcp_codegraphcontext_trace_path(
  function_name="toggleUpvote",
  mode="calls",
  depth=3,
  repo_path="/Users/yashhwanth/Documents/crowd-source-faq"
)
```

#### `query_graph`
Run Cypher queries directly against the knowledge graph.

```ts
mcp_codegraphcontext_query_graph(
  query="MATCH (f:Function)-[:CALLS]->(c:Function {name: 'protect'}) RETURN f.name, f.file LIMIT 20",
  repo_path="/Users/yashhwanth/Documents/crowd-source-faq"
)
```

#### `calculate_cyclomatic_complexity`
Measure per-function complexity.

#### `find_dead_code`
Find unused functions (excludes decorated endpoints and route handlers).

#### `visualize_graph_query`
Generate a Neo4j Browser URL to visualize graph query results.

#### `list_indexed_repositories`
Returns all indexed repos with paths.

#### `get_repository_stats`
Stats: files, functions, classes, modules.

#### `switch_context`
Switch to a different repo's `.codegraphcontext/` database.

#### `watch_directory`
Watch a directory for live file changes and auto-update the index.

### Database lock issue

Only one process can hold the kuzudb lock. If you see a lock error:
```bash
# Kill stale processes
ps aux | grep cgc | grep -v grep
kill <pid>

# Or restart
cgc mcp start
```

---

## 3. Available MCP Servers

### Context7 MCP

Provides up-to-date documentation from Context7 for any library/framework.

```yaml
mcp_servers:
  context7:
    command: npx
    args: ["-y", "@context7/mcp-server"]
```

Tools:
- `mcp_context7_query_docs(libraryId, query)` — query documentation
- `mcp_context7_resolve_library_id(query, libraryName)` — resolve library ID

Requires library ID in format `/org/project` or `/org/project/version`.

### Playwright MCP

Browser automation and web scraping.

```yaml
mcp_servers:
  playwright:
    command: npx
    args: ["-y", "@playwright/mcp"]
```

Tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_evaluate`, `browser_screenshot`, etc.

### Native-mcp (built-in)

The Hermes agent itself exposes its tools via MCP internally. This is how subagents and external tools integrate.

---

## 4. Adding a New MCP Server

### Step 1: Choose transport

**Stdio** (local command):
```yaml
mcp_servers:
  my_server:
    command: "npx"
    args: ["-y", "@my/package"]
    timeout: 120
```

**HTTP** (remote):
```yaml
mcp_servers:
  my_server:
    url: "https://my-server.example.com/mcp"
    headers:
      Authorization: "Bearer sk-..."
    timeout: 180
```

### Step 2: Register via config or CLI

**Via CLI (interactive):**
```bash
hermes mcp add my_server --command npx --args "-y @my/package"
```

**Via config set (bypasses connection test):**
```bash
hermes config set mcp_servers.my_server.command "npx"
hermes config set mcp_servers.my_server.args '["-y", "@my/package"]'
hermes config set mcp_servers.my_server.timeout 120
hermes mcp list
```

### Step 3: Restart agent

MCP tools are registered at startup only. Start a new Hermes session after adding servers.

### Step 4: Verify

```bash
hermes mcp list
# → my_server (stdio) — N tool(s)

# Or ask the agent:
# "call mcp_my_server_<tool_name> with args ..."
```

---

## 5. Troubleshooting

### "MCP SDK not available"

```bash
pip install mcp
# or: uv pip install mcp
```

### Tools not appearing

- MCP tools are registered at startup — start a new session
- Check `hermes mcp list` output
- Look for startup log: `MCP: registered N tool(s) from M server(s)`
- Tool names use `mcp_{server}_{tool}` prefix — look for that pattern

### Connection failures

```bash
# Are the server processes alive?
ps aux | grep -E "cgc|context7|playwright" | grep -v grep

# Check startup logs
grep "MCP" ~/.hermes/logs/agent.log | tail -10

# Server stderr
tail -30 ~/.hermes/logs/mcp-stderr.log
```

### Server keeps failing

- npx-based servers download packages on first run → increase `connect_timeout: 120`
- For slow servers, use `hermes config set` instead of `hermes mcp add` to bypass connection test
- Check `connect_timeout` and `timeout` values are sufficient

### Database lock (CodeGraphContext)

```bash
# Kill stale cgc processes
ps aux | grep cgc | grep -v grep | awk '{print $2}' | xargs kill -9
cgc mcp start
```

---

## MCP Tools Available in This Session

Based on currently configured MCP servers:

| Tool | Purpose |
|------|---------|
| `mcp_codegraphcontext_find_code` | Semantic code search across the codebase |
| `mcp_codegraphcontext_trace_path` | Call graph analysis (who calls what) |
| `mcp_codegraphcontext_query_graph` | Cypher queries against the knowledge graph |
| `mcp_codegraphcontext_index_repository` | Index a new repository |
| `mcp_codegraphcontext_list_indexed_repositories` | List all indexed repos |
| `mcp_codegraphcontext_calculate_cyclomatic_complexity` | Measure function complexity |
| `mcp_codegraphcontext_find_dead_code` | Find unused functions |
| `mcp_context7_query_docs` | Query library documentation |
| `mcp_context7_resolve_library_id` | Resolve Context7 library ID |
| `mcp_playwright_*` | Browser automation tools |