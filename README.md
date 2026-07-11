# Eva-wiki — LLM Wiki

Eva is a local-first desktop app for building a personal knowledge base with an
LLM. Instead of repeatedly retrieving from raw documents at question time, Eva
helps an agent maintain a durable, linked Markdown wiki between the sources
and the user.

The V1 on-disk and operational contract lives in
[`docs/V1_VAULT_CONTRACT.md`](docs/V1_VAULT_CONTRACT.md). It keeps sources,
wiki pages, agent instructions, and Git history portable across tools.

- `packages/wiki-lib` — pure TypeScript frontmatter/wiki-link parsing, graph
  building, and deterministic structural linting. Includes a 16-page fixture.
- `packages/eva-mcp` — read-only MCP navigation tools for an agent: search,
  page reads, neighbors, and shortest paths.
- `apps/desktop` — Tauri v2 + Vite graph explorer plus a Claude CLI-backed,
  worktree-isolated ingest, cited query, and read-only Health Check flow.
- `schema/` and `templates/vault/` — the generic V1 vault contract and the
  starter infrastructure seeded into an Eva-managed vault.

## Setup

```sh
npm install          # installs workspaces, builds wiki-lib via its prepare script
npm test             # wiki-lib unit tests (vitest)
npm run tauri dev    # launches the desktop app (requires Rust toolchain)
```

## First vault

Choose **New vault** from the opening screen, select a parent folder, and name
the knowledge project. Eva creates a local Git repository, writes the V1
contract and starter wiki, then opens the graph. Select **Ingest** to add the
first source. Select **Query** to ask the maintained wiki a question; useful
answers can be saved as a reviewable analysis page. Use **Open vault** for an
existing Markdown vault.

## Health Check

**Health** combines deterministic structural linting with an optional,
read-only agent pass. The agent can flag evidence-backed contradictions, weak
provenance, stale claims, coverage gaps, and research questions. It never
edits pages, creates tasks, or commits changes.

## Privacy

Eva copies selected source files into a vault's `raw/` directory and commits
them there as source of truth. Use a private Git remote for any vault that
contains personal, proprietary, client, or copyrighted source material.

Dev-only hooks (used for automated verification, no effect in production
builds): set `VITE_DEV_VAULT=/abs/path/to/vault` to auto-open a vault on
launch, and `VITE_DEV_SELECT=<page-id>` to auto-select a node. The app then
POSTs a render report to the vite dev server, which prints it to the terminal.
