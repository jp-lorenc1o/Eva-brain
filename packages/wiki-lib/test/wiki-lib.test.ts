import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGraph,
  buildVault,
  extractLinks,
  lintPage,
  lintVault,
  parseFrontmatter,
  resolveLink,
} from '../src/index.js';

const VAULT_DIR = fileURLToPath(new URL('../test-vault', import.meta.url));

function loadTestVault() {
  const files = (readdirSync(VAULT_DIR, { recursive: true }) as string[])
    .filter((p) => p.endsWith('.md'))
    .map((p) => ({
      path: p.split('\\').join('/'),
      content: readFileSync(join(VAULT_DIR, p), 'utf8'),
    }));
  return buildVault(files);
}

describe('parsing', () => {
  it('parses frontmatter key/value pairs and strips the block from the body', () => {
    const { frontmatter, body } = parseFrontmatter('---\ntitle: Foo\ntype: concept\n---\nHello');
    expect(frontmatter).toEqual({ title: 'Foo', type: 'concept' });
    expect(body).toBe('Hello');
  });

  it('treats content without frontmatter as all body', () => {
    const { frontmatter, body } = parseFrontmatter('just text');
    expect(frontmatter).toEqual({});
    expect(body).toBe('just text');
  });

  it('extracts plain and aliased wiki-links', () => {
    expect(extractLinks('see [[foo]] and [[bar|the bar page]]')).toEqual([
      { raw: '[[foo]]', target: 'foo', alias: null },
      { raw: '[[bar|the bar page]]', target: 'bar', alias: 'the bar page' },
    ]);
  });
});

describe('test-vault', () => {
  const vault = loadTestVault();

  it('contains exactly 16 pages', () => {
    expect(vault.pages).toHaveLength(16);
  });

  it('every page except notes/ideas has a frontmatter type', () => {
    const untyped = vault.pages.filter((p) => p.type === null).map((p) => p.id);
    expect(untyped).toEqual(['notes/ideas']);
  });

  it('resolves links by stem and by title', () => {
    expect(resolveLink(vault, 'memex')?.id).toBe('projects/memex');
    expect(resolveLink(vault, 'Graph View')?.id).toBe('concepts/graph-view');
    expect(resolveLink(vault, 'no-such-page')).toBeNull();
  });

  it('builds a graph with 16 nodes and the expected edges', () => {
    const graph = buildGraph(vault);
    expect(graph.nodes).toHaveLength(16);
    expect(graph.edges).toContainEqual({ source: 'index', target: 'concepts/wiki' });
    expect(graph.edges).toContainEqual({
      source: 'people/ted-nelson',
      target: 'projects/xanadu',
    });
    // Broken links must not produce edges.
    const targets = new Set(graph.edges.map((e) => e.target));
    expect(targets.has('lint-rules')).toBe(false);
  });

  it('flags concepts/wiki-linting as the only orphan', () => {
    const orphans = lintVault(vault)
      .filter((issue) => issue.rule === 'orphan')
      .map((issue) => issue.page);
    expect(orphans).toEqual(['concepts/wiki-linting']);
  });

  it('does not flag index-type hub pages as orphans', () => {
    const hubVault = buildVault([
      { path: 'index.md', content: '---\ntitle: Home\ntype: index\n---\n\nSee [[a]].' },
      { path: 'a.md', content: '---\ntitle: A\ntype: concept\n---\n\nBody.' },
    ]);
    const orphans = lintVault(hubVault)
      .filter((issue) => issue.rule === 'orphan')
      .map((issue) => issue.page);
    // index has no incoming links but is a hub, not an orphan
    expect(orphans).toEqual([]);
  });

  it('scopes the index exemption narrowly: other unlinked pages still orphan', () => {
    const mixedVault = buildVault([
      { path: 'index.md', content: '---\ntitle: Home\ntype: index\n---\n\nNo links here.' },
      { path: 'b.md', content: '---\ntitle: B\ntype: concept\n---\n\nBody.' },
    ]);
    const orphans = lintVault(mixedVault)
      .filter((issue) => issue.rule === 'orphan')
      .map((issue) => issue.page);
    expect(orphans).toEqual(['b']);
  });

  it('flags the two intentionally broken links', () => {
    const broken = lintVault(vault).filter((issue) => issue.rule === 'broken-link');
    expect(broken.map((issue) => issue.page).sort()).toEqual([
      'concepts/wiki-linting',
      'notes/ideas',
    ]);
  });

  it('reports per-page issues via lintPage', () => {
    const rules = lintPage(vault, 'concepts/wiki-linting').map((issue) => issue.rule);
    expect(rules).toContain('orphan');
    expect(rules).toContain('broken-link');
    expect(lintPage(vault, 'concepts/wiki')).toEqual([]);
  });
});
