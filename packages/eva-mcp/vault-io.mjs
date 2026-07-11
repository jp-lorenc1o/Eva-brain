// Shared vault loader for the MCP server and lint CLI. Mirrors the desktop
// app's exclusions: infrastructure files and raw/ sources are not wiki pages.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildVault } from 'wiki-lib';

const INFRA = new Set(['eva.md', 'agents.md', 'claude.md', 'log.md']);

export function loadVault(root) {
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .map((p) => p.split('\\').join('/'))
    .filter((p) => p.toLowerCase().endsWith('.md'))
    .filter((p) => !p.split('/').some((seg) => seg.startsWith('.')))
    .filter((p) => !p.startsWith('raw/'))
    .filter((p) => !INFRA.has(p.toLowerCase()))
    .map((p) => ({ path: p, content: readFileSync(join(root, p), 'utf8') }));
  return buildVault(files);
}
