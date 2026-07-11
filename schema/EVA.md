# Eva Brain Standard v1 — vault schema

This document is the source of truth for an Eva vault. Humans and agents
maintain the vault together; agents must read this file before making a
change. The purpose of the vault is to turn immutable source material into a
durable, interlinked body of knowledge — not to act as a chat transcript or a
temporary retrieval index.

## The three layers

- `raw/` contains the original source documents. It is immutable: agents may
  read it but must never edit, move, or delete anything in it.
- The wiki is the generated Markdown outside `raw/`. Agents create and update
  this layer as new sources and questions add knowledge.
- This schema defines the operating rules. `eva.json`, `EVA.md`, `AGENTS.md`,
  `CLAUDE.md`, and `log.md` are infrastructure, not wiki pages.

## Standard layout

```text
eva.json             machine-readable Eva Brain Standard version marker
raw/                 original source documents
entities/            durable pages about people, organizations, places, things
concepts/            durable pages about ideas, mechanisms, themes
summaries/           one source digest per raw document
analyses/            saved comparisons, syntheses, and useful query answers
index.md             content-oriented catalog and starting point
log.md               append-only operational history
EVA.md               this contract
AGENTS.md            agent-neutral instruction entry point
CLAUDE.md            Claude compatibility entry point
```

Use lowercase kebab-case filenames. A page lives in the directory that matches
its type. `index.md` stays at the vault root. A domain may extend this layout,
but the extension and its purpose must be recorded in this file before agents
use it.

## Page types

| type | purpose | directory |
| --- | --- | --- |
| `entity` | A distinct person, organization, place, project, or thing. | `entities/` |
| `concept` | An idea, mechanism, topic, or recurring theme. | `concepts/` |
| `summary` | A digest of exactly one source document. | `summaries/` |
| `analysis` | A synthesis, comparison, answer, or other reusable derived work. | `analyses/` |
| `index` | A hub page that helps people and agents navigate the vault. | vault root |
| `log` | Reserved for the operation log; never use it for a normal page. | vault root |

Choose the smallest durable subject that other pages could plausibly link to.
Do not create a new page for a fact that belongs on an existing page. Search
first, then merge rather than duplicate.

## Frontmatter and provenance

Every wiki page requires a title and type:

```markdown
---
title: Example concept
type: concept
updated: 2026-07-11
---
```

`updated` is strongly recommended after a substantive change. Optional fields:

- `aliases`: comma-separated alternate names for link resolution and search.
- `source`: the exact `raw/` path summarized by a `summary` page. This is
  required for every `summary`.
- `sources`: comma-separated `raw/` paths or summary page ids supporting an
  entity, concept, or analysis. Use it whenever a page contains source-derived
  claims.

## Vault profile

New vaults record their working language, selected agent runtime, and optional
purpose at the end of this document. Treat that profile as an instruction:
write pages in the working language unless the human asks otherwise, and use
the stated purpose to calibrate what is worth preserving. Humans can edit the
profile as their project evolves.

Keep provenance close to knowledge. A summary must identify its raw document;
an analysis must identify the pages or sources it synthesizes. Never claim a
source says something it does not say, and mark unresolved conflicts instead
of silently choosing a side.

## Linking and index rules

- Use `[[wiki-links]]`; a target is a filename stem, vault-relative page id,
  or page title.
- Only link to pages that already exist or are created in the same change.
- Every non-index page must have an inbound link. Add new durable pages to
  `index.md` or link them from an existing reachable page.
- Keep `index.md` content-oriented: group links by type or topic and include a
  short description. Update it whenever the vault gains a durable page.

## Operations

**Ingest:** read a source in `raw/`, search the existing wiki, create or update
the necessary pages, preserve provenance, update the index, and let Eva append
the operation log entry. Do not edit source files or infrastructure files.

**Query:** search and read the wiki before answering. Cite the supporting page
ids and source paths. Save an answer as an `analysis` page only when it will be
useful later; otherwise leave the wiki unchanged.

**Lint:** check broken links, orphan pages, missing frontmatter, summaries
without a source, stale or conflicting claims, missing links, and important
concepts that lack durable pages. Structural issues are release blockers;
semantic suggestions should be reported for human review.

## Safety and versioning

`eva.json` identifies this folder as an Eva brain and declares the supported
standard version. It is managed by Eva and must not be edited by an agent. The
vault is a local Git repository. Eva performs agent work in an isolated
worktree and records every ingest in `log.md`. New lint issues and deletions
require human review before merging. Eva never creates a remote or pushes this
brain; it stays on the person's device unless they explicitly choose to share
or back it up.
