# Eva — LLM Brain

Eva is a local-first desktop app for building a personal knowledge base with an
LLM. Instead of repeatedly retrieving from raw documents at question time, Eva
helps an agent maintain a durable, linked Markdown brain between the sources
and the user.

The V1 on-disk and operational contract lives in
[`docs/V1_VAULT_CONTRACT.md`](docs/V1_VAULT_CONTRACT.md). It keeps sources,
wiki pages, agent instructions, and local change history portable across tools.

- `packages/wiki-lib` — pure TypeScript frontmatter/wiki-link parsing, graph
  building, and deterministic structural linting. Includes a 16-page fixture.
- `packages/eva-mcp` — read-only MCP navigation tools for an agent: search,
  page reads, neighbors, and shortest paths.
- `apps/desktop` — Tauri v2 + Vite graph explorer plus Codex CLI and Claude
  Code adapters for worktree-isolated ingest, cited query, and read-only
  Health Check.
- `schema/` and `templates/vault/` — the generic V1 vault contract and the
  starter infrastructure seeded into an Eva-managed vault.

## Setup

```sh
npm install          # installs workspaces, builds wiki-lib via its prepare script
npm test             # wiki-lib unit tests (vitest)
npm run tauri dev    # launches the desktop app (requires Rust toolchain)
```

## First brain

Choose **New brain** from the opening screen and name the knowledge project.
The setup sheet asks for its working language, AI runtime, and optional
purpose; Eva stores that profile in `EVA.md`, creates a starter brain in
`~/Documents/Eva/Brains`, then opens the graph. Choose Codex or Claude Code;
Eva uses the CLI already signed in on the computer and never stores API keys or
credentials. Eva uses Git only locally to make reviews and undoable history
possible; it needs no GitHub account, remote, or Git identity. Select
**Ingest** to add the first source. Select **Query** to ask the maintained
brain a question; useful answers can be saved as a reviewable analysis page.
Use **Open brain** to choose from Eva's managed brain library. **Import a
brain** copies an external Markdown folder into `~/Documents/Eva/Brains` so it
joins that library without changing the original folder.

## Health Check

**Health** combines deterministic structural linting with an optional,
read-only agent pass. The agent can flag evidence-backed contradictions, weak
provenance, stale claims, coverage gaps, and research questions. It never
edits pages, creates tasks, or commits changes.

## Privacy

Eva keeps every brain on the person's computer by default. It never creates a
Git remote or pushes sources, pages, or history anywhere. Eva copies selected
source files into a brain's `raw/` directory and records them in local history
only. Sharing or backing up a brain is an explicit choice the person makes
outside Eva.

Dev-only hooks (used for automated verification, no effect in production
builds): set `VITE_DEV_VAULT=/abs/path/to/vault` to auto-open a vault on
launch, and `VITE_DEV_SELECT=<page-id>` to auto-select a node. The app then
POSTs a render report to the vite dev server, which prints it to the terminal.
