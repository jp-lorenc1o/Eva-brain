# Eva — LLM Brain

Eva is a local-first desktop app for building a personal knowledge base with an
LLM. Instead of repeatedly retrieving from raw documents at question time, Eva
helps an agent maintain a durable, linked Markdown brain between the sources
and the user.

The versioned on-disk and operational contract is the
[`Eva Brain Standard v1`](docs/EVA_BRAIN_STANDARD.md). Its `eva.json` marker
lets Eva identify a compatible brain before it applies agent workflows, while
keeping sources, wiki pages, instructions, and local history portable across
tools.

- `packages/wiki-lib` — pure TypeScript frontmatter/wiki-link parsing, graph
  building, and deterministic structural linting. Includes a 16-page fixture.
- `packages/eva-mcp` — read-only MCP navigation tools for an agent: search,
  page reads, neighbors, and shortest paths.
- `apps/desktop` — Tauri v2 + Vite graph explorer plus Codex CLI and Claude
  Code adapters for worktree-isolated ingest, cited query, and read-only
  Health Check.
- `schema/` and `templates/vault/` — the Eva Brain Standard v1 marker,
  operating contract, and starter infrastructure seeded into an Eva-managed
  brain.

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

Use **Manage brains** to see each local folder and update its working language,
AI runtime, or purpose. Eva records a profile change in that brain's local Git
history; it does not create an account, remote, or cloud copy.

## Interface language

Eva can follow the system language or use a locally saved app-language choice:
English, Español, Português, Français, Deutsch, Italiano, 日本語, 한국어,
中文（简体）, and 中文（繁體）. This changes Eva's interface only; each brain keeps
its own independent working language.

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
