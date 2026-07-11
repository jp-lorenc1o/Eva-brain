# Eva V1 brain contract

Eva is a local-first LLM Brain: it incrementally turns curated, immutable
source material into a maintained Markdown knowledge base. This contract is
the stable boundary between the desktop app, an agent runtime, and an Eva
vault.

## Product promise

Eva does not answer from a disposable collection of retrieved chunks. It
maintains a persistent wiki. Each ingest or worthwhile inquiry improves an
artifact that remains useful for future work.

The human curates sources, directs the analysis, and approves sensitive
changes. The agent handles summarization, cross-references, synthesis, and
bookkeeping. Git makes each change inspectable and reversible.

## On-disk contract

An Eva vault is its own Git repository. Its canonical layout and page
semantics are defined in [`schema/EVA.md`](../schema/EVA.md). The portable
agent contract is `EVA.md`; `AGENTS.md` and `CLAUDE.md` merely point compatible
agents to it.

The app's **New brain** flow creates a folder in `~/Documents/Eva/Brains`,
initializes a local Git repository on `main`, asks for the working language,
agent runtime, and an optional purpose, then writes that profile into `EVA.md`
with the initial infrastructure. Opening an existing Git-root brain writes only
missing infrastructure files:

- `EVA.md`, `AGENTS.md`, and `CLAUDE.md`
- `index.md` and `log.md`
- an empty `raw/` directory

It never overwrites an existing infrastructure file. All raw sources and wiki
pages remain ordinary local files, so they can be inspected in Obsidian or any
editor without Eva.

## Required V1 operations

### Ingest

1. The user selects one or more source files.
2. Eva copies them into immutable `raw/` and records that source commit.
3. The selected agent searches and reads the existing wiki in an isolated Git
   worktree, then proposes source-grounded edits.
4. Eva checks for deletions and new structural lint issues.
5. Clean changes merge automatically; risky changes wait for an explicit human
   accept/reject decision. Eva records the outcome in `log.md`.

### Explore

The desktop app reads the Markdown vault, renders a typed link graph, exposes
page details and backlinks, and shows structural lint issues. It treats
`raw/` and infrastructure as non-page files.

### Query

Eva's native Query surface gives the agent read-only wiki navigation tools. It
searches the wiki first, returns an answer with supporting page ids and raw
source paths, and does not modify the vault while answering. **Save as
analysis** creates a proposed `analysis` page, index update, and log entry in
an isolated Git worktree; the user must explicitly review and merge it.

### Lint

The deterministic V1 gate reports broken links, non-index orphans, missing
titles, missing types, and summaries with no valid `raw/` source. Agents can
additionally run Eva's read-only **Health Check**. It returns evidence-backed
advisory findings for contradictions, weak provenance, stale claims, coverage
gaps, and research questions. Health Check never edits, creates a page, or
commits; acting on a finding remains an explicit human-led ingest, query, or
analysis decision.

## Runtime boundary

The vault format and MCP read tools are agent-neutral. The current desktop
implementation provides a Claude CLI adapter as the first ingest runtime.
Future Codex, OpenCode, and other adapters must receive the same vault path,
`EVA.md` contract, read-only navigation tools, and worktree/review guarantees;
they must not change the on-disk format.

## Privacy boundary

Eva can commit the selected original documents into `raw/`. A vault with
personal, client, proprietary, or copyrighted materials should use a private
Git remote. The app repository itself contains only code and templates.
