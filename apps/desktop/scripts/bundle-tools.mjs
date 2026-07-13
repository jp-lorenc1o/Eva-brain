#!/usr/bin/env node
// Stage packages/eva-mcp and its runtime dependencies as a Tauri resource so
// a bundled Eva.app can run the lint gate and MCP server without the source
// checkout. Dev mode never uses this staging: tools_dir() falls back to the
// workspace. Runs from tauri.conf.json's beforeBuildCommand.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const source = join(repo, 'packages/eva-mcp');
const staged = join(here, '../src-tauri/resources/eva-mcp');

rmSync(staged, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });
for (const file of ['server.mjs', 'lint-cli.mjs', 'vault-io.mjs']) {
  cpSync(join(source, file), join(staged, file));
}

// Registry dependencies install normally; the workspace-local wiki-lib is
// copied in afterwards because it is not published anywhere.
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
delete manifest.dependencies['wiki-lib'];
writeFileSync(join(staged, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
  cwd: staged,
  stdio: 'inherit',
});

const wikiLib = join(repo, 'packages/wiki-lib');
const stagedWikiLib = join(staged, 'node_modules/wiki-lib');
rmSync(stagedWikiLib, { recursive: true, force: true });
mkdirSync(stagedWikiLib, { recursive: true });
cpSync(join(wikiLib, 'package.json'), join(stagedWikiLib, 'package.json'));
cpSync(join(wikiLib, 'dist'), join(stagedWikiLib, 'dist'), { recursive: true });
console.log(`[eva] staged Node tools at ${staged}`);
