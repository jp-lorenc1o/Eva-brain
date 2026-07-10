import { type Page, parsePage } from './parse.js';

export interface VaultFile {
  /** Path relative to the vault root. */
  path: string;
  content: string;
}

export interface Vault {
  pages: Page[];
  byId: Map<string, Page>;
}

export function buildVault(files: VaultFile[]): Vault {
  const pages = files
    .filter((f) => /\.md$/i.test(f.path))
    .map((f) => parsePage(f.path, f.content))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { pages, byId: new Map(pages.map((p) => [p.id, p])) };
}

/**
 * Resolve a wiki-link target to a page. Precedence: exact id (vault-relative
 * path), then file stem, then frontmatter title — all case-insensitive.
 */
export function resolveLink(vault: Vault, target: string): Page | null {
  const t = target.trim().toLowerCase().replace(/\.md$/i, '');
  return (
    vault.pages.find((p) => p.id.toLowerCase() === t) ??
    vault.pages.find((p) => p.stem.toLowerCase() === t) ??
    vault.pages.find((p) => p.title.toLowerCase() === t) ??
    null
  );
}
