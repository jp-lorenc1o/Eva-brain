# EVA vault schema

This vault is maintained by both humans and agents. Every change must follow
this schema. Read this whole file before writing anything.

## Page types

Every page declares a `type` in frontmatter. Exactly one of:

| type      | what it is                                                            | lives in      |
|-----------|-----------------------------------------------------------------------|---------------|
| `entity`  | a distinct person, organization, place, or thing (Warren Buffett)     | `entities/`   |
| `concept` | an idea, mechanism, or recurring theme (float, moat, mark-to-market)  | `concepts/`   |
| `summary` | a digest of one source document (one shareholder letter, one paper)   | `summaries/`  |
| `index`   | a hub page whose job is linking other pages                           | vault root    |
| `log`     | reserved for the operation log; agents never create pages of this type | —            |

## Directory conventions

- `entities/`, `concepts/`, `summaries/` as above; `index.md` at the vault root.
- Filenames: lowercase kebab-case of the title (`warren-buffett.md`).
- `raw/` holds source documents. Never edit, move, or delete anything in it.
- `EVA.md`, `CLAUDE.md`, and `log.md` are infrastructure, not wiki pages.
  Never edit them.

## Frontmatter

Required on every page:

```markdown
---
title: Warren Buffett
type: entity
---
```

Optional: `aliases` (comma-separated alternate names), `source` (the raw/
document that introduced the page), `updated` (ISO date of last substantive
edit).

## New page vs. edit in place — the core heuristic

**Create a new page** only when the subject is a distinct entity or concept
that other pages would plausibly link to on its own: a person, a company, a
named mechanism, a recurring theme.

**Edit an existing page** when the information is an attribute of, or an
update to, something that already has a page: a year's results belong on the
company's page (or that year's summary), not on a new page; a refinement of a
concept belongs on the concept's page.

**MERGE, never duplicate.** Before creating any page, search for existing
pages covering the same subject (including aliases: "Buffett" and "Warren E.
Buffett" are one page). If one exists, merge the new information into it —
integrate, reconcile, and where facts change over time, keep the page current
and note the evolution with dates. A vault with two pages about the same thing
is worse than a vault missing a page.

## Linking

- Connect pages with `[[wiki-links]]` (double brackets, target = filename stem
  or title).
- Every new page must be reachable: link it from `index.md` or from another
  page that is. Orphan pages are lint errors.
- Only link targets that exist or that you are creating in the same change.
  Broken links are lint errors.

## Writing style

Concise and declarative. Pages state what is known, with enough context to
stand alone. Update in place: when a fact changes across sources, revise the
statement and date the change rather than appending contradictions.
