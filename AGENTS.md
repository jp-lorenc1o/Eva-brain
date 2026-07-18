# Project constraints

Eva V1 intentionally targets macOS only. Do not assume Windows or Linux
compatibility, or "fix" macOS-specific code such as the `iconutil`/`.iconset`
icon pipeline, `.DS_Store` handling, or the `$HOME` filesystem scope, unless a
cross-platform change is explicitly requested: none has been verified outside
macOS.

Eva V1 ships unsigned and unnotarized on purpose. Apple's Developer Program
costs $99/year, which is not justified for a personal project at this stage;
the documented `xattr -cr` workaround in the README and release notes is the
accepted trade-off. Do not treat code signing as an obvious pending task or
add signing/notarization steps to the release workflow unless the decision is
explicitly revisited.

# Agent runtimes

Eva supports three agent runtimes, all recorded in a brain's `EVA.md` and
dispatched from `apps/desktop/src-tauri/src/ingest.rs` (`drive_agent` and the
`drive_{claude,codex,opencode}_*` functions). Every one of them runs its work
in an isolated Git worktree and lands the result through the single shared
`gate_agent_changes` review gate — do not add a second, weaker review path for
any runtime.

- **Codex** and **Claude Code** drive the paid cloud CLIs already signed in on
  the machine.
- **OpenCode (local)** is the zero-setup, account-free path: it drives a bundled
  Ollama model entirely on the person's Mac. Setup (installing Ollama, pulling
  the model, deriving a larger-context variant, installing OpenCode) is handled
  by `opencode_setup`, run once from the UI with progress.

The local model is `qwen3.5:4b`, chosen after testing candidate small models in
Eva's real MCP harness for tool-calling *task correctness* (does it call
`eva_search`/`read_page`/`neighbors` with sensible arguments and write a valid
page into the worktree), not just benchmark scores. A key constraint: the model
runs through a **derived Modelfile with `num_ctx` 32768** (`eva-qwen3.5:4b`) —
at the stock context the tool definitions are truncated and tool calling breaks
entirely. Do not "simplify" this to the base model; the derived larger-context
model is load-bearing. When revisiting the model choice, re-run the real
harness rather than swapping on benchmark reputation alone.

Do not oversell the local runtime as equal to the cloud options. It is free and
private but slower and less capable; the README states this trade-off honestly
and it should stay that way.

**Ollama version compatibility is enforced in code, not assumed.** Ollama
auto-updates on user machines and has broken this adapter across a single
minor release before: 0.32 removed `ollama create -f -` (Modelfile via stdin)
and changed `/v1/chat/completions` to stream a thinking model's output into a
separate `reasoning` field with `content` empty, which OpenCode reads as an
empty run (hence the pinned `reasoningEffort: "none"` in the generated
provider config). The constants `OLLAMA_MIN_SUPPORTED` and
`OLLAMA_VERIFIED_MIN`/`OLLAMA_VERIFIED_MAX_EXCLUSIVE` in `ingest.rs` encode
the policy: refuse below the minimum with an actionable message, warn during
setup outside the verified range, never hard-block a newer version (an
auto-updated Ollama must not brick the feature). When a new Ollama minor is
verified end-to-end — real setup plus a gated ingest in the running app, not
just unit tests — bump the verified range and note the tested version in the
README.
