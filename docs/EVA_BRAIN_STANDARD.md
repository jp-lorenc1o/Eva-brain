# Eva Brain Standard v1

The Eva Brain Standard defines the portable, local-first format that Eva can
open, maintain, and evolve safely. It is the contract between the desktop app,
an AI runtime, and a person's Markdown knowledge base.

This is a format standard, not an online service. A compliant brain is an
ordinary local folder and Git repository. It has no account, remote, or
vendor-hosted database requirement.

## 1. Recognition and compatibility

An Eva brain **MUST** be the root of its own local Git repository and contain
this manifest at its root:

```json
{
  "format": "eva-brain",
  "version": 1,
  "profile": "research",
  "modules": ["thesis", "evidence", "contradictions", "bibliography"]
}
```

- `format` **MUST** be `eva-brain`.
- `version` **MUST** be the positive integer version of this standard.
- `profile`, when present, **MUST** be an Eva-supported starting mode. Eva v1
  supports `personal`, `research`, `reading`, `business`, `planning`, `course`,
  and `blank`.
- `modules`, when present, **MUST** match the selected profile's module set.
- Eva v1 accepts `version: 1` and refuses agent operations for an unknown or
  malformed version. It does this to avoid applying the wrong rules to a
  future format.

The manifest is a machine-readable compatibility marker. It does not contain
credentials, source material, or cloud identifiers. `EVA.md` is the companion
human- and agent-readable operating contract.

Legacy v1 brains may omit `profile` and `modules`; Eva treats them as `blank`
until a person chooses a profile in Brain Manager.

## 2. Canonical layout

Every compliant brain has the following root-level infrastructure. Eva creates
missing required paths without overwriting an existing file.

```text
eva.json             standard marker and version
EVA.md               human and agent operating contract
AGENTS.md            agent-neutral instruction entry point
CLAUDE.md            Claude compatibility entry point
index.md             content catalog and graph home
log.md               append-only operation history
raw/                 immutable original source material
entities/            durable pages for people, organisations, places, things
concepts/            durable pages for ideas, mechanisms, and themes
summaries/           one digest for each source where useful
analyses/            reusable answers, comparisons, and syntheses
```

The four content directories are canonical, but a brain may add a directory
for a domain-specific page type. That extension **MUST** be explained in
`EVA.md` before an agent uses it.

## 3. Content rules

All wiki pages are Markdown outside `raw/` and the infrastructure files.
Every page **MUST** have YAML frontmatter with `title` and `type`. Supported
core types are `entity`, `concept`, `summary`, `analysis`, and `index`.

```markdown
---
title: Compounding
type: concept
updated: 2026-07-11
sources: raw/2015-letter.pdf
---
```

- `summary` pages **MUST** name their exact raw document in `source`.
- Source-derived claims should name their support in `sources`.
- Pages link with `[[wiki-links]]` and must be reachable from `index.md` or
  another linked page.
- `raw/` is immutable to AI agents: they may read it, never edit, move, or
  delete it.
- `log.md` is Eva's append-only operational record, not a normal wiki page.

The detailed page, provenance, linking, and agent rules live in the standard
`EVA.md` that Eva installs in each brain.

## 4. Operations

Eva treats a compliant brain as a maintained artifact, not a disposable search
index:

1. **Ingest** copies a selected source into `raw/`, lets the configured agent
   propose integrated Markdown edits in an isolated worktree, then records the
   outcome locally.
2. **Query** reads the maintained Markdown and returns a cited answer without
   altering the brain. Saving an answer proposes a reusable `analysis` page.
3. **Health** checks structural integrity and can ask the agent for read-only,
   evidence-backed maintenance suggestions.

The app prevents agents from changing `raw/`, `eva.json`, `EVA.md`, agent
instruction files, or `log.md`. Deletions and newly introduced structural
issues require explicit human review before a proposed change merges.

## Brain profiles

A Brain Profile is a maintenance lens, not a separate product or a rigid
folder tree. When a person creates a brain, Eva records the selected profile,
adds one linked starter page, and tells the agent which recurring structures to
maintain. Changing the profile later updates only `eva.json` and `EVA.md`; it
never rewrites sources or existing knowledge pages.

| profile | modules Eva prioritises |
| --- | --- |
| `personal` | goals, observations, journal, timeline |
| `research` | thesis, evidence, contradictions, bibliography |
| `reading` | chapters, characters, threads, themes |
| `business` | projects, decisions, meetings, risks |
| `planning` | objectives, constraints, options, timeline |
| `course` | concepts, materials, practice, revision |
| `blank` | knowledge-base |

Profiles are operational. During **ingest**, Eva gives the selected agent a
profile-specific extraction discipline in addition to the universal source,
provenance, linking, and review rules. During **Health**, Eva asks it to look
for that profile's characteristic maintenance gaps alongside contradictions
and broken provenance. The profile never weakens Eva's safety boundary: raw
sources and the agent contract remain protected, and proposed edits still pass
the normal review gate.

## Profile tools

Eva foregrounds the tools that suit a brain's selected profile, while making
the complete tool library available from every brain. For example, a research
brain can still make flashcards from its evidence pages, and a course brain
can make an evidence map. A tool always searches the brain that is currently
open; its original profile is a useful default, never a restriction.

Tools are read-only: they return a source-cited result and can be saved as a
normal reviewable analysis page. They never alter the brain by themselves.

| profile | available tool | result |
| --- | --- | --- |
| `personal` | Reflection | patterns, movement, and questions to revisit without diagnosis |
| `research` | Evidence map | claims, supporting and challenging evidence, and the next question |
| `reading` | Threads map | characters, events, themes, and unresolved threads within the record |
| `business` | Decision brief | options, owners, risks, assumptions, and unresolved decisions |
| `planning` | Options review | trade-offs measured against objectives and constraints |
| `course` | Flashcards; Practice exam | active-recall cards or a mixed exam with an answer key |
| `blank` | — | use Eva's general Query and saved analyses |

Every tool accepts an optional topic or focus. Flashcards can also request a
number of cards. Practice exams can request topics, 6–12 questions, and one
of `mixed`, `multiple-choice`, `written`, or `short-answer`; Eva keeps those
choices in the generation instruction and states when the brain lacks enough
evidence to fulfill them.

## 5. Creating, importing, and upgrading

**New brain** creates a fully compliant v1 brain in `~/Documents/Eva/Brains`.
It asks for a Brain Profile, working language, AI runtime, and starting focus.

**Import a brain** copies the selected folder into that library first, leaving
the original untouched. Eva then initializes local Git if necessary and adds
only missing standard infrastructure, including `eva.json`. A folder that
already declares an invalid or unsupported Eva standard is rejected instead
of being silently rewritten.

Brains made by an earlier Eva release may not yet have `eva.json`. Eva treats
an existing Git-root brain with `EVA.md` as a legacy v1 brain and adds the
missing marker the next time it is opened. This upgrade does not overwrite its
pages, sources, profile, or existing infrastructure.

## 6. Portability and privacy

The brain remains a readable Markdown directory. It can be inspected with
Obsidian, a text editor, Git, or another compatible agent without signing in
anywhere. Git is used locally for review and history only: Eva never creates a
remote or pushes a brain by itself.
