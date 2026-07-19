import { type Vault, resolveLink } from './vault.js';
import { buildGraph } from './graph.js';

export type LintRule =
  | 'broken-link'
  | 'orphan'
  | 'missing-title'
  | 'missing-type'
  | 'missing-source'
  | 'invalid-source'
  | 'misplaced-page';

/**
 * First path segments that signal an absolute filesystem path recreated
 * inside the vault. Observed in the wild: an agent hallucinates an absolute
 * write target (`/private/var/folders/…/T/…`), the sandbox re-roots the write
 * into the vault, and the whole fake path becomes real nested directories.
 * These roots are filesystem anatomy, never knowledge taxonomy.
 */
const MISPLACED_ROOTS = new Set([
  'private',
  'var',
  'tmp',
  'usr',
  'etc',
  'opt',
  'home',
  'Users',
  'Library',
  'System',
  'Volumes',
]);

export interface LintIssue {
  /** Page id the issue belongs to. */
  page: string;
  rule: LintRule;
  message: string;
}

/**
 * Lint the whole vault:
 * - broken-link: a wiki-link that resolves to no page
 * - orphan: no other page links to this page (index pages are exempt — a
 *   hub's job is to link out to everything, not to be linked back to)
 * - missing-title: frontmatter has no `title` field (the display fallback is
 *   useful for reading legacy notes, but not sufficient for an Eva page)
 * - missing-type: frontmatter has no `type` field
 * - missing-source: a summary does not identify the raw document it digests
 * - invalid-source: a summary's source is not a path inside `raw/`
 * - misplaced-page: the page's path re-roots an absolute filesystem path
 *   (private/var/…, Users/…, tmp/…) — almost certainly a hallucinated agent
 *   write target that a sandbox contained; the change should be rejected
 */
export function lintVault(vault: Vault): LintIssue[] {
  const issues: LintIssue[] = [];
  const hasIncoming = new Set<string>();
  for (const edge of buildGraph(vault).edges) hasIncoming.add(edge.target);

  for (const page of vault.pages) {
    const rootSegment = page.id.split('/', 1)[0];
    if (page.id.includes('/') && MISPLACED_ROOTS.has(rootSegment)) {
      issues.push({
        page: page.id,
        rule: 'misplaced-page',
        message:
          'Path recreates an absolute filesystem path inside the vault — likely a hallucinated agent write target; recommend rejecting this change',
      });
    }
    for (const link of page.links) {
      if (!resolveLink(vault, link.target)) {
        issues.push({
          page: page.id,
          rule: 'broken-link',
          message: `${link.raw} does not resolve to any page in the vault`,
        });
      }
    }
    if (!hasIncoming.has(page.id) && page.type !== 'index') {
      issues.push({
        page: page.id,
        rule: 'orphan',
        message: 'No other page links to this page',
      });
    }
    if (!page.frontmatter.title?.trim()) {
      issues.push({
        page: page.id,
        rule: 'missing-title',
        message: 'Frontmatter has no `title` field',
      });
    }
    if (!page.type) {
      issues.push({
        page: page.id,
        rule: 'missing-type',
        message: 'Frontmatter has no `type` field',
      });
    }
    if (page.type === 'summary') {
      const source = page.frontmatter.source?.trim();
      if (!source) {
        issues.push({
          page: page.id,
          rule: 'missing-source',
          message: 'Summary frontmatter has no `source` field',
        });
      } else if (!source.startsWith('raw/')) {
        issues.push({
          page: page.id,
          rule: 'invalid-source',
          message: 'Summary `source` must be a path inside `raw/`',
        });
      }
    }
  }
  return issues;
}

export function lintPage(vault: Vault, pageId: string): LintIssue[] {
  return lintVault(vault).filter((issue) => issue.page === pageId);
}
