#!/usr/bin/env node
// Read-only MCP server (stdio) over an Eva vault. No write tools — writes
// happen only through the ingest flow and its review gate.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildGraph } from 'wiki-lib';
import { loadVault } from './vault-io.mjs';

const VAULT = process.env.EVA_VAULT;
if (!VAULT) {
  console.error('EVA_VAULT env var must point at a vault directory');
  process.exit(1);
}

// Reload per call so the agent's own writes during a run are visible.
const vault = () => loadVault(VAULT);
const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

const server = new McpServer({ name: 'eva', version: '0.1.0' });

server.tool(
  'search',
  'Search wiki pages by title, alias, and body text. Returns page ids, types, and matching excerpts. Use this before creating any page to find existing coverage of a subject.',
  { query: z.string().describe('words to search for') },
  async ({ query }) => {
    const v = vault();
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const results = [];
    for (const page of v.pages) {
      const title = page.title.toLowerCase();
      const aliases = (page.frontmatter.aliases ?? '').toLowerCase();
      const body = page.body.toLowerCase();
      const titleHit = terms.some((t) => title.includes(t) || page.stem.includes(t) || aliases.includes(t));
      const bodyHits = terms.filter((t) => body.includes(t)).length;
      if (!titleHit && bodyHits === 0) continue;
      const at = body.indexOf(terms.find((t) => body.includes(t)) ?? '');
      const excerpt = at >= 0 ? page.body.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ') : '';
      results.push({
        id: page.id,
        title: page.title,
        type: page.type,
        score: (titleHit ? 10 : 0) + bodyHits,
        excerpt,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return asText({ query, matches: results.slice(0, 10) });
  },
);

server.tool(
  'read_page',
  'Read one page in full: frontmatter, body, and link counts.',
  { id: z.string().describe('page id (path without .md), e.g. entities/warren-buffett') },
  async ({ id }) => {
    const v = vault();
    const page = v.byId.get(id) ?? v.pages.find((p) => p.stem === id || p.title.toLowerCase() === id.toLowerCase());
    if (!page) return asText({ error: `no page with id "${id}"`, hint: 'use search to find valid ids' });
    const graph = buildGraph(v);
    return asText({
      id: page.id,
      title: page.title,
      type: page.type,
      frontmatter: page.frontmatter,
      body: page.body,
      outgoingLinks: page.links.map((l) => l.target),
      incomingFrom: graph.edges.filter((e) => e.target === page.id).map((e) => e.source),
    });
  },
);

server.tool(
  'neighbors',
  'List the pages a page links to and the pages that link to it.',
  { id: z.string().describe('page id (path without .md)') },
  async ({ id }) => {
    const v = vault();
    if (!v.byId.get(id)) return asText({ error: `no page with id "${id}"` });
    const graph = buildGraph(v);
    return asText({
      id,
      outgoing: graph.edges.filter((e) => e.source === id).map((e) => e.target),
      incoming: graph.edges.filter((e) => e.target === id).map((e) => e.source),
    });
  },
);

server.tool(
  'shortest_path',
  'Shortest link path between two pages (treating links as undirected). Useful to see how two subjects relate in the existing wiki.',
  { from: z.string(), to: z.string() },
  async ({ from, to }) => {
    const v = vault();
    if (!v.byId.get(from)) return asText({ error: `no page "${from}"` });
    if (!v.byId.get(to)) return asText({ error: `no page "${to}"` });
    const adj = new Map();
    for (const e of buildGraph(v).edges) {
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)).push(e.target);
      (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)).push(e.source);
    }
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const next of adj.get(cur) ?? []) {
        if (!prev.has(next)) {
          prev.set(next, cur);
          queue.push(next);
        }
      }
    }
    if (!prev.has(to)) return asText({ from, to, path: null, note: 'no path — the pages are in disconnected components' });
    const path = [];
    for (let cur = to; cur !== null; cur = prev.get(cur)) path.unshift(cur);
    return asText({ from, to, path });
  },
);

await server.connect(new StdioServerTransport());
