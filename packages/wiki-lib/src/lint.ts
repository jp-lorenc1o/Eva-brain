import { type Vault, resolveLink } from './vault.js';
import { buildGraph } from './graph.js';

export type LintRule = 'broken-link' | 'orphan' | 'missing-type';

export interface LintIssue {
  /** Page id the issue belongs to. */
  page: string;
  rule: LintRule;
  message: string;
}

/**
 * Lint the whole vault:
 * - broken-link: a wiki-link that resolves to no page
 * - orphan: no other page links to this page
 * - missing-type: frontmatter has no `type` field
 */
export function lintVault(vault: Vault): LintIssue[] {
  const issues: LintIssue[] = [];
  const hasIncoming = new Set<string>();
  for (const edge of buildGraph(vault).edges) hasIncoming.add(edge.target);

  for (const page of vault.pages) {
    for (const link of page.links) {
      if (!resolveLink(vault, link.target)) {
        issues.push({
          page: page.id,
          rule: 'broken-link',
          message: `${link.raw} does not resolve to any page in the vault`,
        });
      }
    }
    if (!hasIncoming.has(page.id)) {
      issues.push({
        page: page.id,
        rule: 'orphan',
        message: 'No other page links to this page',
      });
    }
    if (!page.type) {
      issues.push({
        page: page.id,
        rule: 'missing-type',
        message: 'Frontmatter has no `type` field',
      });
    }
  }
  return issues;
}

export function lintPage(vault: Vault, pageId: string): LintIssue[] {
  return lintVault(vault).filter((issue) => issue.page === pageId);
}
