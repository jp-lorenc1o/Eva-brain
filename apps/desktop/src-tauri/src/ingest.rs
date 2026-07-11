// Ingest orchestration: job queue, git branch/worktree management, the
// headless agent subprocess, and the lint gate. The webview only invokes the
// commands at the bottom and renders the events this module emits.
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const EVA_MD: &str = include_str!("../../../../schema/EVA.md");
const AGENTS_MD: &str = include_str!("../../../../schema/AGENTS.md");
const CLAUDE_MD: &str = include_str!("../../../../schema/CLAUDE.md");
const INDEX_MD: &str = include_str!("../../../../templates/vault/index.md");
const LOG_MD: &str = include_str!("../../../../templates/vault/log.md");

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: u64,
    pub vault: String,
    pub source: String,
    pub source_name: String,
    pub status: String, // queued | running | merged | held | rejected | failed
}

pub struct Held {
    pub job_id: u64,
    pub vault: PathBuf,
    pub source_name: String,
    pub branch: String,
    pub worktree: PathBuf,
    pub summary: String,
}

#[derive(Default)]
pub struct IngestState {
    pub queue: VecDeque<Job>,
    pub done: Vec<Job>,
    pub current: Option<Job>,
    pub held: Vec<Held>,
    pub next_id: u64,
    pub worker_running: bool,
}

pub type SharedState = Mutex<IngestState>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryCitation {
    pub page: String,
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryAnswer {
    pub answer: String,
    #[serde(default)]
    pub citations: Vec<QueryCitation>,
}

pub struct QueryHeld {
    pub review_id: u64,
    pub vault: PathBuf,
    pub question: String,
    pub branch: String,
    pub worktree: PathBuf,
}

#[derive(Default)]
pub struct QueryState {
    pub held: Option<QueryHeld>,
    pub next_review_id: u64,
    pub saving: bool,
}

pub type SharedQueryState = Mutex<QueryState>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryReview {
    pub review_id: u64,
    pub question: String,
    pub patch: String,
    pub new_issues: Vec<String>,
    pub deletions: Vec<String>,
}

enum RunOutcome {
    Merged {
        summary: String,
        pages: usize,
    },
    Held {
        branch: String,
        worktree: PathBuf,
        patch: String,
        new_issues: Vec<String>,
        deletions: Vec<String>,
        summary: String,
    },
}

fn emit_state(app: &AppHandle, st: &IngestState) {
    let _ = app.emit(
        "ingest:state",
        serde_json::json!({
            "current": st.current,
            "queue": st.queue.iter().collect::<Vec<_>>(),
            "done": st.done.iter().collect::<Vec<_>>(),
        }),
    );
}

fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git {args:?}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(format!(
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// The vault must be the ROOT of its own git repository — this is what keeps
/// ingest from ever branching a repo the vault merely lives inside (e.g. the
/// eva-wiki repo containing test-vault).
fn require_vault_repo(vault: &Path) -> Result<PathBuf, String> {
    let root = vault
        .canonicalize()
        .map_err(|e| format!("vault path: {e}"))?;
    let top = git(&root, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "this vault is not a git repository — run `git init` in it first".to_string())?;
    let top = PathBuf::from(top.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if top != root {
        return Err(
            "this vault is inside another git repository — ingest requires the vault to be its own git root".into(),
        );
    }
    Ok(root)
}

fn vault_dir_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("enter a vault name".into());
    }
    if name.len() > 80 {
        return Err("vault names must be 80 characters or fewer".into());
    }
    if matches!(name, "." | "..")
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return Err("use a single folder name, without slashes".into());
    }
    Ok(name)
}

/// Write only missing Eva infrastructure, then commit exactly those files.
/// Keeping this separate from the Tauri command lets both a newly-created
/// vault and a pre-existing Git-root vault receive the same V1 baseline.
fn bootstrap_vault(root: &Path) -> Result<bool, String> {
    let mut staged: Vec<&str> = vec!["add"];
    if !root.join("EVA.md").exists() {
        fs::write(root.join("EVA.md"), EVA_MD).map_err(|e| e.to_string())?;
        staged.push("EVA.md");
    }
    if !root.join("AGENTS.md").exists() {
        fs::write(root.join("AGENTS.md"), AGENTS_MD).map_err(|e| e.to_string())?;
        staged.push("AGENTS.md");
    }
    if !root.join("CLAUDE.md").exists() {
        fs::write(root.join("CLAUDE.md"), CLAUDE_MD).map_err(|e| e.to_string())?;
        staged.push("CLAUDE.md");
    }
    if !root.join("index.md").exists() {
        fs::write(root.join("index.md"), INDEX_MD).map_err(|e| e.to_string())?;
        staged.push("index.md");
    }
    if !root.join("log.md").exists() {
        fs::write(root.join("log.md"), LOG_MD).map_err(|e| e.to_string())?;
        staged.push("log.md");
    }
    fs::create_dir_all(root.join("raw")).map_err(|e| e.to_string())?;
    if staged.len() == 1 {
        return Ok(false);
    }
    git(root, &staged)?;
    git(root, &["commit", "-m", "schema: bootstrap Eva vault"])?;
    Ok(true)
}

fn create_vault(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let name = vault_dir_name(name)?;
    let parent = parent
        .canonicalize()
        .map_err(|e| format!("vault location: {e}"))?;
    if !parent.is_dir() {
        return Err("choose an existing folder for the new vault".into());
    }
    let root = parent.join(name);
    if root.exists() {
        return Err(format!("a folder named \"{name}\" already exists there"));
    }
    fs::create_dir(&root).map_err(|e| format!("create vault folder: {e}"))?;

    match Command::new("git")
        .args(["init", "-b", "main"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("start Git repository: {e}"))
    {
        Ok(out) if out.status.success() => {}
        Ok(out) => {
            let _ = fs::remove_dir_all(&root);
            return Err(format!(
                "start Git repository: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&root);
            return Err(error);
        }
    }

    if let Err(error) = bootstrap_vault(&root) {
        // `root` was created by this command, so cleanup cannot touch an
        // existing vault if Git or the initial commit is unavailable.
        let _ = fs::remove_dir_all(&root);
        return Err(format!("bootstrap new vault: {error}"));
    }
    Ok(root)
}

fn tools_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("EVA_TOOLS_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    cwd.join("../../../packages/eva-mcp")
        .canonicalize()
        .map_err(|_| format!("cannot locate packages/eva-mcp from {} (set EVA_TOOLS_DIR)", cwd.display()))
}

fn lint(dir: &Path) -> Result<(usize, Vec<String>), String> {
    let cli = tools_dir()?.join("lint-cli.mjs");
    let out = Command::new("node")
        .arg(&cli)
        .arg(dir)
        .output()
        .map_err(|e| format!("node lint-cli: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "lint failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let v: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("lint output: {e}"))?;
    let pages = v["pages"].as_u64().unwrap_or(0) as usize;
    let issues = v["issues"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|i| {
                    format!(
                        "{}: {} — {}",
                        i["rule"].as_str().unwrap_or(""),
                        i["page"].as_str().unwrap_or(""),
                        i["message"].as_str().unwrap_or("")
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    Ok((pages, issues))
}

fn today() -> String {
    Command::new("date")
        .arg("+%F")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "undated".into())
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").chars().take(72).collect()
}

fn append_log(dir: &Path, operation: &str, subject: &str, body: &str) -> Result<(), String> {
    let log_path = dir.join("log.md");
    let mut log = fs::read_to_string(&log_path).unwrap_or_else(|_| "# Log\n".to_string());
    log.push_str(&format!(
        "\n## [{}] {} | {}\n{}\n",
        today(),
        operation,
        subject,
        body.trim()
    ));
    fs::write(&log_path, log).map_err(|e| e.to_string())
}

fn slugify(value: &str, fallback: &str) -> String {
    let slug: String = value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        fallback.into()
    } else {
        slug.chars().take(52).collect()
    }
}

fn one_line(value: &str, max: usize) -> String {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let value: String = value.chars().take(max).collect();
    if value.is_empty() {
        "Untitled analysis".into()
    } else {
        value
    }
}

fn cleanup(vault: &Path, branch: &str, worktree: &Path) {
    if let Some(wt) = worktree.to_str() {
        let _ = git(vault, &["worktree", "remove", "--force", wt]);
    }
    let _ = git(vault, &["branch", "-D", branch]);
}

fn drive_agent(app: &AppHandle, job: &Job, worktree: &Path) -> Result<String, String> {
    let server = tools_dir()?.join("server.mjs");
    let cfg = serde_json::json!({
        "mcpServers": {
            "eva": {
                "command": "node",
                "args": [server.to_string_lossy()],
                "env": { "EVA_VAULT": worktree.to_string_lossy() }
            }
        }
    });
    let cfg_path = std::env::temp_dir().join(format!("eva-mcp-{}.json", job.id));
    fs::write(&cfg_path, cfg.to_string()).map_err(|e| e.to_string())?;

    let prompt = format!(
        r#"You are ingesting a source document into an Eva wiki vault (your current directory).

1. Read EVA.md at the vault root first — it defines page types, provenance, directories, linking, and the merge-over-duplicate policy. Follow it exactly.
2. Read the source document at raw/{source}.
3. Before creating any page, use the eva MCP tools (search, read_page, neighbors) to find existing pages about the same entities and concepts. Prefer merging new information into existing pages; create a new page only for a distinct entity or concept worth linking to from elsewhere.
4. Write the knowledge from the source into the wiki: create or update pages with [[wiki-links]], required frontmatter (title, type), source provenance, and keep every page reachable from index.md. Summaries must name their raw source. Never duplicate an existing page.
5. Do not modify raw/, EVA.md, AGENTS.md, CLAUDE.md, or log.md. Do not use git.

When you are done, reply with a one-paragraph summary of what you created and updated."#,
        source = job.source_name
    );

    let mut child = Command::new("claude")
        .args([
            "-p",
            &prompt,
            "--output-format",
            "stream-json",
            "--verbose",
            "--mcp-config",
            &cfg_path.to_string_lossy(),
            "--allowedTools",
            "Read,Glob,Grep,LS,Write,Edit,MultiEdit,mcp__eva__search,mcp__eva__neighbors,mcp__eva__shortest_path,mcp__eva__read_page",
            "--max-turns",
            "120",
        ])
        .current_dir(worktree)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start claude: {e}"))?;

    // Drain stderr on a side thread so a full pipe can't deadlock the agent.
    let mut stderr = child.stderr.take().unwrap();
    let stderr_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    let stdout = child.stdout.take().unwrap();
    let wt_prefix = worktree.to_string_lossy().to_string();
    let mut summary = String::new();
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|e| e.to_string())?;
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        match v["type"].as_str() {
            Some("assistant") => {
                let Some(content) = v["message"]["content"].as_array() else {
                    continue;
                };
                for item in content {
                    match item["type"].as_str() {
                        Some("tool_use") => {
                            let name = item["name"].as_str().unwrap_or("");
                            if matches!(name, "Write" | "Edit" | "MultiEdit") {
                                if let Some(fp) = item["input"]["file_path"].as_str() {
                                    let rel = fp
                                        .strip_prefix(&wt_prefix)
                                        .unwrap_or(fp)
                                        .trim_start_matches('/');
                                    let _ = app.emit(
                                        "ingest:activity",
                                        serde_json::json!({"jobId": job.id, "kind": "file", "value": rel}),
                                    );
                                }
                            } else {
                                let _ = app.emit(
                                    "ingest:activity",
                                    serde_json::json!({"jobId": job.id, "kind": "tool", "value": name}),
                                );
                            }
                        }
                        Some("text") => {
                            if let Some(t) = item["text"].as_str() {
                                let snip: String = t.chars().take(200).collect();
                                let _ = app.emit(
                                    "ingest:activity",
                                    serde_json::json!({"jobId": job.id, "kind": "text", "value": snip}),
                                );
                            }
                        }
                        _ => {}
                    }
                }
            }
            Some("result") => {
                summary = v["result"].as_str().unwrap_or("").to_string();
            }
            _ => {}
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr_text = stderr_thread.join().unwrap_or_default();
    let _ = fs::remove_file(&cfg_path);
    if !status.success() {
        return Err(format!(
            "agent exited with {status}: {}",
            first_line(&stderr_text)
        ));
    }
    if summary.is_empty() {
        summary = "(agent produced no summary)".into();
    }
    Ok(summary)
}

/// Queries use the same local MCP navigation surface as ingest, but the
/// subprocess is deliberately denied every write tool. The agent returns a
/// compact JSON answer so the desktop app can render evidence separately from
/// the prose and only create an analysis after an explicit user action.
fn drive_query_agent(vault: &Path, question: &str) -> Result<QueryAnswer, String> {
    let server = tools_dir()?.join("server.mjs");
    let cfg = serde_json::json!({
        "mcpServers": {
            "eva": {
                "command": "node",
                "args": [server.to_string_lossy()],
                "env": { "EVA_VAULT": vault.to_string_lossy() }
            }
        }
    });
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let cfg_path = std::env::temp_dir().join(format!("eva-query-{}-{nonce}.json", std::process::id()));
    fs::write(&cfg_path, cfg.to_string()).map_err(|e| e.to_string())?;

    let result = (|| -> Result<QueryAnswer, String> {
        let prompt = format!(
            r#"You are answering a question from an Eva LLM Wiki. The wiki is a persistent, curated knowledge artifact; answer from it rather than from general knowledge.

1. Read EVA.md at the vault root and use the eva MCP tools to search, then read the pages relevant to the question.
2. Use only evidence present in the vault. If the vault does not support an answer, say what is missing instead of guessing.
3. Do not modify any file and do not use git.
4. Return only valid JSON, with no Markdown fence or surrounding commentary, in this exact shape:
{{"answer":"concise Markdown answer","citations":[{{"page":"vault-relative page id","sources":["raw/source-file.ext"]}}]}}
5. Cite every page that materially supports the answer. Use exact page ids. For each citation, include the raw source paths named by that page when available. An answer with no supporting vault evidence must return an empty citations array.

Question: {question}"#
        );

        let mut child = Command::new("claude")
            .args([
                "-p",
                &prompt,
                "--output-format",
                "stream-json",
                "--verbose",
                "--mcp-config",
                &cfg_path.to_string_lossy(),
                "--allowedTools",
                "Read,Glob,Grep,LS,mcp__eva__search,mcp__eva__neighbors,mcp__eva__shortest_path,mcp__eva__read_page",
                "--max-turns",
                "40",
            ])
            .current_dir(vault)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to start claude: {e}"))?;

        let mut stderr = child.stderr.take().unwrap();
        let stderr_thread = std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = stderr.read_to_string(&mut buf);
            buf
        });

        let stdout = child.stdout.take().unwrap();
        let mut result_text = String::new();
        for line in BufReader::new(stdout).lines() {
            let line = line.map_err(|e| e.to_string())?;
            let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            if event["type"].as_str() == Some("result") {
                result_text = event["result"].as_str().unwrap_or("").to_string();
            }
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        let stderr_text = stderr_thread.join().unwrap_or_default();
        if !status.success() {
            return Err(format!(
                "agent exited with {status}: {}",
                first_line(&stderr_text)
            ));
        }
        if result_text.trim().is_empty() {
            return Err("agent returned no answer".into());
        }
        let answer: QueryAnswer = serde_json::from_str(result_text.trim())
            .map_err(|_| "agent returned an invalid cited answer; try again".to_string())?;
        if answer.answer.trim().is_empty() {
            return Err("agent returned an empty answer".into());
        }
        Ok(answer)
    })();
    let _ = fs::remove_file(&cfg_path);
    result
}

fn run_job(app: &AppHandle, job: &Job) -> Result<RunOutcome, String> {
    let vault = PathBuf::from(&job.vault);
    // Capture the exact commit the worktree starts from. A vault is not
    // required to name its default branch `main`; comparison against this
    // commit makes the review gate portable to any Git branch convention.
    let base_commit = git(&vault, &["rev-parse", "HEAD"])?;
    let base_commit = base_commit.trim().to_string();
    let slug: String = job
        .source_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = format!("{}-{}", slug.trim_matches('-'), job.id);
    let branch = format!("ingest/{slug}");
    let worktree = std::env::temp_dir().join("eva-worktrees").join(&slug);
    fs::create_dir_all(worktree.parent().unwrap()).map_err(|e| e.to_string())?;

    let (_, pre_issues) = lint(&vault)?;
    git(&vault, &["branch", &branch])?;
    git(
        &vault,
        &["worktree", "add", &worktree.to_string_lossy(), &branch],
    )?;

    let summary = match drive_agent(app, job, &worktree) {
        Ok(s) => s,
        Err(e) => {
            cleanup(&vault, &branch, &worktree);
            return Err(e);
        }
    };

    if git(&worktree, &["status", "--porcelain"])?.trim().is_empty() {
        cleanup(&vault, &branch, &worktree);
        return Err("agent made no changes to the vault".into());
    }
    git(&worktree, &["add", "-A"])?;
    git(
        &worktree,
        &["commit", "-m", &format!("agent: ingest {}", job.source_name)],
    )?;
    append_log(&worktree, "ingest", &job.source_name, &summary)?;
    git(&worktree, &["add", "log.md"])?;
    git(
        &worktree,
        &["commit", "-m", &format!("log: ingest {}", job.source_name)],
    )?;

    // The gate: any deletion, or any new lint issue, holds the branch for
    // human review. Deletions are never auto-merged under any circumstance.
    let name_status = git(&vault, &["diff", "--name-status", &base_commit, &branch])?;
    let deletions: Vec<String> = name_status
        .lines()
        .filter(|l| l.starts_with('D'))
        .map(|l| l.split_whitespace().nth(1).unwrap_or("").to_string())
        .collect();
    let (_, post_issues) = lint(&worktree)?;
    let new_issues: Vec<String> = post_issues
        .iter()
        .filter(|i| !pre_issues.contains(i))
        .cloned()
        .collect();

    if deletions.is_empty() && new_issues.is_empty() {
        git(
            &vault,
            &[
                "merge",
                "--no-ff",
                &branch,
                "-m",
                &format!("ingest: {} — {}", job.source_name, first_line(&summary)),
            ],
        )?;
        let (pages, _) = lint(&vault)?;
        cleanup(&vault, &branch, &worktree);
        Ok(RunOutcome::Merged { summary, pages })
    } else {
        let patch = git(&vault, &["diff", &base_commit, &branch])?;
        Ok(RunOutcome::Held {
            branch,
            worktree,
            patch,
            new_issues,
            deletions,
            summary,
        })
    }
}

fn query_text(question: &str) -> Result<&str, String> {
    let question = question.trim();
    if question.is_empty() {
        return Err("enter a question for this vault".into());
    }
    if question.chars().count() > 4_000 {
        return Err("questions must be 4,000 characters or fewer".into());
    }
    Ok(question)
}

fn safe_reference(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().any(char::is_control)
        || value.contains(['[', ']', '|'])
    {
        None
    } else {
        Some(value.into())
    }
}

fn analysis_title(question: &str) -> String {
    let subject = one_line(question, 72);
    let subject: String = subject
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | '|'))
        .collect();
    format!("Analysis — {subject}")
}

fn next_analysis_path(dir: &Path, question: &str) -> Result<(String, PathBuf), String> {
    let analyses = dir.join("analyses");
    fs::create_dir_all(&analyses).map_err(|e| format!("create analyses directory: {e}"))?;
    let base = format!("{}-{}", today(), slugify(question, "analysis"));
    for sequence in 1..10_000 {
        let stem = if sequence == 1 {
            base.clone()
        } else {
            format!("{base}-{sequence}")
        };
        let path = analyses.join(format!("{stem}.md"));
        if !path.exists() {
            return Ok((format!("analyses/{stem}"), path));
        }
    }
    Err("could not find an available analysis filename".into())
}

fn append_analysis_to_index(dir: &Path, page_id: &str, title: &str, question: &str) -> Result<(), String> {
    let path = dir.join("index.md");
    let mut index = fs::read_to_string(&path).map_err(|e| format!("read index.md: {e}"))?;
    let item = format!("- [[{page_id}|{title}]] — saved answer: {}\n", one_line(question, 104));
    if let Some(at) = index.find("## Analyses") {
        let after_heading = index[at..]
            .find('\n')
            .map(|offset| at + offset + 1)
            .unwrap_or(index.len());
        index.insert_str(after_heading, &item);
    } else {
        if !index.ends_with('\n') {
            index.push('\n');
        }
        index.push_str("\n## Analyses\n");
        index.push_str(&item);
    }
    fs::write(&path, index).map_err(|e| format!("write index.md: {e}"))
}

fn analysis_markdown(question: &str, answer: &QueryAnswer, title: &str) -> String {
    let refs: Vec<String> = answer
        .citations
        .iter()
        .flat_map(|citation| {
            let raw: Vec<String> = citation
                .sources
                .iter()
                .filter_map(|source| safe_reference(source))
                .filter(|source| source.starts_with("raw/"))
                .collect();
            if raw.is_empty() && citation.page.starts_with("summaries/") {
                safe_reference(&citation.page).into_iter().collect()
            } else {
                raw
            }
        })
        .collect();
    let sources = if refs.is_empty() {
        String::new()
    } else {
        format!("sources: {}\n", refs.join(", "))
    };
    let evidence = if answer.citations.is_empty() {
        "- No supporting wiki page was returned for this answer.\n".to_string()
    } else {
        answer
            .citations
            .iter()
            .filter_map(|citation| {
                let page = safe_reference(&citation.page)?;
                let raw: Vec<String> = citation
                    .sources
                    .iter()
                    .filter_map(|source| safe_reference(source))
                    .map(|source| format!("`{source}`"))
                    .collect();
                let suffix = if raw.is_empty() {
                    String::new()
                } else {
                    format!(" — {}", raw.join(", "))
                };
                Some(format!("- [[{page}]]{suffix}\n"))
            })
            .collect()
    };
    format!(
        "---\ntitle: {title}\ntype: analysis\nupdated: {}\n{sources}---\n\n# {title}\n\n## Question\n\n{question}\n\n## Answer\n\n{}\n\n## Evidence\n\n{evidence}",
        today(),
        answer.answer.trim(),
    )
}

fn prepare_query_review(
    vault: &Path,
    review_id: u64,
    question: &str,
    answer: &QueryAnswer,
) -> Result<(QueryHeld, QueryReview), String> {
    let base_commit = git(vault, &["rev-parse", "HEAD"])?;
    let base_commit = base_commit.trim().to_string();
    let slug = format!("{}-{review_id}", slugify(question, "analysis"));
    let branch = format!("query/{slug}");
    let worktree = std::env::temp_dir().join("eva-worktrees").join(&slug);
    fs::create_dir_all(worktree.parent().unwrap()).map_err(|e| e.to_string())?;
    let (_, pre_issues) = lint(vault)?;
    git(vault, &["branch", &branch])?;
    if let Err(error) = git(
        vault,
        &["worktree", "add", &worktree.to_string_lossy(), &branch],
    ) {
        let _ = git(vault, &["branch", "-D", &branch]);
        return Err(error);
    }

    let prepared = (|| -> Result<QueryReview, String> {
        let title = analysis_title(question);
        let (page_id, page_path) = next_analysis_path(&worktree, question)?;
        fs::write(&page_path, analysis_markdown(question, answer, &title))
            .map_err(|e| format!("write analysis: {e}"))?;
        append_analysis_to_index(&worktree, &page_id, &title, question)?;
        append_log(
            &worktree,
            "query",
            &one_line(question, 72),
            &format!("Saved [[{page_id}|{title}]] for review."),
        )?;
        git(&worktree, &["add", "analyses", "index.md", "log.md"])?;
        git(
            &worktree,
            &[
                "commit",
                "-m",
                &format!("query: save {}", first_line(question)),
            ],
        )?;
        let name_status = git(vault, &["diff", "--name-status", &base_commit, &branch])?;
        let deletions: Vec<String> = name_status
            .lines()
            .filter(|line| line.starts_with('D'))
            .filter_map(|line| line.split_whitespace().nth(1).map(String::from))
            .collect();
        let (_, post_issues) = lint(&worktree)?;
        let new_issues = post_issues
            .iter()
            .filter(|issue| !pre_issues.contains(issue))
            .cloned()
            .collect();
        let patch = git(vault, &["diff", &base_commit, &branch])?;
        Ok(QueryReview {
            review_id,
            question: question.into(),
            patch,
            new_issues,
            deletions,
        })
    })();

    match prepared {
        Ok(review) => Ok((
            QueryHeld {
                review_id,
                vault: vault.into(),
                question: question.into(),
                branch,
                worktree,
            },
            review,
        )),
        Err(error) => {
            cleanup(vault, &branch, &worktree);
            Err(error)
        }
    }
}

fn worker(app: AppHandle) {
    loop {
        let job = {
            let state = app.state::<SharedState>();
            let mut st = state.lock().unwrap();
            match st.queue.pop_front() {
                Some(mut j) => {
                    j.status = "running".into();
                    st.current = Some(j.clone());
                    emit_state(&app, &st);
                    j
                }
                None => {
                    st.worker_running = false;
                    st.current = None;
                    emit_state(&app, &st);
                    return;
                }
            }
        };
        let outcome = run_job(&app, &job);
        let state = app.state::<SharedState>();
        let mut st = state.lock().unwrap();
        let mut done_job = job.clone();
        let mut pause = false;
        match outcome {
            Ok(RunOutcome::Merged { summary, pages }) => {
                done_job.status = "merged".into();
                let _ = app.emit(
                    "ingest:merged",
                    serde_json::json!({"jobId": job.id, "source": job.source_name, "summary": summary, "pages": pages}),
                );
            }
            Ok(RunOutcome::Held {
                branch,
                worktree,
                patch,
                new_issues,
                deletions,
                summary,
            }) => {
                done_job.status = "held".into();
                st.held.push(Held {
                    job_id: job.id,
                    vault: PathBuf::from(&job.vault),
                    source_name: job.source_name.clone(),
                    branch,
                    worktree,
                    summary: summary.clone(),
                });
                let _ = app.emit(
                    "ingest:review",
                    serde_json::json!({"jobId": job.id, "source": job.source_name, "patch": patch, "newIssues": new_issues, "deletions": deletions, "summary": summary}),
                );
                // Serial discipline: nothing else runs until the human decides.
                pause = true;
            }
            Err(e) => {
                done_job.status = "failed".into();
                let _ = app.emit(
                    "ingest:failed",
                    serde_json::json!({"jobId": job.id, "source": job.source_name, "error": e}),
                );
            }
        }
        st.current = None;
        st.done.push(done_job);
        if pause {
            st.worker_running = false;
            emit_state(&app, &st);
            return;
        }
        emit_state(&app, &st);
        drop(st);
    }
}

#[tauri::command]
pub fn ensure_schema(vault: String) -> Result<bool, String> {
    let root = match require_vault_repo(Path::new(&vault)) {
        Ok(r) => r,
        Err(_) => return Ok(false), // not an agent-managed vault: leave untouched
    };
    bootstrap_vault(&root)
}

#[tauri::command]
pub fn vault_create(parent: String, name: String) -> Result<String, String> {
    let root = create_vault(Path::new(&parent), &name)?;
    Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn query_run(vault: String, question: String) -> Result<QueryAnswer, String> {
    let root = require_vault_repo(Path::new(&vault))?;
    let question = query_text(&question)?;
    Command::new("claude")
        .arg("--version")
        .output()
        .map_err(|_| "claude CLI not found on PATH".to_string())?;
    drive_query_agent(&root, question)
}

#[tauri::command]
pub fn query_save(
    state: State<SharedQueryState>,
    vault: String,
    question: String,
    answer: QueryAnswer,
) -> Result<QueryReview, String> {
    let root = require_vault_repo(Path::new(&vault))?;
    let question = query_text(&question)?.to_string();
    let review_id = {
        let mut st = state.lock().unwrap();
        if st.saving || st.held.is_some() {
            return Err("resolve the pending analysis review before saving another answer".into());
        }
        st.saving = true;
        st.next_review_id += 1;
        st.next_review_id
    };
    let prepared = prepare_query_review(&root, review_id, &question, &answer);
    let mut st = state.lock().unwrap();
    st.saving = false;
    match prepared {
        Ok((held, review)) => {
            st.held = Some(held);
            Ok(review)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn query_decide(
    state: State<SharedQueryState>,
    review_id: u64,
    accept: bool,
) -> Result<(), String> {
    let held = {
        let mut st = state.lock().unwrap();
        let held = st.held.take().ok_or("no saved analysis is awaiting review")?;
        if held.review_id != review_id {
            st.held = Some(held);
            return Err("that saved analysis is no longer awaiting review".into());
        }
        held
    };
    if accept {
        git(
            &held.vault,
            &[
                "merge",
                "--no-ff",
                &held.branch,
                "-m",
                &format!("query (reviewed): {}", first_line(&held.question)),
            ],
        )?;
        cleanup(&held.vault, &held.branch, &held.worktree);
    } else {
        cleanup(&held.vault, &held.branch, &held.worktree);
        append_log(
            &held.vault,
            "query",
            &one_line(&held.question, 72),
            "Answer was not saved; review branch discarded.",
        )?;
        git(&held.vault, &["add", "log.md"])?;
        git(
            &held.vault,
            &[
                "commit",
                "-m",
                &format!("log: reject query {}", first_line(&held.question)),
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{analysis_markdown, vault_dir_name, QueryAnswer, QueryCitation};

    #[test]
    fn accepts_a_single_human_readable_folder_name() {
        assert_eq!(vault_dir_name("  Research atlas  ").unwrap(), "Research atlas");
    }

    #[test]
    fn rejects_path_like_or_empty_vault_names() {
        for name in ["", " ", ".", "..", "research/atlas", "research\\atlas"] {
            assert!(vault_dir_name(name).is_err(), "{name:?} should be rejected");
        }
    }

    #[test]
    fn saved_analyses_keep_raw_source_provenance() {
        let answer = QueryAnswer {
            answer: "A cited answer.".into(),
            citations: vec![QueryCitation {
                page: "concepts/compounding".into(),
                sources: vec!["raw/letter.txt".into()],
            }],
        };
        let markdown = analysis_markdown("What compounds?", &answer, "Analysis — What compounds?");
        assert!(markdown.contains("sources: raw/letter.txt"));
        assert!(markdown.contains("[[concepts/compounding]]"));
    }
}

#[tauri::command]
pub fn ingest_enqueue(
    app: AppHandle,
    state: State<SharedState>,
    vault: String,
    sources: Vec<String>,
) -> Result<usize, String> {
    let root = require_vault_repo(Path::new(&vault))?;
    Command::new("claude")
        .arg("--version")
        .output()
        .map_err(|_| "claude CLI not found on PATH".to_string())?;

    let raw = root.join("raw");
    fs::create_dir_all(&raw).map_err(|e| e.to_string())?;
    let mut names: Vec<String> = Vec::new();
    for s in &sources {
        let sp = PathBuf::from(s);
        let name = sp
            .file_name()
            .ok_or("bad source path")?
            .to_string_lossy()
            .to_string();
        let dest = raw.join(&name);
        if sp.canonicalize().ok() != dest.canonicalize().ok() && !dest.exists() {
            fs::copy(&sp, &dest).map_err(|e| format!("copy {name}: {e}"))?;
        }
        names.push(name);
    }
    // Also pick up files dropped into raw/ by hand that were never ingested.
    for entry in fs::read_dir(&raw).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || names.contains(&name) {
            continue;
        }
        names.push(name);
    }
    // A source already recorded in log.md has been ingested (or explicitly
    // rejected) — never re-run it, whether it was picked or scanned. This also
    // makes webview reloads with a pending dev-ingest hook harmless.
    let log_text = fs::read_to_string(root.join("log.md")).unwrap_or_default();
    names.retain(|n| !log_text.contains(n.as_str()));
    // Process in name order: chronologically-prefixed sources (1977-…, 1978-…)
    // ingest in the order their knowledge compounds.
    names.sort();

    let st = state.lock().unwrap();
    // Never queue the same source twice at once.
    let already: Vec<String> = st
        .queue
        .iter()
        .chain(st.current.iter())
        .map(|j| j.source_name.clone())
        .collect();
    names.retain(|n| !already.contains(n));
    if names.is_empty() {
        return Ok(0);
    }
    drop(st);

    if !git(&root, &["status", "--porcelain", "raw"])?.trim().is_empty() {
        git(&root, &["add", "raw"])?;
        git(
            &root,
            &["commit", "-m", &format!("raw: add {}", names.join(", "))],
        )?;
    }

    let mut st = state.lock().unwrap();
    let count = names.len();
    for name in names {
        st.next_id += 1;
        let id = st.next_id;
        st.queue.push_back(Job {
            id,
            vault: root.to_string_lossy().to_string(),
            source: raw.join(&name).to_string_lossy().to_string(),
            source_name: name,
            status: "queued".into(),
        });
    }
    emit_state(&app, &st);
    if !st.worker_running {
        st.worker_running = true;
        drop(st);
        let handle = app.clone();
        std::thread::spawn(move || worker(handle));
    }
    Ok(count)
}

#[tauri::command]
pub fn ingest_decide(
    app: AppHandle,
    state: State<SharedState>,
    job_id: u64,
    accept: bool,
) -> Result<(), String> {
    let held = {
        let mut st = state.lock().unwrap();
        let idx = st
            .held
            .iter()
            .position(|h| h.job_id == job_id)
            .ok_or("no held ingest with that id")?;
        st.held.remove(idx)
    };
    if accept {
        git(
            &held.vault,
            &[
                "merge",
                "--no-ff",
                &held.branch,
                "-m",
                &format!(
                    "ingest (reviewed): {} — {}",
                    held.source_name,
                    first_line(&held.summary)
                ),
            ],
        )?;
        cleanup(&held.vault, &held.branch, &held.worktree);
        let (pages, _) = lint(&held.vault)?;
        let _ = app.emit(
            "ingest:merged",
            serde_json::json!({"jobId": job_id, "source": held.source_name, "summary": held.summary, "pages": pages, "reviewed": true}),
        );
    } else {
        cleanup(&held.vault, &held.branch, &held.worktree);
        append_log(
            &held.vault,
            "ingest",
            &held.source_name,
            "Rejected in review; branch discarded.",
        )?;
        git(&held.vault, &["add", "log.md"])?;
        git(
            &held.vault,
            &[
                "commit",
                "-m",
                &format!("log: reject ingest {}", held.source_name),
            ],
        )?;
        let _ = app.emit(
            "ingest:rejected",
            serde_json::json!({"jobId": job_id, "source": held.source_name}),
        );
    }
    {
        let mut st = state.lock().unwrap();
        if let Some(j) = st.done.iter_mut().find(|j| j.id == job_id) {
            j.status = if accept { "merged".into() } else { "rejected".into() };
        }
        // Resume the queue that paused for this review.
        if !st.queue.is_empty() && !st.worker_running {
            st.worker_running = true;
            emit_state(&app, &st);
            drop(st);
            let handle = app.clone();
            std::thread::spawn(move || worker(handle));
        } else {
            emit_state(&app, &st);
        }
    }
    Ok(())
}
