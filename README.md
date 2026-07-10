# eva-wiki

Desktop app for exploring a markdown wiki vault as an interactive graph.

- `packages/wiki-lib` — pure TypeScript library: frontmatter/wiki-link parsing,
  graph building, and vault linting (orphans, broken links, missing metadata).
  Includes `test-vault/`, a 16-page fixture vault.
- `apps/desktop` — Tauri v2 + Vite app. "Open vault" picks a folder, the graph
  renders every page as a node colored by frontmatter `type`, and clicking a
  node shows its body and lint issues in the sidebar.

## Setup

```sh
npm install          # installs workspaces, builds wiki-lib via its prepare script
npm test             # wiki-lib unit tests (vitest)
npm run tauri dev    # launches the desktop app (requires Rust toolchain)
```

Dev-only hooks (used for automated verification, no effect in production
builds): set `VITE_DEV_VAULT=/abs/path/to/vault` to auto-open a vault on
launch, and `VITE_DEV_SELECT=<page-id>` to auto-select a node. The app then
POSTs a render report to the vite dev server, which prints it to the terminal.
