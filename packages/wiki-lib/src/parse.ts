export interface Frontmatter {
  [key: string]: string;
}

export interface WikiLink {
  raw: string;
  target: string;
  alias: string | null;
}

export interface Page {
  /** Path relative to the vault root, without the .md extension. */
  id: string;
  /** Original relative path, forward slashes. */
  path: string;
  /** Last path segment of the id. */
  stem: string;
  title: string;
  type: string | null;
  frontmatter: Frontmatter;
  body: string;
  links: WikiLink[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LINK_RE = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

/**
 * Parse a leading `---` frontmatter block of simple `key: value` lines.
 * Nested YAML is out of scope for this vault format.
 */
export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: content.slice(match[0].length) };
}

/** Extract `[[target]]` and `[[target|alias]]` links from a page body. */
export function extractLinks(body: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of body.matchAll(LINK_RE)) {
    links.push({
      raw: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim() ?? null,
    });
  }
  return links;
}

export function parsePage(path: string, content: string): Page {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const id = normalized.replace(/\.md$/i, '');
  const stem = id.split('/').pop() ?? id;
  const { frontmatter, body } = parseFrontmatter(content);
  return {
    id,
    path: normalized,
    stem,
    title: frontmatter.title ?? stem,
    type: frontmatter.type ?? null,
    frontmatter,
    body: body.trim(),
    links: extractLinks(body),
  };
}
