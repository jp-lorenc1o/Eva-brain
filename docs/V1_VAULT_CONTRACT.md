# Eva V1 vault contract

Eva is a local-first LLM Wiki: it incrementally turns curated, immutable
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

The app creates missing infrastructure for a Git-root vault:

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

V1 establishes the data contract for querying: agents search the wiki first,
cite supporting pages and raw sources, and may save reusable work as an
`analysis` page. A native query surface and save flow are the next product
slice, not a hidden RAG layer.

### Lint

The deterministic V1 gate reports broken links, non-index orphans, missing
titles, missing types, and summaries with no valid `raw/` source. Agents can
additionally report semantic maintenance suggestions (conflicts, stale claims,
missing concepts), but those are advisory until Eva implements a reviewable
semantic lint result format.

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
