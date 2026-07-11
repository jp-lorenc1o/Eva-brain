#!/usr/bin/env node
// Prints a vault's deterministic lint issues as JSON. Used by the Rust
// ingest orchestrator to compare pre- and post-ingest vault health.
import { lintVault } from 'wiki-lib';
import { loadVault } from './vault-io.mjs';

const root = process.argv[2];
if (!root) {
  console.error('usage: lint-cli.mjs <vault-dir>');
  process.exit(1);
}
const vault = loadVault(root);
const issues = lintVault(vault);
console.log(JSON.stringify({ pages: vault.pages.length, issues }));
