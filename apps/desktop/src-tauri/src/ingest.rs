// Ingest orchestration: job queue, git branch/worktree management, the
// headless agent subprocess, and the lint gate. The webview only invokes the
// commands at the bottom and renders the events this module emits.
use serde::Serialize;
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

fn append_log(dir: &Path, source_name: &str, body: &str) -> Result<(), String> {
    let log_path = dir.join("log.md");
    let mut log = fs::read_to_string(&log_path).unwrap_or_else(|_| "# Log\n".to_string());
    log.push_str(&format!(
        "\n## [{}] ingest | {}\n{}\n",
        today(),
        source_name,
        body.trim()
    ));
    fs::write(&log_path, log).map_err(|e| e.to_string())
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
    append_log(&worktree, &job.source_name, &summary)?;
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
    git(&root, &staged)?;
    git(&root, &["commit", "-m", "schema: bootstrap Eva vault"])?;
    Ok(true)
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
