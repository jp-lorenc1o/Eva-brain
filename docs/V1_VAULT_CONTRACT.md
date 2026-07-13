# Eva V1 brain contract

> This operational overview is retained for existing links. The canonical
> format specification is now the [Eva Brain Standard v1](EVA_BRAIN_STANDARD.md).

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
bookkeeping. Local Git history makes each change inspectable and reversible.

## On-disk contract

An Eva vault is its own Git repository. Its canonical layout and page
semantics are defined in [`schema/EVA.md`](../schema/EVA.md). The portable
agent contract is `EVA.md`; `AGENTS.md` and `CLAUDE.md` merely point compatible
agents to it.

The app's **New brain** flow creates a folder in `~/Documents/Eva/Brains`,
initializes a local Git repository on `main`, asks for a Brain Profile,
working language, agent runtime, and an optional purpose, then writes the
selected profile and its maintenance modules into `EVA.md` with the initial
infrastructure. It also writes `eva.json`, the machine-readable Eva Brain
Standard marker, including the selected profile and modules. This local repository does not need a GitHub
account, a remote, or a configured Git identity: Eva supplies command-local
`Eva <eva@local>` metadata for history it creates. Opening an existing Git-root
brain writes only missing infrastructure files:

- `eva.json`, `EVA.md`, `AGENTS.md`, and `CLAUDE.md`
- `index.md` and `log.md`
- an empty `raw/` directory

It never overwrites an existing infrastructure file. All raw sources and wiki
pages remain ordinary local files, so they can be inspected in Obsidian or any
editor without Eva.

The **Open brain** selector lists the accessible brains already in the managed
library. **Import a brain** copies an external folder into that library; a
clean Git brain retains its history, while a plain Markdown folder is
initialized as a new Git brain. Eva never modifies the source folder.

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

The vault format is agent-neutral. The current desktop implementation supports
Codex CLI and Claude Code, with the chosen runtime recorded in the brain's
local `EVA.md` profile. Claude uses Eva's read-only MCP navigation tools;
Codex uses its sandboxed local filesystem tools. Both receive the same brain
path, `EVA.md` contract, and worktree/review guarantees. Future runtimes must
preserve those guarantees and must not change the on-disk format.

Both runtimes are isolated from the person's own agent configuration so that
unrelated global tools, rules, and servers never participate in a private
brain: Codex runs with `--ephemeral --ignore-user-config --ignore-rules`, and
Claude runs with `--strict-mcp-config` (only Eva's MCP server) and an empty
`--setting-sources` (no user, project, or local settings, which also keeps
user-scoped plugins and hooks out). One asymmetry remains: Claude Code always
auto-discovers memory files, so a user-level `~/.claude/CLAUDE.md` is still
read during Claude runs. The only flag that disables memory discovery also
disables the locally signed-in CLI auth Eva depends on, so Eva accepts this
gap and documents it here instead of hiding it.

## Privacy boundary

Eva can commit the selected original documents into `raw/` as local history.
It never creates a remote or pushes a brain. Brains with personal, client,
proprietary, or copyrighted materials therefore remain on the person's device
unless they explicitly choose to copy, back up, or share them. The app
repository itself contains only code and templates.
