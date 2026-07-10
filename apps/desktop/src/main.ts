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

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('graph') as unknown as SVGSVGElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
const vaultPathEl = document.getElementById('vault-path') as HTMLElement;
const emptyEl = document.getElementById('empty') as HTMLElement;
const recentEl = document.getElementById('recent') as HTMLElement;
const recentPopEl = document.getElementById('recent-pop') as HTMLElement;
const recentToggleEl = document.getElementById('recent-toggle') as HTMLButtonElement;
const commandEl = document.getElementById('command') as HTMLElement;
const detailEl = document.getElementById('detail') as HTMLElement;
const legendEl = document.getElementById('legend') as HTMLElement;
const lintPanelEl = document.getElementById('lint-panel') as HTMLElement;
const lintSubEl = document.getElementById('lint-sub') as HTMLElement;
const lintBodyEl = document.getElementById('lint-body') as HTMLElement;
const logPanelEl = document.getElementById('log-panel') as HTMLElement;
const logSubEl = document.getElementById('log-sub') as HTMLElement;
const logBodyEl = document.getElementById('log-body') as HTMLElement;
const opLintEl = document.getElementById('op-lint') as HTMLButtonElement;
const opLogEl = document.getElementById('op-log') as HTMLButtonElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AMBIENT_ALPHA = 0.012;
const PANEL_MARGIN = 28;

let vault: Vault | null = null;
let issues: LintIssue[] = [];
let logRaw: string | null = null;
let simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> | null = null;
let simNodes: SimNode[] = [];
let refreshPositions: (() => void) | null = null;
let centerX = forceX<SimNode>(0);
let centerY = forceY<SimNode>(0);

/* Panel exclusion zones ------------------------------------------------------
   Every visible vellum sheet claims its bounding rect (plus a margin) as
   space the graph must not occupy. Rects are recomputed whenever a panel
   opens, closes, or changes content, and on window resize. */
let exclusionRects: Rect[] = [];

function updateExclusions(): void {
  exclusionRects = [...document.querySelectorAll<HTMLElement>('.glass')]
    .filter((el) => !el.hidden)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - PANEL_MARGIN,
        top: r.top - PANEL_MARGIN,
        right: r.right + PANEL_MARGIN,
        bottom: r.bottom + PANEL_MARGIN,
      };
    });
  // A panel may have opened over an already-pinned node; move the pin clear
  // so no node is ever left unreachable behind a sheet.
  let movedPin = false;
  for (const node of simNodes) {
    if (node.fx == null || node.fy == null) continue;
    const nudged = nudgeOutside(node.fx, node.fy);
    if (nudged.x !== node.fx || nudged.y !== node.fy) {
      node.fx = nudged.x;
      node.fy = nudged.y;
      movedPin = true;
    }
  }
  if (movedPin) {
    simulation?.tick(1);
    refreshPositions?.();
  }
  // Panels also define the usable field: keep the centering forces aimed at
  // the middle of the space between top- and bottom-docked panels.
  const center = usableCenter();
  centerX.x(center.x);
  centerY.y(center.y);
}

/** Center of the vertical space between top-docked and bottom-docked panels
    (side panels don't constrain the vertical field). */
function usableCenter(): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let top = 0;
  let bottom = h;
  for (const el of document.querySelectorAll<HTMLElement>('.glass')) {
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    const mid = (r.top + r.bottom) / 2;
    if (mid < h / 3) top = Math.max(top, r.bottom + PANEL_MARGIN);
    else if (mid > (2 * h) / 3) bottom = Math.min(bottom, r.top - PANEL_MARGIN);
  }
  if (bottom - top < h / 3) return { x: w / 2, y: h / 2 };
  return { x: w / 2, y: (top + bottom) / 2 };
}

const insideRect = (x: number, y: number, r: Rect): boolean =>
  x > r.left && x < r.right && y > r.top && y < r.bottom;

/** Nearest point just outside any exclusion rect, preferring exits that stay
    on screen. */
function nudgeOutside(x: number, y: number): { x: number; y: number } {
  let nx = x;
  let ny = y;
  for (const r of exclusionRects) {
    if (!insideRect(nx, ny, r)) continue;
    const candidates = [
      { d: nx - r.left, x: r.left - 4, y: ny },
      { d: r.right - nx, x: r.right + 4, y: ny },
      { d: ny - r.top, x: nx, y: r.top - 4 },
      { d: r.bottom - ny, x: nx, y: r.bottom + 4 },
    ].sort((a, b) => a.d - b.d);
    const pad = 12;
    const fits = (c: { x: number; y: number }) =>
      c.x > pad && c.x < window.innerWidth - pad && c.y > pad && c.y < window.innerHeight - pad;
    const pick = candidates.find(fits) ?? candidates[0];
    nx = pick.x;
    ny = pick.y;
  }
  return { x: nx, y: ny };
}

/* Custom d3 force: free nodes inside an exclusion rect are moved toward its
   nearest edge with a position correction (like forceCollide), so escape
   doesn't depend on alpha and can't reach equilibrium against link/centering
   forces — even during near-still ambient drift. Pinned nodes are user intent
   and are handled at drag release and in updateExclusions instead. */
function forcePanels() {
  let nodes: SimNode[] = [];
  const force = () => {
    for (const node of nodes) {
      if (node.fx != null) continue;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      for (const r of exclusionRects) {
        if (!insideRect(x, y, r)) continue;
        const dl = x - r.left;
        const dr = r.right - x;
        const dt = y - r.top;
        const db = r.bottom - y;
        const min = Math.min(dl, dr, dt, db);
        const step = Math.max(1.5, 0.25 * (min + 10));
        if (min === dl) node.x = x - step;
        else if (min === dr) node.x = x + step;
        else if (min === dt) node.y = y - step;
        else node.y = y + step;
        // kill momentum carrying the node deeper into the panel
        node.vx = (node.vx ?? 0) * 0.6;
        node.vy = (node.vy ?? 0) * 0.6;
      }
    }
  };
  force.initialize = (n: SimNode[]) => {
    nodes = n;
  };
  return force;
}
const panelForce = forcePanels();

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

function renderRecentsInto(container: HTMLElement, errorMessage?: string): void {
  const recents = getRecents();
  container.innerHTML = '';
  if (recents.length === 0 && !errorMessage) return;

  if (recents.length > 0) {
    const label = document.createElement('p');
    label.className = 'recent-label';
    label.textContent = 'Recent';
    container.appendChild(label);
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
      container.appendChild(row);
    }
  }
  if (errorMessage) {
    const error = document.createElement('p');
    error.className = 'recent-error';
    error.textContent = errorMessage;
    container.appendChild(error);
  }
}

function refreshRecentViews(errorMessage?: string): void {
  renderRecentsInto(recentEl, errorMessage);
  if (!recentPopEl.hidden) renderRecentsInto(recentPopEl, errorMessage);
}

async function openRecent(path: string): Promise<void> {
  try {
    await openVault(path);
  } catch {
    saveRecents(getRecents().filter((p) => p !== path));
    refreshRecentViews(`Couldn't open ${basenameOf(path)} — removed from recent.`);
  }
}

async function chooseVault(): Promise<void> {
  const dir = await open({ directory: true, title: 'Open vault' });
  if (typeof dir === 'string') await openVault(dir);
}

async function openVault(root: string): Promise<void> {
  // A root-level log.md is the vault's operation record, not wiki content:
  // it feeds the Log view and stays out of the graph and the linter.
  const rootEntries = await readDir(root);
  const logName = rootEntries.find((e) => e.isFile && e.name.toLowerCase() === 'log.md')?.name;
  logRaw = logName ? await readTextFile(`${root}/${logName}`) : null;

  const files = (await collectMarkdown(root)).filter((f) => f.path.toLowerCase() !== 'log.md');
  vault = buildVault(files);
  issues = lintVault(vault);
  saveRecents([root, ...getRecents().filter((p) => p !== root)]);
  recentPopEl.hidden = true;
  refreshRecentViews();
  vaultPathEl.textContent = `${basenameOf(root)} · ${vault.pages.length} pages`;
  vaultPathEl.title = root;
  emptyEl.hidden = true;
  commandEl.hidden = false;
  closeSidePanels();
  renderLegend();
  renderGraph(buildGraph(vault));
  updateExclusions();
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
  // Seed nodes around the usable center: d3's default seeding spirals around
  // the origin — the top-left corner, inside the toolbar's exclusion zone —
  // which strands the cluster along the top edge once the settle phase is
  // spent fighting the panel force.
  const center = usableCenter();
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const nodes: SimNode[] = graph.nodes.map((n, i) => ({
    ...n,
    x: center.x + 42 * Math.sqrt(i + 0.5) * Math.cos(i * GOLDEN_ANGLE),
    y: center.y + 42 * Math.sqrt(i + 0.5) * Math.sin(i * GOLDEN_ANGLE),
  }));
  simNodes = nodes;
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
  refreshPositions = updatePositions;

  centerX = forceX<SimNode>(center.x).strength(0.045);
  centerY = forceY<SimNode>(center.y).strength(0.055);

  simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance(95),
    )
    .force('charge', forceManyBody().strength(-320))
    .force('x', centerX)
    .force('y', centerY)
    .force('collide', forceCollide(30))
    .force('panels', panelForce)
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
   over the simulation — including over the panel force; on release the drop
   point is nudged clear of any panel, then stays pinned. */
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
    // Respect the drag's intent, but never let a node rest somewhere
    // unreachable: if it was dropped inside a panel, move it (pin included)
    // to the nearest point just outside.
    const nudged = nudgeOutside(node.fx ?? node.x ?? 0, node.fy ?? node.y ?? 0);
    node.fx = nudged.x;
    node.fy = nudged.y;
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
  updateExclusions();
}

function deselect(): void {
  detailEl.hidden = true;
  svg.classList.remove('focused');
  svg.querySelectorAll('.node.selected').forEach((el) => el.classList.remove('selected'));
  svg.querySelectorAll('.node.faded').forEach((el) => el.classList.remove('faded'));
  svg.querySelectorAll('line.edge').forEach((el) => el.classList.remove('lit', 'faded'));
  updateExclusions();
}

/* Operation panels: lint and log share the left dock, one at a time -------- */
function syncOpButtons(): void {
  opLintEl.classList.toggle('active', !lintPanelEl.hidden);
  opLintEl.setAttribute('aria-pressed', String(!lintPanelEl.hidden));
  opLogEl.classList.toggle('active', !logPanelEl.hidden);
  opLogEl.setAttribute('aria-pressed', String(!logPanelEl.hidden));
}

function closeSidePanels(): void {
  lintPanelEl.hidden = true;
  logPanelEl.hidden = true;
  syncOpButtons();
  updateExclusions();
}

function toggleSidePanel(which: 'lint' | 'log'): void {
  const target = which === 'lint' ? lintPanelEl : logPanelEl;
  const other = which === 'lint' ? logPanelEl : lintPanelEl;
  const opening = target.hidden;
  other.hidden = true;
  target.hidden = !opening;
  if (opening) {
    if (which === 'lint') renderLintPanel();
    else renderLogPanel();
  }
  syncOpButtons();
  updateExclusions();
}

function renderLintPanel(): void {
  if (!vault) return;
  lintSubEl.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'} · ${vault.pages.length} pages · deterministic rules`;
  lintBodyEl.innerHTML = '';

  if (issues.length === 0) {
    const clean = document.createElement('p');
    clean.className = 'lint-clean';
    clean.textContent = 'No issues. Clean copy.';
    lintBodyEl.appendChild(clean);
  } else {
    for (const page of vault.pages) {
      const pageIssues = issues.filter((issue) => issue.page === page.id);
      if (pageIssues.length === 0) continue;
      const group = document.createElement('div');
      group.className = 'lint-group';
      const name = document.createElement('button');
      name.className = 'lint-page-name';
      name.textContent = page.id;
      name.addEventListener('click', () => select(page.id));
      group.appendChild(name);
      for (const issue of pageIssues) {
        const row = document.createElement('button');
        row.className = `issue issue-${issue.rule}`;
        row.dataset.rule = issue.rule;
        row.textContent = issue.message;
        row.addEventListener('click', () => select(issue.page));
        group.appendChild(row);
      }
      lintBodyEl.appendChild(group);
    }
  }

  // The agent-backed checks aren't built yet; they keep their slot so the
  // panel doesn't need a redesign when they arrive.
  const agent = document.createElement('div');
  agent.className = 'agent-section';
  const agentLabel = document.createElement('p');
  agentLabel.className = 'recent-label';
  agentLabel.textContent = 'Requires agent';
  agent.appendChild(agentLabel);
  const checks: Array<[string, string]> = [
    ['Contradictions', 'Claims that disagree between pages.'],
    ['Coverage gaps', "Questions the vault can't answer yet."],
    ['Stale claims', 'Facts likely to have aged out of date.'],
  ];
  for (const [name, desc] of checks) {
    const row = document.createElement('div');
    row.className = 'agent-check';
    const title = document.createElement('span');
    title.className = 'agent-check-name';
    title.textContent = name;
    const soon = document.createElement('span');
    soon.className = 'soon';
    soon.textContent = 'soon';
    const body = document.createElement('p');
    body.className = 'agent-check-desc';
    body.textContent = desc;
    row.append(title, soon, body);
    agent.appendChild(row);
  }
  lintBodyEl.appendChild(agent);
}

interface LogEntry {
  date: string;
  op: string | null;
  title: string;
  body: string;
}

/** Parse `## [date] operation | title` entries; null if none match. */
function parseLog(markdown: string): LogEntry[] | null {
  const HEAD = /^##\s*\[([^\]]+)\]\s*([A-Za-z-]+)?\s*(?:\|\s*)?(.*)$/;
  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = HEAD.exec(line);
    if (match) {
      if (current) entries.push(current);
      current = { date: match[1], op: match[2] ?? null, title: match[3].trim(), body: '' };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) entries.push(current);
  return entries.length > 0 ? entries : null;
}

function renderLogPanel(): void {
  logBodyEl.innerHTML = '';
  if (logRaw === null) {
    logSubEl.textContent = 'no log.md in this vault';
    const empty = document.createElement('p');
    empty.className = 'log-empty';
    empty.textContent =
      'No log yet. Once ingest and query run against this vault, every ' +
      'operation is recorded here — what changed, when, and why.';
    logBodyEl.appendChild(empty);
    return;
  }
  const entries = parseLog(logRaw);
  if (entries === null) {
    logSubEl.textContent = 'log.md · unstructured';
    const raw = document.createElement('pre');
    raw.className = 'log-raw';
    raw.textContent = logRaw.trim();
    logBodyEl.appendChild(raw);
    return;
  }
  logSubEl.textContent = `log.md · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · newest first`;
  for (const entry of [...entries].reverse()) {
    const item = document.createElement('div');
    item.className = 'log-entry';
    const head = document.createElement('div');
    head.className = 'log-entry-head';
    const date = document.createElement('span');
    date.className = 'log-date';
    date.textContent = entry.date;
    head.appendChild(date);
    if (entry.op) {
      const op = document.createElement('span');
      op.className = 'log-op';
      op.textContent = entry.op;
      head.appendChild(op);
    }
    const title = document.createElement('span');
    title.className = 'log-title';
    title.textContent = entry.title;
    const body = document.createElement('p');
    body.className = 'log-body';
    body.textContent = entry.body.trim();
    item.append(head, title);
    if (entry.body.trim()) item.appendChild(body);
    logBodyEl.appendChild(item);
  }
}

/* Wiring -------------------------------------------------------------------- */
document.getElementById('open-vault')!.addEventListener('click', () => void chooseVault());
document.getElementById('empty-open')!.addEventListener('click', () => void chooseVault());
document.getElementById('detail-close')!.addEventListener('click', deselect);
opLintEl.addEventListener('click', () => toggleSidePanel('lint'));
opLogEl.addEventListener('click', () => toggleSidePanel('log'));
document.querySelectorAll<HTMLButtonElement>('.panel-close[data-panel]').forEach((btn) =>
  btn.addEventListener('click', closeSidePanels),
);

recentToggleEl.addEventListener('click', (event) => {
  event.stopPropagation();
  recentPopEl.hidden = !recentPopEl.hidden;
  if (!recentPopEl.hidden) renderRecentsInto(recentPopEl);
  updateExclusions();
});
document.addEventListener('click', (event) => {
  if (recentPopEl.hidden) return;
  if (!recentPopEl.contains(event.target as Node)) {
    recentPopEl.hidden = true;
    updateExclusions();
  }
});

svg.addEventListener('click', deselect);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!recentPopEl.hidden) {
    recentPopEl.hidden = true;
    updateExclusions();
    return;
  }
  if (!lintPanelEl.hidden || !logPanelEl.hidden) {
    closeSidePanels();
    return;
  }
  deselect();
});

window.addEventListener('resize', () => {
  updateExclusions(); // also re-aims the centering forces at the usable center
  if (!simulation) return;
  if (reducedMotion) {
    simulation.tick(120);
    refreshPositions?.();
  } else {
    simulation.alpha(Math.max(simulation.alpha(), 0.25));
  }
});

renderRecentsInto(recentEl);
updateExclusions();

// Dev-only test hooks (stripped from production builds): VITE_DEV_VAULT
// auto-opens a vault on launch and VITE_DEV_SELECT auto-selects a node, then
// a render report is POSTed back to the vite terminal for verification.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_VAULT) {
  void (async () => {
    const report = (payload: unknown) =>
      fetch('/__dev-report', { method: 'POST', body: JSON.stringify(payload) });
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const nodePos = (g: Element): { x: number; y: number } => {
      const m = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
      return { x: m ? parseFloat(m[1]) : 0, y: m ? parseFloat(m[2]) : 0 };
    };
    const rawPanelRects = () =>
      [...document.querySelectorAll<HTMLElement>('.glass')]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect());
    const insideAnyPanel = (x: number, y: number) =>
      rawPanelRects().some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
    try {
      await openVault(import.meta.env.VITE_DEV_VAULT as string);
      await sleep(1500); // let the simulation settle and clear the panels

      const nodesInsidePanels = [...svg.querySelectorAll('.node')].filter((g) => {
        const p = nodePos(g);
        return insideAnyPanel(p.x, p.y);
      }).length;

      // Vertical distribution: nodes should spread around the usable center,
      // not bunch along the top edge — at default size and when taller.
      const yStats = () => {
        const ys = [...svg.querySelectorAll('.node')].map((g) => nodePos(g).y);
        return {
          h: window.innerHeight,
          min: Math.round(Math.min(...ys)),
          max: Math.round(Math.max(...ys)),
          mean: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length),
        };
      };
      const spread: { default: unknown; tall: unknown } = { default: yStats(), tall: null };
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(1200, 1000));
        await sleep(1800);
        spread.tall = yStats();
        await win.setSize(new LogicalSize(1200, 800));
        await sleep(800);
      } catch (error) {
        spread.tall = { error: String(error) };
      }

      // Drag a node to the middle of the toolbar; on release it must be
      // nudged clear, stay pinned, and remain clickable.
      const toolbarRect = commandEl.getBoundingClientRect();
      const target = {
        x: toolbarRect.left + toolbarRect.width / 2,
        y: toolbarRect.top + toolbarRect.height / 2,
      };
      const firstNode = svg.querySelector('.node') as SVGGElement;
      const from = nodePos(firstNode);
      const pointer = { bubbles: true, pointerId: 1, button: 0 };
      firstNode.dispatchEvent(
        new PointerEvent('pointerdown', { ...pointer, clientX: from.x, clientY: from.y }),
      );
      firstNode.dispatchEvent(
        new PointerEvent('pointermove', { ...pointer, clientX: target.x, clientY: target.y }),
      );
      firstNode.dispatchEvent(
        new PointerEvent('pointerup', { ...pointer, clientX: target.x, clientY: target.y }),
      );
      await sleep(400);
      const dropped = nodePos(firstNode);
      const drag = {
        pinned: firstNode.classList.contains('pinned'),
        droppedInsidePanel: insideAnyPanel(dropped.x, dropped.y),
        clearOfToolbar: !(
          dropped.x > toolbarRect.left &&
          dropped.x < toolbarRect.right &&
          dropped.y > toolbarRect.top &&
          dropped.y < toolbarRect.bottom
        ),
      };
      window.dispatchEvent(new Event('resize')); // exercise the resize path

      opLintEl.click();
      const lint = {
        open: !lintPanelEl.hidden,
        issueRows: lintBodyEl.querySelectorAll('button.issue').length,
        agentChecks: lintBodyEl.querySelectorAll('.agent-check').length,
        sub: lintSubEl.textContent,
      };
      opLogEl.click();
      const log = {
        open: !logPanelEl.hidden,
        lintClosed: lintPanelEl.hidden,
        hasLog: logRaw !== null,
        entries: logBodyEl.querySelectorAll('.log-entry').length,
        firstEntryDate: logBodyEl.querySelector('.log-date')?.textContent ?? null,
        emptyText: logBodyEl.querySelector('.log-empty')?.textContent?.slice(0, 60) ?? null,
        sub: logSubEl.textContent,
      };
      opLogEl.click(); // close again

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
        ops: {
          ingestDisabled: (document.getElementById('op-ingest') as HTMLButtonElement).disabled,
          queryDisabled: (document.getElementById('op-query') as HTMLButtonElement).disabled,
        },
        nodesInsidePanels,
        verticalSpread: spread,
        drag,
        lint,
        log,
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
