import '@fontsource/fragment-mono';
import '@fontsource-variable/instrument-sans';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import {
  buildGraph,
  buildVault,
  lintVault,
  type Graph,
  type LintIssue,
  type Vault,
  type VaultFile,
} from 'wiki-lib';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

const TYPE_COLORS: Record<string, string> = {
  index: '#7c3a2d',
  concept: '#46617d',
  person: '#5c7150',
  project: '#a98436',
  note: '#7c5b78',
};
const FALLBACK_COLOR = '#a6a294';
const TYPE_ORDER = ['index', 'concept', 'person', 'project', 'note'];

const colorFor = (type: string | null): string =>
  (type !== null && TYPE_COLORS[type]) || FALLBACK_COLOR;

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  type: string | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('graph') as unknown as SVGSVGElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
const vaultPathEl = document.getElementById('vault-path') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;
const detailEl = document.getElementById('detail') as HTMLElement;
const legendEl = document.getElementById('legend') as HTMLElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let vault: Vault | null = null;
let issues: LintIssue[] = [];
let simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> | null = null;

async function collectMarkdown(root: string, rel = ''): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  const entries = await readDir(rel ? `${root}/${rel}` : root);
  for (const entry of entries) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      files.push(...(await collectMarkdown(root, entryRel)));
    } else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
      files.push({ path: entryRel, content: await readTextFile(`${root}/${entryRel}`) });
    }
  }
  return files;
}

async function openVault(root: string): Promise<void> {
  const files = await collectMarkdown(root);
  vault = buildVault(files);
  issues = lintVault(vault);
  const basename = root.replace(/\/+$/, '').split('/').pop() ?? root;
  vaultPathEl.textContent = `${basename} · ${vault.pages.length} pages`;
  vaultPathEl.title = root;
  hintEl.hidden = true;
  renderLegend();
  renderGraph(buildGraph(vault));
}

function renderLegend(): void {
  if (!vault) return;
  const present = new Set(vault.pages.map((p) => p.type ?? 'untyped'));
  legendEl.innerHTML = '';
  for (const type of [...TYPE_ORDER, 'untyped']) {
    if (!present.has(type)) continue;
    const key = document.createElement('span');
    key.className = 'key';
    const dot = document.createElement('span');
    dot.className = 'type-dot';
    dot.style.setProperty('--dot', colorFor(type === 'untyped' ? null : type));
    key.append(dot, document.createTextNode(type));
    legendEl.appendChild(key);
  }
  legendEl.hidden = false;
}

function renderGraph(graph: Graph): void {
  simulation?.stop();
  const { width, height } = svg.getBoundingClientRect();
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  const links: SimulationLinkDatum<SimNode>[] = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  svg.innerHTML = '';

  // Ink on paper: depth comes from a soft graphite lift, not additive glow.
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    '<filter id="lift" x="-60%" y="-60%" width="220%" height="220%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#3c3728" flood-opacity="0.35"/>' +
    '</filter>';
  svg.appendChild(defs);

  const lineEls = links.map((link) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'edge');
    line.dataset.source = (link.source as string | SimNode) instanceof Object
      ? (link.source as SimNode).id
      : (link.source as string);
    line.dataset.target = (link.target as string | SimNode) instanceof Object
      ? (link.target as SimNode).id
      : (link.target as string);
    svg.appendChild(line);
    return line;
  });

  const nodeEls = nodes.map((node) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('data-id', node.id);
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('r', '15');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'core');
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', colorFor(node.type));
    circle.setAttribute('filter', 'url(#lift)');
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('y', '24');
    label.textContent = node.title;
    g.append(ring, circle, label);
    g.addEventListener('click', (event) => {
      event.stopPropagation();
      select(node.id);
    });
    svg.appendChild(g);
    return g;
  });

  const updatePositions = () => {
    for (const [i, link] of links.entries()) {
      const s = link.source as SimNode;
      const t = link.target as SimNode;
      lineEls[i].setAttribute('x1', String(s.x ?? 0));
      lineEls[i].setAttribute('y1', String(s.y ?? 0));
      lineEls[i].setAttribute('x2', String(t.x ?? 0));
      lineEls[i].setAttribute('y2', String(t.y ?? 0));
    }
    for (const [i, node] of nodes.entries()) {
      nodeEls[i].setAttribute('transform', `translate(${node.x ?? 0}, ${node.y ?? 0})`);
    }
  };

  simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance(95),
    )
    .force('charge', forceManyBody().strength(-320))
    .force('x', forceX(width / 2).strength(0.045))
    .force('y', forceY(height / 2).strength(0.055))
    .force('collide', forceCollide(30));

  if (reducedMotion) {
    // Settle instantly: no ambient drift for reduced-motion users.
    simulation.stop().tick(300);
    updatePositions();
  } else {
    // A small non-zero alpha target keeps the simulation breathing forever —
    // the graph should always feel alive beneath the glass.
    simulation.on('tick', updatePositions).alpha(0.9).alphaTarget(0.012).alphaMin(0);
  }
}

function select(id: string): void {
  if (!vault) return;
  const page = vault.byId.get(id);
  if (!page) return;

  svg
    .querySelectorAll('.node')
    .forEach((el) => el.classList.toggle('selected', el.getAttribute('data-id') === id));
  svg.querySelectorAll('line.edge').forEach((el) => {
    const line = el as SVGLineElement;
    line.classList.toggle('lit', line.dataset.source === id || line.dataset.target === id);
  });

  const pageIssues = issues.filter((issue) => issue.page === id);
  sidebar.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = page.title;

  const meta = document.createElement('p');
  meta.className = 'meta';
  const pathSpan = document.createElement('span');
  pathSpan.textContent = page.id;
  const chip = document.createElement('span');
  chip.className = 'type-chip';
  const dot = document.createElement('span');
  dot.className = 'type-dot';
  dot.style.setProperty('--dot', colorFor(page.type));
  chip.append(dot, document.createTextNode(page.type ?? 'untyped'));
  meta.append(pathSpan, chip);

  const lintBox = document.createElement('div');
  lintBox.className = 'lint';
  if (pageIssues.length === 0) {
    lintBox.classList.add('clean');
    lintBox.textContent = 'No lint issues.';
  } else {
    for (const issue of pageIssues) {
      const item = document.createElement('div');
      item.className = `issue issue-${issue.rule}`;
      item.dataset.rule = issue.rule;
      item.textContent = issue.message;
      lintBox.appendChild(item);
    }
  }

  const body = document.createElement('pre');
  body.textContent = page.body;

  sidebar.append(heading, meta, lintBox, body);
  detailEl.hidden = false;
}

function deselect(): void {
  detailEl.hidden = true;
  svg.querySelectorAll('.node.selected').forEach((el) => el.classList.remove('selected'));
  svg.querySelectorAll('line.edge.lit').forEach((el) => el.classList.remove('lit'));
}

document.getElementById('open-vault')!.addEventListener('click', async () => {
  const dir = await open({ directory: true, title: 'Open vault' });
  if (typeof dir === 'string') await openVault(dir);
});
document.getElementById('detail-close')!.addEventListener('click', deselect);
svg.addEventListener('click', deselect);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') deselect();
});

// Dev-only test hooks (stripped from production builds): VITE_DEV_VAULT
// auto-opens a vault on launch and VITE_DEV_SELECT auto-selects a node, then
// a render report is POSTed back to the vite terminal for verification.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_VAULT) {
  void (async () => {
    const report = (payload: unknown) =>
      fetch('/__dev-report', { method: 'POST', body: JSON.stringify(payload) });
    try {
      await openVault(import.meta.env.VITE_DEV_VAULT as string);
      const selectId = import.meta.env.VITE_DEV_SELECT as string | undefined;
      if (selectId) select(selectId);
      const types = [...new Set(vault!.pages.map((p) => p.type))];
      await report({
        pages: vault!.pages.length,
        renderedNodes: svg.querySelectorAll('.node').length,
        renderedEdges: svg.querySelectorAll('line.edge').length,
        colorsByType: Object.fromEntries(types.map((t) => [t ?? '(none)', colorFor(t)])),
        orphans: issues.filter((i) => i.rule === 'orphan').map((i) => i.page),
        selected: selectId ? { id: selectId, sidebarText: sidebar.innerText } : null,
      });
    } catch (error) {
      await report({ error: String(error) });
    }
  })();
}
