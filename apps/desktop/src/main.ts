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
const emptyEl = document.getElementById('empty') as HTMLElement;
const recentEl = document.getElementById('recent') as HTMLElement;
const commandEl = document.getElementById('command') as HTMLElement;
const detailEl = document.getElementById('detail') as HTMLElement;
const legendEl = document.getElementById('legend') as HTMLElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AMBIENT_ALPHA = 0.012;

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

/* Recent vaults: a small MRU list in the webview's local storage (the app's
   existing local-preference store — no extra fs permissions needed). */
const RECENT_KEY = 'eva-wiki:recent-vaults';
const MAX_RECENT = 5;

function getRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecents(paths: string[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
}

const basenameOf = (path: string): string =>
  path.replace(/\/+$/, '').split('/').pop() ?? path;

function renderRecents(errorMessage?: string): void {
  const recents = getRecents();
  recentEl.innerHTML = '';
  if (recents.length === 0 && !errorMessage) return;

  if (recents.length > 0) {
    const label = document.createElement('p');
    label.className = 'recent-label';
    label.textContent = 'Recent';
    recentEl.appendChild(label);
    for (const path of recents) {
      const row = document.createElement('button');
      row.className = 'recent-row';
      const name = document.createElement('span');
      name.className = 'recent-name';
      name.textContent = basenameOf(path);
      const full = document.createElement('span');
      full.className = 'recent-path';
      full.textContent = path;
      row.append(name, full);
      row.addEventListener('click', () => void openRecent(path));
      recentEl.appendChild(row);
    }
  }
  if (errorMessage) {
    const error = document.createElement('p');
    error.className = 'recent-error';
    error.textContent = errorMessage;
    recentEl.appendChild(error);
  }
}

async function openRecent(path: string): Promise<void> {
  try {
    await openVault(path);
  } catch {
    saveRecents(getRecents().filter((p) => p !== path));
    renderRecents(`Couldn't open ${basenameOf(path)} — removed from recent.`);
  }
}

async function chooseVault(): Promise<void> {
  const dir = await open({ directory: true, title: 'Open vault' });
  if (typeof dir === 'string') await openVault(dir);
}

async function openVault(root: string): Promise<void> {
  const files = await collectMarkdown(root);
  vault = buildVault(files);
  issues = lintVault(vault);
  saveRecents([root, ...getRecents().filter((p) => p !== root)]);
  renderRecents();
  vaultPathEl.textContent = `${basenameOf(root)} · ${vault.pages.length} pages`;
  vaultPathEl.title = root;
  emptyEl.hidden = true;
  commandEl.hidden = false;
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
  svg.classList.remove('focused');

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
    attachDrag(g, node);
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
    .force('collide', forceCollide(30))
    .on('tick', updatePositions);

  if (reducedMotion) {
    // Settle instantly: no ambient drift for reduced-motion users. The
    // simulation still exists so dragging can wake it, and its default
    // alphaMin lets it come to rest again afterwards.
    simulation.stop();
    simulation.tick(300);
    updatePositions();
  } else {
    // A small non-zero alpha target keeps the simulation breathing forever —
    // the graph should always feel alive beneath the vellum.
    simulation.alpha(0.9).alphaTarget(AMBIENT_ALPHA).alphaMin(0);
  }
}

/* Dragging: pointer events straight on the node group (the graph is hand-run
   SVG, not d3-selection). While dragging, fx/fy make the pointer authoritative
   over the simulation; on release they stay set, pinning the node while the
   rest of the graph keeps responding. */
function attachDrag(g: SVGGElement, node: SimNode): void {
  let activePointer: number | null = null;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const endDrag = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    try {
      g.releasePointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers are never captured */
    }
    g.classList.add('pinned');
    simulation?.alphaTarget(reducedMotion ? 0 : AMBIENT_ALPHA);
  };

  g.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    activePointer = event.pointerId;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    try {
      g.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
    node.fx = node.x;
    node.fy = node.y;
    simulation?.alphaTarget(0.3).restart();
  });

  g.addEventListener('pointermove', (event) => {
    if (activePointer !== event.pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 3) moved = true;
    // The SVG is viewport-fixed with no viewBox, so client coords are
    // simulation coords.
    node.fx = event.clientX;
    node.fy = event.clientY;
  });

  g.addEventListener('pointerup', endDrag);
  g.addEventListener('pointercancel', endDrag);

  g.addEventListener('click', (event) => {
    event.stopPropagation();
    if (moved) {
      moved = false;
      return; // a drag is not a selection
    }
    select(node.id);
  });
}

function select(id: string): void {
  if (!vault) return;
  const page = vault.byId.get(id);
  if (!page) return;

  // Focus the neighborhood: the selected node's edges become redlines and
  // define its neighbor set; everything outside recedes (dimmed, not hidden).
  const neighborhood = new Set<string>([id]);
  const lines = [...svg.querySelectorAll('line.edge')] as SVGLineElement[];
  for (const line of lines) {
    const touches = line.dataset.source === id || line.dataset.target === id;
    line.classList.toggle('lit', touches);
    if (touches) {
      neighborhood.add(line.dataset.source!);
      neighborhood.add(line.dataset.target!);
    }
  }
  for (const line of lines) {
    line.classList.toggle(
      'faded',
      !(neighborhood.has(line.dataset.source!) && neighborhood.has(line.dataset.target!)),
    );
  }
  svg.querySelectorAll('.node').forEach((el) => {
    const nodeId = el.getAttribute('data-id')!;
    el.classList.toggle('selected', nodeId === id);
    el.classList.toggle('faded', !neighborhood.has(nodeId));
  });
  svg.classList.add('focused');

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
  svg.classList.remove('focused');
  svg.querySelectorAll('.node.selected').forEach((el) => el.classList.remove('selected'));
  svg.querySelectorAll('.node.faded').forEach((el) => el.classList.remove('faded'));
  svg.querySelectorAll('line.edge').forEach((el) => el.classList.remove('lit', 'faded'));
}

document.getElementById('open-vault')!.addEventListener('click', () => void chooseVault());
document.getElementById('empty-open')!.addEventListener('click', () => void chooseVault());
document.getElementById('detail-close')!.addEventListener('click', deselect);
svg.addEventListener('click', deselect);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') deselect();
});

renderRecents();

// Dev-only test hooks (stripped from production builds): VITE_DEV_VAULT
// auto-opens a vault on launch and VITE_DEV_SELECT auto-selects a node, then
// a render report is POSTed back to the vite terminal for verification.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_VAULT) {
  void (async () => {
    const report = (payload: unknown) =>
      fetch('/__dev-report', { method: 'POST', body: JSON.stringify(payload) });
    try {
      await openVault(import.meta.env.VITE_DEV_VAULT as string);

      // Drag check: synthetic pointer sequence on the first node; it should
      // end up pinned at the drop point.
      const firstNode = svg.querySelector('.node') as SVGGElement;
      const match = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(
        firstNode.getAttribute('transform') ?? '',
      );
      const x0 = match ? parseFloat(match[1]) : 0;
      const y0 = match ? parseFloat(match[2]) : 0;
      const pointer = { bubbles: true, pointerId: 1, button: 0 };
      firstNode.dispatchEvent(
        new PointerEvent('pointerdown', { ...pointer, clientX: x0, clientY: y0 }),
      );
      firstNode.dispatchEvent(
        new PointerEvent('pointermove', { ...pointer, clientX: x0 + 60, clientY: y0 + 40 }),
      );
      firstNode.dispatchEvent(
        new PointerEvent('pointerup', { ...pointer, clientX: x0 + 60, clientY: y0 + 40 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
      const after = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(
        firstNode.getAttribute('transform') ?? '',
      );
      const drag = {
        pinned: firstNode.classList.contains('pinned'),
        atDropPoint:
          after !== null &&
          Math.abs(parseFloat(after[1]) - (x0 + 60)) < 1 &&
          Math.abs(parseFloat(after[2]) - (y0 + 40)) < 1,
      };

      const selectId = import.meta.env.VITE_DEV_SELECT as string | undefined;
      if (selectId) select(selectId);
      const types = [...new Set(vault!.pages.map((p) => p.type))];
      await report({
        pages: vault!.pages.length,
        renderedNodes: svg.querySelectorAll('.node').length,
        renderedEdges: svg.querySelectorAll('line.edge').length,
        colorsByType: Object.fromEntries(types.map((t) => [t ?? '(none)', colorFor(t)])),
        orphans: issues.filter((i) => i.rule === 'orphan').map((i) => i.page),
        emptyStateDisplay: getComputedStyle(emptyEl).display,
        recentVaults: getRecents(),
        drag,
        focus: {
          focused: svg.classList.contains('focused'),
          fadedNodes: svg.querySelectorAll('.node.faded').length,
          fadedEdges: svg.querySelectorAll('line.edge.faded').length,
          litEdges: svg.querySelectorAll('line.edge.lit').length,
        },
        selected: selectId ? { id: selectId, sidebarText: sidebar.innerText } : null,
      });
    } catch (error) {
      await report({ error: String(error) });
    }
  })();
}
