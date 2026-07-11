import '@fontsource/fragment-mono';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/newsreader';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import {
  appLanguagePreference,
  currentLocale,
  localeNames,
  locales,
  setAppLanguage,
  t,
  type AppLanguage,
  type TranslationKey,
} from './i18n';
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
  entity: '#5c7150',
  summary: '#8c6a4f',
  analysis: '#7c5b78',
  log: '#8b887a',
};
const FALLBACK_COLOR = '#a6a294';
const TYPE_ORDER = ['index', 'entity', 'concept', 'summary', 'analysis', 'person', 'project', 'note', 'log'];

const BRAIN_PROFILES = [
  {
    id: 'personal',
    label: 'Personal',
    detail: 'Goals, observations, reflections, and a private timeline.',
    modules: ['goals', 'observations', 'journal', 'timeline'],
    tools: [{ id: 'personal-review', label: 'Reflection', detail: 'Trace patterns, movement, and questions across the record.' }],
    purposeLabel: 'What would you like to track?',
    purposePlaceholder: 'Goals, habits, health observations, or a question you want to understand…',
  },
  {
    id: 'research',
    label: 'Research',
    detail: 'A thesis, evidence, contradictions, and open questions.',
    modules: ['thesis', 'evidence', 'contradictions', 'bibliography'],
    tools: [{ id: 'evidence-map', label: 'Evidence map', detail: 'Lay out claims, support, challenges, and the next question.' }],
    purposeLabel: 'What question are you investigating?',
    purposePlaceholder: 'The topic, question, or thesis you want this brain to develop…',
  },
  {
    id: 'reading',
    label: 'Reading companion',
    detail: 'Chapters, characters, plot threads, themes, and chronology.',
    modules: ['chapters', 'characters', 'threads', 'themes'],
    tools: [{ id: 'reading-threads', label: 'Threads map', detail: 'Connect characters, events, and themes without inventing later material.' }],
    purposeLabel: 'Which book or text are you following?',
    purposePlaceholder: 'Title, author, and any spoiler boundary you want Eva to respect…',
  },
  {
    id: 'business',
    label: 'Business record',
    detail: 'Projects, decisions, meetings, risks, and local operating context.',
    modules: ['projects', 'decisions', 'meetings', 'risks'],
    tools: [{ id: 'decision-brief', label: 'Decision brief', detail: 'Bring together options, owners, evidence, risks, and open questions.' }],
    purposeLabel: 'What business context should this brain maintain?',
    purposePlaceholder: 'A team, company, customer area, project, or decision space…',
  },
  {
    id: 'planning',
    label: 'Planning',
    detail: 'Objectives, constraints, options, decisions, and a living plan.',
    modules: ['objectives', 'constraints', 'options', 'timeline'],
    tools: [{ id: 'options-review', label: 'Options review', detail: 'Compare live choices against objectives, constraints, and trade-offs.' }],
    purposeLabel: 'What are you planning?',
    purposePlaceholder: 'A trip, project, purchase, move, or other decision you are working through…',
  },
  {
    id: 'course',
    label: 'Course and learning',
    detail: 'Concepts, materials, practice gaps, and revision prompts.',
    modules: ['concepts', 'materials', 'practice', 'revision'],
    tools: [
      { id: 'flashcards', label: 'Flashcards', detail: 'Create active-recall cards from the material already in this brain.' },
      { id: 'practice-exam', label: 'Practice exam', detail: 'Build a mixed exam with an evidence-grounded answer key.' },
    ],
    purposeLabel: 'What are you learning?',
    purposePlaceholder: 'The course, subject, skill, or syllabus you want to master…',
  },
  {
    id: 'blank',
    label: 'Blank / custom',
    detail: 'A clean Eva standard with only the structure you choose to add.',
    modules: ['knowledge-base'],
    tools: [],
    purposeLabel: 'What is this brain for?',
    purposePlaceholder: 'Track a research topic, plan a trip, understand a company…',
  },
] as const;

type BrainProfileId = (typeof BRAIN_PROFILES)[number]['id'];
type ProfileToolId = (typeof BRAIN_PROFILES)[number]['tools'][number]['id'];

function profileDefinition(id: string): (typeof BRAIN_PROFILES)[number] {
  return BRAIN_PROFILES.find((profile) => profile.id === id) ?? BRAIN_PROFILES.at(-1)!;
}

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
const commandEl = document.getElementById('command') as HTMLElement;
const operationScrimEl = document.getElementById('operation-scrim') as HTMLElement;
const detailEl = document.getElementById('detail') as HTMLElement;
const legendEl = document.getElementById('legend') as HTMLElement;
const lintPanelEl = document.getElementById('lint-panel') as HTMLElement;
const lintSubEl = document.getElementById('lint-sub') as HTMLElement;
const lintBodyEl = document.getElementById('lint-body') as HTMLElement;
const logPanelEl = document.getElementById('log-panel') as HTMLElement;
const logSubEl = document.getElementById('log-sub') as HTMLElement;
const logBodyEl = document.getElementById('log-body') as HTMLElement;
const opIngestEl = document.getElementById('op-ingest') as HTMLButtonElement;
const opQueryEl = document.getElementById('op-query') as HTMLButtonElement;
const opProfileToolsEl = document.getElementById('op-profile-tools') as HTMLButtonElement;
const opLintEl = document.getElementById('op-lint') as HTMLButtonElement;
const opLogEl = document.getElementById('op-log') as HTMLButtonElement;
const reorganizeGraphEl = document.getElementById('reorganize-graph') as HTMLButtonElement;
const ingestStatusEl = document.getElementById('ingest-status') as HTMLElement;
const reviewEl = document.getElementById('review') as HTMLElement;
const reviewTitleEl = document.getElementById('review-title') as HTMLElement;
const reviewSubEl = document.getElementById('review-sub') as HTMLElement;
const reviewIssuesEl = document.getElementById('review-issues') as HTMLElement;
const reviewPatchEl = document.getElementById('review-patch') as HTMLElement;
const queryPanelEl = document.getElementById('query-panel') as HTMLElement;
const queryFormEl = document.getElementById('query-form') as HTMLFormElement;
const queryQuestionEl = document.getElementById('query-question') as HTMLTextAreaElement;
const queryErrorEl = document.getElementById('query-error') as HTMLElement;
const queryStatusEl = document.getElementById('query-status') as HTMLElement;
const querySubmitEl = document.getElementById('query-submit') as HTMLButtonElement;
const queryResultEl = document.getElementById('query-result') as HTMLElement;
const queryAnswerEl = document.getElementById('query-answer') as HTMLElement;
const queryCitationsEl = document.getElementById('query-citations') as HTMLElement;
const querySaveEl = document.getElementById('query-save') as HTMLButtonElement;
const profileToolsEl = document.getElementById('profile-tools') as HTMLElement;
const profileToolsKickerEl = document.getElementById('profile-tools-kicker') as HTMLElement;
const profileToolsCopyEl = document.getElementById('profile-tools-copy') as HTMLElement;
const profileToolsListEl = document.getElementById('profile-tools-list') as HTMLElement;
const profileToolsErrorEl = document.getElementById('profile-tools-error') as HTMLElement;
const profileToolsStatusEl = document.getElementById('profile-tools-status') as HTMLElement;
const profileToolsResultEl = document.getElementById('profile-tools-result') as HTMLElement;
const profileToolsResultTitleEl = document.getElementById('profile-tools-result-title') as HTMLElement;
const profileToolsContentEl = document.getElementById('profile-tools-content') as HTMLElement;
const profileToolsCitationsEl = document.getElementById('profile-tools-citations') as HTMLElement;
const profileToolsSaveEl = document.getElementById('profile-tools-save') as HTMLButtonElement;
const brainLibraryEl = document.getElementById('brain-library') as HTMLElement;
const brainLibraryBodyEl = document.getElementById('brain-library-body') as HTMLElement;
const brainLibraryErrorEl = document.getElementById('brain-library-error') as HTMLElement;
const brainLibraryImportEl = document.getElementById('brain-library-import') as HTMLButtonElement;
const brainManagerEl = document.getElementById('brain-manager') as HTMLElement;
const brainManagerListEl = document.getElementById('brain-manager-list') as HTMLElement;
const brainManagerFormEl = document.getElementById('brain-manager-form') as HTMLFormElement;
const brainManagerNameEl = document.getElementById('brain-manager-name') as HTMLElement;
const brainManagerPathEl = document.getElementById('brain-manager-path') as HTMLElement;
const brainManagerProfileEl = document.getElementById('brain-manager-profile') as HTMLSelectElement;
const brainManagerModulesEl = document.getElementById('brain-manager-modules') as HTMLElement;
const brainManagerLanguageEl = document.getElementById('brain-manager-language') as HTMLInputElement;
const brainManagerAgentEls = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="brain-manager-agent"]'),
);
const brainManagerPurposeEl = document.getElementById('brain-manager-purpose') as HTMLTextAreaElement;
const brainManagerErrorEl = document.getElementById('brain-manager-error') as HTMLElement;
const brainManagerStatusEl = document.getElementById('brain-manager-status') as HTMLElement;
const brainManagerSaveEl = document.getElementById('brain-manager-save') as HTMLButtonElement;
const appSettingsEl = document.getElementById('app-settings') as HTMLElement;
const appLanguageEl = document.getElementById('app-language') as HTMLSelectElement;
const appSettingsStatusEl = document.getElementById('app-settings-status') as HTMLElement;
const newVaultEl = document.getElementById('new-vault') as HTMLElement;
const newVaultFormEl = document.getElementById('new-vault-form') as HTMLFormElement;
const newVaultNameEl = document.getElementById('new-vault-name') as HTMLInputElement;
const newVaultProfileEl = document.getElementById('new-vault-profile') as HTMLSelectElement;
const newVaultProfileDetailEl = document.getElementById('new-vault-profile-detail') as HTMLElement;
const newVaultLanguageEl = document.getElementById('new-vault-language') as HTMLInputElement;
const newVaultAgentEls = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="new-vault-agent"]'),
);
const newVaultPurposeEl = document.getElementById('new-vault-purpose') as HTMLTextAreaElement;
const newVaultPurposeLabelEl = document.getElementById('new-vault-purpose-label') as HTMLElement;
const newVaultErrorEl = document.getElementById('new-vault-error') as HTMLElement;
const newVaultCreateEl = document.getElementById('new-vault-create') as HTMLButtonElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AMBIENT_ALPHA = 0.0015;
const PANEL_MARGIN = 28;
const INFRA_FILES = new Set(['log.md', 'eva.md', 'agents.md', 'claude.md']);

let vault: Vault | null = null;
let issues: LintIssue[] = [];
let logRaw: string | null = null;
let currentVault: string | null = null;
let simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> | null = null;
let simNodes: SimNode[] = [];
let refreshPositions: (() => void) | null = null;
let centerX = forceX<SimNode>(0);
let centerY = forceY<SimNode>(0);
let homeCenterX = forceX<SimNode>(0).strength(0);
let homeCenterY = forceY<SimNode>(0).strength(0);
let reviewId: number | null = null;
let reviewKind: 'ingest' | 'query' | null = null;
let latestQuery: { question: string; answer: QueryAnswer } | null = null;
let currentBrainSettings: BrainSettings | null = null;
let latestProfileTool: { tool: ProfileToolId; title: string; answer: QueryAnswer } | null = null;
let profileToolRunning = false;
let healthReport: HealthReport | null = null;
let healthError: string | null = null;
let healthCheckRunning = false;
let brainLibraryLoading = false;
let brainManagerLoading = false;
let brainManagerSaving = false;
let brainManagerRequest = 0;
let brainManagerBrains: BrainEntry[] = [];
let brainManagerSelectedPath: string | null = null;
let brainManagerSettings: BrainSettings | null = null;
let brainManagerLoadError: string | null = null;
const agentActive = new Set<string>();

function populateAppLanguageOptions(): void {
  const preference = appLanguagePreference();
  appLanguageEl.innerHTML = '';
  const system = document.createElement('option');
  system.value = 'system';
  system.textContent = t('settings.system');
  appLanguageEl.appendChild(system);
  for (const locale of locales) {
    const option = document.createElement('option');
    option.value = locale;
    option.textContent = localeNames[locale];
    appLanguageEl.appendChild(option);
  }
  appLanguageEl.value = preference;
}

function populateBrainProfileOptions(select: HTMLSelectElement, selected: string): void {
  select.innerHTML = '';
  for (const profile of BRAIN_PROFILES) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.label;
    select.appendChild(option);
  }
  select.value = profileDefinition(selected).id;
}

function selectedNewVaultProfile(): BrainProfileId {
  return profileDefinition(newVaultProfileEl.value).id;
}

function updateNewVaultProfileFrame(): void {
  const profile = profileDefinition(selectedNewVaultProfile());
  newVaultProfileDetailEl.textContent = profile.detail;
  newVaultPurposeLabelEl.textContent = profile.purposeLabel;
  newVaultPurposeEl.placeholder = profile.purposePlaceholder;
}

function applyInterfaceLanguage(): void {
  document.documentElement.lang = currentLocale();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n as TranslationKey);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder as TranslationKey));
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    element.title = t(element.dataset.i18nTitle as TranslationKey);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel as TranslationKey));
  });
  populateAppLanguageOptions();
  populateBrainProfileOptions(newVaultProfileEl, newVaultProfileEl.value || 'research');
  updateNewVaultProfileFrame();
  if (!currentVault) vaultPathEl.textContent = t('nav.noBrain');
  refreshRecentViews();
  if (!brainLibraryEl.hidden) void loadBrainLibrary();
  if (!brainManagerEl.hidden) renderBrainManager();
  if (!lintPanelEl.hidden) renderLintPanel();
  if (!logPanelEl.hidden) renderLogPanel();
  if (!queryPanelEl.hidden && !queryPanelEl.classList.contains('is-processing')) setQueryRunning(false);
}

function setAppSettingsStatus(message: string | null): void {
  appSettingsStatusEl.hidden = !message;
  appSettingsStatusEl.textContent = message ?? '';
}

/* Panel exclusion zones ------------------------------------------------------
   Every visible vellum sheet claims its bounding rect (plus a margin) as
   space the graph must not occupy. Rects are recomputed whenever a panel
   opens, closes, or changes content, and on window resize. */
let exclusionRects: Rect[] = [];

function updateExclusions(): void {
  exclusionRects = [...document.querySelectorAll<HTMLElement>('.glass')]
    .filter((el) => !el.hidden && !el.classList.contains('operation-modal'))
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
    if (isHomeNode(node)) continue;
    const nudged = nudgeOutside(node.fx, node.fy);
    const safe = keepNodeInViewport(nudged.x, nudged.y, nodeCollisionRadius(node));
    if (safe.x !== node.fx || safe.y !== node.fy) {
      node.fx = safe.x;
      node.fy = safe.y;
      movedPin = true;
    }
  }
  if (movedPin) {
    simulation?.tick(1);
    refreshPositions?.();
  }
  // Keep the graph's reference point at the literal page center. Panels are
  // still handled by the dedicated exclusion force.
  const center = pageCenter();
  centerX.x(center.x);
  centerY.y(center.y);
  homeCenterX.x((node) => (isHomeNode(node) ? center.x : 0));
  homeCenterY.y((node) => (isHomeNode(node) ? center.y : 0));
}

function pageCenter(): { x: number; y: number } {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LAYOUT_START_ALPHA = 0.16;
const LAYOUT_REORGANIZE_ALPHA = 0.2;
const LAYOUT_ALPHA_DECAY = 0.006;
const LAYOUT_VELOCITY_DECAY = 0.78;

function isHomeNode(node: Pick<SimNode, 'id' | 'type'>): boolean {
  return node.id === 'index' || node.type === 'index';
}

// Labels are the reading surface of a brain graph, so their width belongs in
// the layout's physical model—not merely in the SVG paint. The cap keeps a
// single long title from claiming the entire canvas.
function nodeCollisionRadius(node: Pick<SimNode, 'title'>): number {
  return Math.min(150, Math.max(42, 20 + node.title.length * 3.1));
}

function keepNodeInViewport(x: number, y: number, radius: number): { x: number; y: number } {
  const padding = 18;
  const clamp = (value: number, min: number, max: number) =>
    min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  return {
    x: clamp(x, padding + radius, window.innerWidth - padding - radius),
    y: clamp(y, padding + radius, window.innerHeight - padding - radius),
  };
}

function forceViewportBounds() {
  let nodes: SimNode[] = [];
  const force = () => {
    for (const node of nodes) {
      if (isHomeNode(node)) continue;
      // A pin is explicit human placement. Only constrain the automatic
      // layout, so every node remains freely draggable.
      if (node.fx != null || node.fy != null) continue;
      const safe = keepNodeInViewport(node.x ?? 0, node.y ?? 0, nodeCollisionRadius(node));
      if (safe.x !== node.x) node.vx = (node.vx ?? 0) * 0.35;
      if (safe.y !== node.y) node.vy = (node.vy ?? 0) * 0.35;
      node.x = safe.x;
      node.y = safe.y;
    }
  };
  force.initialize = (next: SimNode[]) => {
    nodes = next;
  };
  return force;
}

const viewportBoundsForce = forceViewportBounds();

function seedGraphNodes(nodes: SimNode[], center: { x: number; y: number }): void {
  const home = nodes.find(isHomeNode);
  if (home) {
    home.x = center.x;
    home.y = center.y;
    home.vx = 0;
    home.vy = 0;
  }
  const satellites = nodes.filter((node) => node !== home);
  for (const [index, node] of satellites.entries()) {
    const radius = 190 + 90 * Math.sqrt(index + 0.5);
    node.x = center.x + radius * Math.cos(index * GOLDEN_ANGLE);
    node.y = center.y + radius * Math.sin(index * GOLDEN_ANGLE);
    node.vx = 0;
    node.vy = 0;
  }
}

function reorganizeGraph(): void {
  if (!simulation || simNodes.length === 0) return;
  const center = pageCenter();
  for (const node of simNodes) {
    node.fx = null;
    node.fy = null;
    node.vx = 0;
    node.vy = 0;
  }
  svg.querySelectorAll('.node.pinned').forEach((node) => node.classList.remove('pinned'));
  centerX.x(center.x);
  centerY.y(center.y);
  homeCenterX.x((node) => (isHomeNode(node) ? center.x : 0));
  homeCenterY.y((node) => (isHomeNode(node) ? center.y : 0));

  if (reducedMotion) {
    simulation.stop();
    simulation.alpha(1).tick(420);
    refreshPositions?.();
  } else {
    simulation.alpha(LAYOUT_REORGANIZE_ALPHA).alphaTarget(AMBIENT_ALPHA).restart();
  }
  setIngestStatus('Graph reorganized', false);
}

async function collectMarkdown(root: string, rel = ''): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  const entries = await readDir(rel ? `${root}/${rel}` : root);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      // raw/ holds source documents, not wiki pages
      if (rel === '' && entry.name === 'raw') continue;
      files.push(...(await collectMarkdown(root, entryRel)));
    } else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
      // Root-level instructions and logs are not wiki pages. `index.md` is
      // deliberately included: it is the brain's Home node and graph hub.
      if (rel === '' && INFRA_FILES.has(entry.name.toLowerCase())) continue;
      files.push({ path: entryRel, content: await readTextFile(`${root}/${entryRel}`) });
    }
  }
  return files;
}

/* Recent brains: a small MRU list in the webview's local storage (the app's
   existing local-preference store — no extra fs permissions needed). */
const RECENT_KEY = 'eva:recent-brains';
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
    label.textContent = t('recent.label');
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
}

async function openRecent(path: string): Promise<void> {
  try {
    await openVault(path);
  } catch {
    saveRecents(getRecents().filter((p) => p !== path));
    refreshRecentViews(`Couldn't open ${basenameOf(path)} — removed from recent.`);
  }
}

interface BrainEntry {
  name: string;
  path: string;
}

interface BrainSettings extends BrainEntry {
  profile: BrainProfileId;
  modules: string[];
  language: string;
  agent: 'codex' | 'claude';
  purpose: string;
}

function setBrainLibraryError(message: string | null): void {
  brainLibraryErrorEl.hidden = !message;
  brainLibraryErrorEl.textContent = message ?? '';
}

function renderBrainLibrary(brains: BrainEntry[] = []): void {
  brainLibraryBodyEl.innerHTML = '';
  if (brainLibraryLoading) {
    const loading = document.createElement('p');
    loading.className = 'brain-library-loading';
    loading.textContent = 'Reading your brains…';
    brainLibraryBodyEl.appendChild(loading);
    return;
  }
  if (brains.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'brain-library-empty';
    empty.textContent = 'No brains here yet. Create one or import an existing one.';
    brainLibraryBodyEl.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'brain-library-list';
  for (const brain of brains) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'brain-library-brain';
    const name = document.createElement('span');
    name.className = 'brain-library-name';
    name.textContent = brain.name;
    const path = document.createElement('span');
    path.className = 'brain-library-path';
    path.textContent = brain.path;
    row.append(name, path);
    row.addEventListener('click', () => void openLibraryBrain(brain.path));
    list.appendChild(row);
  }
  brainLibraryBodyEl.appendChild(list);
}

async function loadBrainLibrary(): Promise<void> {
  brainLibraryLoading = true;
  brainLibraryImportEl.disabled = true;
  renderBrainLibrary();
  let brains: BrainEntry[] = [];
  try {
    brains = await invoke<BrainEntry[]>('brain_list');
  } catch (error) {
    setBrainLibraryError(String(error));
  } finally {
    brainLibraryLoading = false;
    brainLibraryImportEl.disabled = false;
    renderBrainLibrary(brains);
  }
}

function closeBrainLibrary(): void {
  brainLibraryEl.hidden = true;
  setBrainLibraryError(null);
  updateExclusions();
}

function showBrainLibrary(): void {
  brainLibraryEl.hidden = false;
  setBrainLibraryError(null);
  updateExclusions();
  void loadBrainLibrary();
}

async function openLibraryBrain(path: string): Promise<void> {
  closeBrainLibrary();
  try {
    await openVault(path);
  } catch (error) {
    showBrainLibrary();
    setBrainLibraryError(String(error));
  }
}

async function importBrain(): Promise<void> {
  const source = await open({ directory: true, title: 'Import a brain' });
  if (typeof source !== 'string') return;
  brainLibraryLoading = true;
  brainLibraryImportEl.disabled = true;
  setBrainLibraryError(null);
  renderBrainLibrary();
  try {
    const brain = await invoke<BrainEntry>('brain_import', { source });
    closeBrainLibrary();
    await openVault(brain.path);
    setIngestStatus('Brain imported into Eva Brains', false);
  } catch (error) {
    setBrainLibraryError(String(error));
  } finally {
    brainLibraryLoading = false;
    brainLibraryImportEl.disabled = false;
    if (!brainLibraryEl.hidden) await loadBrainLibrary();
  }
}

function setBrainManagerError(message: string | null): void {
  brainManagerErrorEl.hidden = !message;
  brainManagerErrorEl.textContent = message ?? '';
}

function setBrainManagerStatus(message: string | null, working = false): void {
  brainManagerStatusEl.hidden = !message;
  brainManagerStatusEl.textContent = message ?? '';
  brainManagerStatusEl.classList.toggle('working', working);
}

function renderBrainManager(): void {
  brainManagerListEl.innerHTML = '';
  if (brainManagerLoading) {
    const loading = document.createElement('p');
    loading.className = 'brain-manager-loading';
    loading.textContent = 'Reading your local library…';
    brainManagerListEl.appendChild(loading);
  } else if (brainManagerBrains.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'brain-manager-empty';
    empty.textContent = 'No local brains yet. Create or import one to configure it here.';
    brainManagerListEl.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'brain-manager-list';
    for (const brain of brainManagerBrains) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'brain-manager-brain';
      row.classList.toggle('selected', brain.path === brainManagerSelectedPath);
      const name = document.createElement('span');
      name.className = 'brain-manager-brain-name';
      name.textContent = brain.name;
      const path = document.createElement('span');
      path.className = 'brain-manager-brain-path';
      path.textContent = brain.path;
      row.append(name, path);
      row.addEventListener('click', () => void selectManagedBrain(brain.path));
      list.appendChild(row);
    }
    brainManagerListEl.appendChild(list);
  }
  if (brainManagerLoadError) {
    const error = document.createElement('p');
    error.className = 'brain-manager-load-error';
    error.textContent = brainManagerLoadError;
    brainManagerListEl.appendChild(error);
  }

  const settings = brainManagerSettings;
  brainManagerFormEl.hidden = !settings;
  if (!settings) return;
  brainManagerNameEl.textContent = settings.name;
  brainManagerPathEl.textContent = settings.path;
  brainManagerPathEl.title = settings.path;
  populateBrainProfileOptions(brainManagerProfileEl, settings.profile);
  brainManagerModulesEl.textContent = `Modules: ${settings.modules.join(' · ')}`;
  brainManagerLanguageEl.value = settings.language;
  brainManagerAgentEls.forEach((input) => {
    input.checked = input.value === settings.agent;
  });
  brainManagerPurposeEl.value = settings.purpose;
  brainManagerSaveEl.disabled = brainManagerSaving;
}

async function selectManagedBrain(path: string): Promise<void> {
  const request = ++brainManagerRequest;
  brainManagerSelectedPath = path;
  brainManagerSettings = null;
  brainManagerLoadError = null;
  setBrainManagerError(null);
  setBrainManagerStatus(null);
  renderBrainManager();
  try {
    const settings = await invoke<BrainSettings>('brain_settings_get', { vault: path });
    if (request !== brainManagerRequest || brainManagerEl.hidden) return;
    brainManagerSettings = settings;
  } catch (error) {
    if (request !== brainManagerRequest || brainManagerEl.hidden) return;
    brainManagerLoadError = String(error);
  }
  renderBrainManager();
}

async function loadBrainManager(): Promise<void> {
  brainManagerLoading = true;
  brainManagerLoadError = null;
  renderBrainManager();
  try {
    brainManagerBrains = await invoke<BrainEntry[]>('brain_list');
    brainManagerLoading = false;
    renderBrainManager();
    if (brainManagerBrains.length > 0) {
      await selectManagedBrain(brainManagerBrains[0].path);
    }
  } catch (error) {
    brainManagerLoading = false;
    brainManagerLoadError = String(error);
    renderBrainManager();
  }
}

function closeBrainManager(): void {
  brainManagerRequest += 1;
  brainManagerEl.hidden = true;
  brainManagerLoading = false;
  brainManagerSaving = false;
  brainManagerSelectedPath = null;
  brainManagerSettings = null;
  brainManagerLoadError = null;
  setBrainManagerError(null);
  setBrainManagerStatus(null);
  syncOperationModal();
}

function showBrainManager(): void {
  closeBrainLibrary();
  if (!newVaultEl.hidden) closeNewVault();
  if (!queryPanelEl.hidden) closeQuery();
  if (!profileToolsEl.hidden) closeProfileTools();
  closeSidePanels();
  brainManagerEl.hidden = false;
  brainManagerBrains = [];
  brainManagerSelectedPath = null;
  brainManagerSettings = null;
  brainManagerLoadError = null;
  setBrainManagerError(null);
  setBrainManagerStatus(null);
  syncOperationModal();
  void loadBrainManager();
}

function selectedBrainManagerAgent(): string {
  return brainManagerAgentEls.find((input) => input.checked)?.value ?? '';
}

async function saveBrainManagerSettings(): Promise<void> {
  const settings = brainManagerSettings;
  const language = brainManagerLanguageEl.value.trim();
  const agent = selectedBrainManagerAgent();
  if (!settings || !language || !agent) {
    setBrainManagerError('Set a working language and AI runtime before saving.');
    return;
  }
  brainManagerSaving = true;
  setBrainManagerError(null);
  setBrainManagerStatus('Saving locally…', true);
  brainManagerSaveEl.disabled = true;
  try {
    brainManagerSettings = await invoke<BrainSettings>('brain_settings_update', {
      vault: settings.path,
      profile: profileDefinition(brainManagerProfileEl.value).id,
      language,
      agent,
      purpose: brainManagerPurposeEl.value.trim(),
    });
    if (currentVault === settings.path) {
      currentBrainSettings = brainManagerSettings;
      updateProfileToolsAvailability();
    }
    setBrainManagerStatus('Saved to this brain', false);
  } catch (error) {
    setBrainManagerError(String(error));
    setBrainManagerStatus(null);
  } finally {
    brainManagerSaving = false;
    brainManagerSaveEl.disabled = false;
  }
}

function closeAppSettings(): void {
  appSettingsEl.hidden = true;
  setAppSettingsStatus(null);
  syncOperationModal();
}

function showAppSettings(): void {
  closeBrainLibrary();
  if (!newVaultEl.hidden) closeNewVault();
  if (!queryPanelEl.hidden) closeQuery();
  if (!profileToolsEl.hidden) closeProfileTools();
  if (!brainManagerEl.hidden) closeBrainManager();
  closeSidePanels();
  appSettingsEl.hidden = false;
  setAppSettingsStatus(null);
  populateAppLanguageOptions();
  syncOperationModal();
  window.setTimeout(() => appLanguageEl.focus(), 0);
}

function changeAppLanguage(): void {
  const next = appLanguageEl.value as AppLanguage;
  setAppLanguage(next);
  applyInterfaceLanguage();
  setAppSettingsStatus(t('settings.hint'));
}

function setNewVaultError(message: string | null): void {
  newVaultErrorEl.hidden = !message;
  newVaultErrorEl.textContent = message ?? '';
}

function validVaultName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    trimmed !== '.' &&
    trimmed !== '..' &&
    !/[\\/\u0000-\u001f]/.test(trimmed)
  );
}

function selectedNewVaultAgent(): string {
  return newVaultAgentEls.find((input) => input.checked)?.value ?? '';
}

function resetNewVaultAgent(): void {
  newVaultAgentEls.forEach((input) => {
    input.checked = input.value === 'codex';
  });
}

function updateNewVaultCreateState(): void {
  newVaultCreateEl.disabled =
    !validVaultName(newVaultNameEl.value) ||
    !newVaultLanguageEl.value.trim() ||
    !selectedNewVaultAgent();
}

function closeNewVault(): void {
  newVaultEl.hidden = true;
  newVaultNameEl.value = '';
  populateBrainProfileOptions(newVaultProfileEl, 'research');
  updateNewVaultProfileFrame();
  newVaultLanguageEl.value = 'English';
  resetNewVaultAgent();
  newVaultPurposeEl.value = '';
  setNewVaultError(null);
  updateNewVaultCreateState();
  updateExclusions();
}

function showNewVault(): void {
  newVaultEl.hidden = false;
  newVaultNameEl.value = '';
  populateBrainProfileOptions(newVaultProfileEl, 'research');
  updateNewVaultProfileFrame();
  newVaultLanguageEl.value = 'English';
  resetNewVaultAgent();
  newVaultPurposeEl.value = '';
  setNewVaultError(null);
  updateNewVaultCreateState();
  updateExclusions();
  window.setTimeout(() => newVaultNameEl.focus(), 0);
}

async function createNewVault(): Promise<void> {
  const name = newVaultNameEl.value.trim();
  const language = newVaultLanguageEl.value.trim();
  if (!validVaultName(name) || !language) {
    setNewVaultError('Name the brain and set its working language.');
    updateNewVaultCreateState();
    return;
  }
  newVaultCreateEl.disabled = true;
  setNewVaultError(null);
  try {
    const root = await invoke<string>('brain_create', {
      name,
      profile: selectedNewVaultProfile(),
      language,
      agent: selectedNewVaultAgent(),
      purpose: newVaultPurposeEl.value.trim(),
    });
    closeNewVault();
    await openVault(root);
    setIngestStatus('Brain created · add your first source with Ingest', false);
  } catch (error) {
    setNewVaultError(String(error));
    updateNewVaultCreateState();
  }
}

async function openVault(root: string): Promise<void> {
  currentVault = root;
  currentBrainSettings = null;
  updateProfileToolsAvailability();
  healthReport = null;
  healthError = null;
  healthCheckRunning = false;
  // Bootstrap the standard Eva infrastructure into agent-managed vaults (their
  // own git root); read-only viewing of other folders is left untouched.
  await invoke('ensure_schema', { vault: root }).catch(() => false);
  const settings = await invoke<BrainSettings>('brain_settings_get', { vault: root }).catch(() => null);
  if (currentVault !== root) return;
  currentBrainSettings = settings;
  updateProfileToolsAvailability();
  const rootEntries = await readDir(root);
  const logName = rootEntries.find((e) => e.isFile && e.name.toLowerCase() === 'log.md')?.name;
  logRaw = logName ? await readTextFile(`${root}/${logName}`) : null;

  const files = await collectMarkdown(root);
  vault = buildVault(files);
  issues = lintVault(vault);
  saveRecents([root, ...getRecents().filter((p) => p !== root)]);
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
  legendEl.hidden = vault.pages.length === 0;
}

function renderGraph(graph: Graph): void {
  simulation?.stop();
  // Seed Home at the page center. Its catalog links then make the rest of the
  // graph settle outward, while the panel force preserves access to nodes.
  const center = pageCenter();
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  seedGraphNodes(nodes, center);
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
    const pulse = document.createElementNS(SVG_NS, 'circle');
    pulse.setAttribute('class', 'pulse');
    pulse.setAttribute('r', '13');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'core');
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', colorFor(node.type));
    circle.setAttribute('filter', 'url(#lift)');
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('y', '24');
    label.textContent = node.title;
    g.append(ring, pulse, circle, label);
    attachDrag(g, node);
    svg.appendChild(g);
    return g;
  });
  applyAgentActive();

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

  centerX = forceX<SimNode>(center.x).strength(0.032);
  centerY = forceY<SimNode>(center.y).strength(0.038);
  // Home remains draggable. It is only guided to the center after a
  // reorganization, where this gentle target force creates the visible return.
  homeCenterX = forceX<SimNode>((node) => (isHomeNode(node) ? center.x : 0)).strength((node) =>
    isHomeNode(node) ? 0.14 : 0,
  );
  homeCenterY = forceY<SimNode>((node) => (isHomeNode(node) ? center.y : 0)).strength((node) =>
    isHomeNode(node) ? 0.14 : 0,
  );

  simulation = forceSimulation(nodes)
    .alphaDecay(LAYOUT_ALPHA_DECAY)
    .velocityDecay(LAYOUT_VELOCITY_DECAY)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance((link) =>
          isHomeNode(link.source as SimNode) || isHomeNode(link.target as SimNode) ? 230 : 160,
        ),
    )
    .force('charge', forceManyBody().strength(-520))
    .force('x', centerX)
    .force('y', centerY)
    .force('home-center-x', homeCenterX)
    .force('home-center-y', homeCenterY)
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius(nodeCollisionRadius)
        .strength(0.95)
        .iterations(2),
    )
    .force('panels', panelForce)
    .force('bounds', viewportBoundsForce)
    .on('tick', updatePositions);

  if (reducedMotion) {
    // Settle instantly: no ambient drift for reduced-motion users. The
    // simulation still exists so dragging can wake it, and its default
    // alphaMin lets it come to rest again afterwards.
    simulation.stop();
    simulation.tick(300);
    updatePositions();
  } else {
    // Begin with enough energy to settle a new graph, but with a long, soft
    // deceleration so opening and reorganization read as a reflow—not a jump.
    simulation.alpha(LAYOUT_START_ALPHA).alphaTarget(AMBIENT_ALPHA).alphaMin(0);
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
    simulation?.alphaTarget(0.12).restart();
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

function goHome(): void {
  // A pending review is deliberately the one exception: it needs an explicit
  // accept/reject decision before the person can leave that operation.
  if (!reviewEl.hidden) {
    setIngestStatus('Finish the review before leaving this brain', false, true);
    return;
  }
  if (opIngestEl.classList.contains('active')) {
    setIngestStatus('Wait for the current ingest to finish before leaving this brain', true);
    return;
  }
  if (!queryPanelEl.hidden) closeQuery();
  if (!profileToolsEl.hidden) closeProfileTools();
  closeSidePanels();
  deselect();

  // Home is Eva's launcher, not the graph's central index page. The brain
  // remains untouched on disk and stays in the local library / recents list;
  // only its in-memory view is released here.
  simulation?.stop();
  simulation = null;
  simNodes = [];
  refreshPositions = null;
  svg.innerHTML = '';
  vault = null;
  issues = [];
  logRaw = null;
  currentVault = null;
  currentBrainSettings = null;
  updateProfileToolsAvailability();
  healthReport = null;
  healthError = null;
  healthCheckRunning = false;
  vaultPathEl.textContent = t('nav.noBrain');
  vaultPathEl.title = '';
  legendEl.hidden = true;
  commandEl.hidden = true;
  emptyEl.hidden = false;
  setIngestStatus(null, false);
  refreshRecentViews();
  updateExclusions();
}

/* Operation panels: lint and log share the left dock, one at a time -------- */
function syncOpButtons(): void {
  opLintEl.classList.toggle('active', !lintPanelEl.hidden);
  opLintEl.setAttribute('aria-pressed', String(!lintPanelEl.hidden));
  opLogEl.classList.toggle('active', !logPanelEl.hidden);
  opLogEl.setAttribute('aria-pressed', String(!logPanelEl.hidden));
}

function operationModalIsOpen(): boolean {
  return !queryPanelEl.hidden || !profileToolsEl.hidden || !lintPanelEl.hidden || !logPanelEl.hidden || !reviewEl.hidden || !brainManagerEl.hidden || !appSettingsEl.hidden;
}

function syncOperationModal(): void {
  const open = operationModalIsOpen();
  operationScrimEl.hidden = !open;
  document.body.classList.toggle('operation-modal-open', open);
  updateExclusions();
}

function closeSidePanels(): void {
  lintPanelEl.hidden = true;
  logPanelEl.hidden = true;
  syncOpButtons();
  syncOperationModal();
}

function toggleSidePanel(which: 'lint' | 'log'): void {
  const target = which === 'lint' ? lintPanelEl : logPanelEl;
  const other = which === 'lint' ? logPanelEl : lintPanelEl;
  const opening = target.hidden;
  other.hidden = true;
  target.hidden = !opening;
  if (opening) {
    if (!queryPanelEl.hidden) closeQuery();
    if (!profileToolsEl.hidden) closeProfileTools();
    if (which === 'lint') renderLintPanel();
    else renderLogPanel();
    window.setTimeout(() => target.querySelector<HTMLButtonElement>('.panel-close')?.focus(), 0);
  }
  syncOpButtons();
  syncOperationModal();
}

interface HealthFinding {
  kind: string;
  title: string;
  detail: string;
  pages: string[];
  nextStep: string;
}

interface HealthReport {
  summary: string;
  findings: HealthFinding[];
}

function healthKindClass(kind: string): string {
  switch (kind) {
    case 'contradiction':
      return 'contradiction';
    case 'provenance':
      return 'provenance';
    case 'stale-claim':
      return 'stale';
    case 'coverage-gap':
      return 'coverage';
    default:
      return 'research';
  }
}

function renderHealthReport(section: HTMLElement): void {
  if (healthCheckRunning) {
    const pending = document.createElement('p');
    pending.className = 'health-pending';
    pending.textContent = 'Reading the brain for maintenance signals…';
    section.appendChild(pending);
    return;
  }
  if (healthError) {
    const error = document.createElement('p');
    error.className = 'health-error';
    error.textContent = healthError;
    section.appendChild(error);
    return;
  }
  if (!healthReport) return;

  const summary = document.createElement('p');
  summary.className = 'health-summary';
  summary.textContent = healthReport.summary;
  section.appendChild(summary);
  if (healthReport.findings.length === 0) {
    const clean = document.createElement('p');
    clean.className = 'health-clean';
    clean.textContent = 'No advisory maintenance work identified.';
    section.appendChild(clean);
    return;
  }
  for (const finding of healthReport.findings) {
    const item = document.createElement('article');
    item.className = `health-finding health-${healthKindClass(finding.kind)}`;
    const kind = document.createElement('span');
    kind.className = 'health-kind';
    kind.textContent = finding.kind.replace(/-/g, ' ');
    const title = document.createElement('h3');
    title.textContent = finding.title;
    const detail = document.createElement('p');
    detail.className = 'health-detail';
    detail.textContent = finding.detail;
    item.append(kind, title, detail);
    if (finding.pages.length > 0) {
      const pages = document.createElement('div');
      pages.className = 'health-pages';
      for (const pageId of finding.pages) {
        const page = document.createElement('button');
        page.type = 'button';
        page.textContent = pageId;
        page.disabled = !vault?.byId.has(pageId);
        page.addEventListener('click', () => {
          if (vault?.byId.has(pageId)) select(pageId);
        });
        pages.appendChild(page);
      }
      item.appendChild(pages);
    }
    if (finding.nextStep) {
      const next = document.createElement('p');
      next.className = 'health-next';
      next.textContent = `Next: ${finding.nextStep}`;
      item.appendChild(next);
    }
    section.appendChild(item);
  }
}

async function runHealthCheck(): Promise<void> {
  if (!currentVault || healthCheckRunning) return;
  const vaultPath = currentVault;
  healthCheckRunning = true;
  healthError = null;
  renderLintPanel();
  setIngestStatus('Checking brain health…', true);
  try {
    const report = await invoke<HealthReport>('health_check_run', { vault: vaultPath });
    if (currentVault !== vaultPath) return;
    healthReport = report;
    setIngestStatus(
      `${report.findings.length} advisory finding${report.findings.length === 1 ? '' : 's'}`,
      false,
    );
  } catch (error) {
    if (currentVault === vaultPath) {
      healthError = String(error);
      setIngestStatus('Health check could not run', false);
    }
  } finally {
    if (currentVault === vaultPath) {
      healthCheckRunning = false;
      renderLintPanel();
    }
  }
}

function renderLintPanel(): void {
  if (!vault) return;
  lintSubEl.textContent = `${issues.length} structural issue${issues.length === 1 ? '' : 's'} · ${vault.pages.length} pages`;
  lintBodyEl.innerHTML = '';

  const structural = document.createElement('p');
  structural.className = 'recent-label';
  structural.textContent = 'Structural check';
  lintBodyEl.appendChild(structural);

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
      name.addEventListener('click', () => {
        closeSidePanels();
        select(page.id);
      });
      group.appendChild(name);
      for (const issue of pageIssues) {
        const row = document.createElement('button');
        row.className = `issue issue-${issue.rule}`;
        row.dataset.rule = issue.rule;
        row.textContent = issue.message;
        row.addEventListener('click', () => {
          closeSidePanels();
          select(issue.page);
        });
        group.appendChild(row);
      }
      lintBodyEl.appendChild(group);
    }
  }

  const health = document.createElement('section');
  health.className = 'health-section';
  const healthLabel = document.createElement('p');
  healthLabel.className = 'recent-label';
  healthLabel.textContent = 'Advisory health check';
  const intro = document.createElement('p');
  intro.className = 'health-intro';
  intro.textContent = 'Read-only review for contradictions, weak provenance, stale claims, and research gaps.';
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'btn-stamp aux';
  run.textContent = healthCheckRunning ? 'Checking…' : healthReport ? 'Run again' : 'Run health check';
  run.disabled = healthCheckRunning;
  run.addEventListener('click', () => void runHealthCheck());
  health.append(healthLabel, intro, run);
  renderHealthReport(health);
  lintBodyEl.appendChild(health);
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
    logSubEl.textContent = 'no log.md in this brain';
    const empty = document.createElement('p');
    empty.className = 'log-empty';
    empty.textContent =
      'No log yet. Once ingest and query run against this brain, every ' +
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

/* Ingest ---------------------------------------------------------------------
   The webview's whole job here: pick sources, invoke Rust, render events. */
function setIngestStatus(text: string | null, working: boolean, failed = false): void {
  if (!text) {
    ingestStatusEl.hidden = true;
    return;
  }
  ingestStatusEl.hidden = false;
  ingestStatusEl.textContent = text;
  ingestStatusEl.title = text;
  ingestStatusEl.classList.toggle('working', working);
  ingestStatusEl.classList.toggle('failed', failed);
}

function applyAgentActive(): void {
  svg.querySelectorAll('.node').forEach((el) => {
    el.classList.toggle('agent-active', agentActive.has(el.getAttribute('data-id')!));
  });
}

function markAgentFile(rel: string): void {
  if (!rel.toLowerCase().endsWith('.md')) return;
  agentActive.add(rel.replace(/\.md$/i, ''));
  applyAgentActive();
}

function clearAgentActive(): void {
  agentActive.clear();
  applyAgentActive();
}

async function startIngest(): Promise<void> {
  if (!currentVault) return;
  const picked = await open({
    multiple: true,
    title: 'Choose source documents to ingest',
    filters: [{ name: 'Sources', extensions: ['txt', 'md', 'html', 'htm', 'pdf'] }],
  });
  const sources = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
  if (sources.length === 0) return;
  try {
    await invoke('ingest_enqueue', { vault: currentVault, sources });
  } catch (error) {
    setIngestStatus(String(error), false);
  }
}

interface QueryCitation {
  page: string;
  sources: string[];
}

interface QueryAnswer {
  answer: string;
  citations: QueryCitation[];
}

interface QueryReviewPayload {
  reviewId: number;
  question: string;
  patch: string;
  newIssues: string[];
  deletions: string[];
}

function setQueryError(message: string | null): void {
  queryErrorEl.hidden = !message;
  queryErrorEl.textContent = message ?? '';
}

function setQueryRunning(running: boolean, label?: string): void {
  querySubmitEl.disabled = running;
  queryQuestionEl.readOnly = running;
  queryPanelEl.classList.toggle('is-processing', running);
  queryStatusEl.hidden = !running;
  queryStatusEl.textContent = running ? label ?? t('query.searching') : '';
  querySubmitEl.textContent = running ? t('query.processing') : t('query.ask');
  opQueryEl.classList.toggle('active', running);
}

function closeQuery(): void {
  queryPanelEl.hidden = true;
  queryQuestionEl.value = '';
  queryResultEl.hidden = true;
  queryCitationsEl.innerHTML = '';
  latestQuery = null;
  setQueryError(null);
  setQueryRunning(false);
  syncOperationModal();
}

function showQuery(): void {
  if (!currentVault) return;
  if (!profileToolsEl.hidden) closeProfileTools();
  closeSidePanels();
  queryPanelEl.hidden = false;
  queryQuestionEl.value = '';
  queryResultEl.hidden = true;
  queryCitationsEl.innerHTML = '';
  latestQuery = null;
  setQueryError(null);
  setQueryRunning(false);
  syncOperationModal();
  window.setTimeout(() => queryQuestionEl.focus(), 0);
}

function renderQueryAnswer(answer: QueryAnswer): void {
  queryAnswerEl.textContent = answer.answer;
  queryCitationsEl.innerHTML = '';
  if (answer.citations.length === 0) {
    const none = document.createElement('p');
    none.className = 'query-no-citations';
    none.textContent = 'No supporting brain pages were returned for this answer.';
    queryCitationsEl.appendChild(none);
  }
  for (const citation of answer.citations) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'query-citation';
    const page = document.createElement('span');
    page.className = 'query-citation-page';
    page.textContent = citation.page;
    item.appendChild(page);
    if (citation.sources.length > 0) {
      const sources = document.createElement('span');
      sources.className = 'query-citation-sources';
      sources.textContent = citation.sources.join(' · ');
      item.appendChild(sources);
    }
    item.addEventListener('click', () => {
      if (!vault?.byId.has(citation.page)) return;
      closeQuery();
      select(citation.page);
    });
    queryCitationsEl.appendChild(item);
  }
  queryResultEl.hidden = false;
  updateExclusions();
}

interface ProfileToolResult {
  title: string;
  content: string;
  citations: QueryCitation[];
}

function openProfileDefinition() {
  return profileDefinition(currentBrainSettings?.profile ?? 'blank');
}

function updateProfileToolsAvailability(): void {
  const profile = openProfileDefinition();
  const available = profile.tools.length > 0;
  opProfileToolsEl.hidden = !available;
  opProfileToolsEl.title = available ? `Run tools for this ${profile.label.toLowerCase()} brain` : '';
}

function setProfileToolsError(message: string | null): void {
  profileToolsErrorEl.hidden = !message;
  profileToolsErrorEl.textContent = message ?? '';
}

function setProfileToolRunning(running: boolean, label = 'Eva is reading the brain and tracing sources…'): void {
  profileToolRunning = running;
  profileToolsEl.classList.toggle('is-processing', running);
  profileToolsStatusEl.hidden = !running;
  profileToolsStatusEl.textContent = running ? label : '';
  profileToolsListEl.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = running;
  });
  opProfileToolsEl.classList.toggle('active', running);
}

function renderProfileTools(): void {
  const profile = openProfileDefinition();
  profileToolsKickerEl.textContent = profile.label;
  profileToolsCopyEl.textContent = `${profile.detail} Choose a focused piece of work; Eva uses only this brain and returns cited material you can save for review.`;
  profileToolsListEl.innerHTML = '';
  for (const tool of profile.tools) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-tool';
    const title = document.createElement('span');
    title.className = 'profile-tool-title';
    title.textContent = tool.label;
    const detail = document.createElement('span');
    detail.className = 'profile-tool-detail';
    detail.textContent = tool.detail;
    button.append(title, detail);
    button.addEventListener('click', () => void runProfileTool(tool.id));
    profileToolsListEl.appendChild(button);
  }
}

function closeProfileTools(): void {
  profileToolsEl.hidden = true;
  profileToolsResultEl.hidden = true;
  profileToolsCitationsEl.innerHTML = '';
  latestProfileTool = null;
  setProfileToolsError(null);
  setProfileToolRunning(false);
  syncOperationModal();
}

function showProfileTools(): void {
  if (!currentVault || openProfileDefinition().tools.length === 0) return;
  if (!queryPanelEl.hidden) closeQuery();
  closeSidePanels();
  latestProfileTool = null;
  profileToolsResultEl.hidden = true;
  setProfileToolsError(null);
  setProfileToolRunning(false);
  renderProfileTools();
  profileToolsEl.hidden = false;
  syncOperationModal();
  window.setTimeout(() => profileToolsListEl.querySelector<HTMLButtonElement>('button')?.focus(), 0);
}

function renderProfileToolResult(result: ProfileToolResult): void {
  profileToolsResultTitleEl.textContent = result.title;
  profileToolsContentEl.textContent = result.content;
  profileToolsCitationsEl.innerHTML = '';
  if (result.citations.length === 0) {
    const none = document.createElement('p');
    none.className = 'query-no-citations';
    none.textContent = 'No supporting brain pages were returned for this result.';
    profileToolsCitationsEl.appendChild(none);
  }
  for (const citation of result.citations) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'query-citation';
    const page = document.createElement('span');
    page.className = 'query-citation-page';
    page.textContent = citation.page;
    item.appendChild(page);
    if (citation.sources.length > 0) {
      const sources = document.createElement('span');
      sources.className = 'query-citation-sources';
      sources.textContent = citation.sources.join(' · ');
      item.appendChild(sources);
    }
    item.addEventListener('click', () => {
      if (!vault?.byId.has(citation.page)) return;
      closeProfileTools();
      select(citation.page);
    });
    profileToolsCitationsEl.appendChild(item);
  }
  profileToolsResultEl.hidden = false;
  updateExclusions();
}

async function runProfileTool(tool: ProfileToolId): Promise<void> {
  if (!currentVault || profileToolRunning) return;
  setProfileToolsError(null);
  profileToolsResultEl.hidden = true;
  setProfileToolRunning(true);
  try {
    const result = await invoke<ProfileToolResult>('profile_tool_run', { vault: currentVault, tool });
    const toolDefinition = openProfileDefinition().tools.find((item) => item.id === tool);
    latestProfileTool = {
      tool,
      title: result.title,
      answer: { answer: result.content, citations: result.citations },
    };
    profileToolsKickerEl.textContent = toolDefinition?.label ?? 'Brain tool';
    renderProfileToolResult(result);
  } catch (error) {
    setProfileToolsError(String(error));
  } finally {
    setProfileToolRunning(false);
  }
}

async function saveProfileToolAsAnalysis(): Promise<void> {
  if (!currentVault || !latestProfileTool || profileToolRunning) return;
  const profile = openProfileDefinition();
  const tool = profile.tools.find((item) => item.id === latestProfileTool?.tool);
  profileToolsSaveEl.disabled = true;
  setProfileToolsError(null);
  setProfileToolRunning(true, 'Preparing review…');
  try {
    const review = await invoke<QueryReviewPayload>('query_save', {
      vault: currentVault,
      question: `${tool?.label ?? 'Brain tool'} · ${profile.label}`,
      answer: latestProfileTool.answer,
    });
    closeProfileTools();
    showReview({
      kind: 'query',
      id: review.reviewId,
      subject: review.question,
      patch: review.patch,
      newIssues: review.newIssues,
      deletions: review.deletions,
      heldMessage: 'inspect the saved tool result before merging',
    });
    setIngestStatus('Tool result ready for review', false);
  } catch (error) {
    setProfileToolsError(String(error));
  } finally {
    profileToolsSaveEl.disabled = false;
    setProfileToolRunning(false);
  }
}

async function runQuery(): Promise<void> {
  if (!currentVault) return;
  const question = queryQuestionEl.value.trim();
  if (!question) {
    setQueryError('Enter a question for this brain.');
    return;
  }
  setQueryError(null);
  queryResultEl.hidden = true;
  setQueryRunning(true);
  try {
    const answer = await invoke<QueryAnswer>('query_run', { vault: currentVault, question });
    latestQuery = { question, answer };
    renderQueryAnswer(answer);
  } catch (error) {
    setQueryError(String(error));
  } finally {
    setQueryRunning(false);
  }
}

async function saveQueryAsAnalysis(): Promise<void> {
  if (!currentVault || !latestQuery) return;
  querySaveEl.disabled = true;
  setQueryError(null);
  setQueryRunning(true, 'Preparing review…');
  try {
    const review = await invoke<QueryReviewPayload>('query_save', {
      vault: currentVault,
      question: latestQuery.question,
      answer: latestQuery.answer,
    });
    closeQuery();
    showReview({
      kind: 'query',
      id: review.reviewId,
      subject: review.question,
      patch: review.patch,
      newIssues: review.newIssues,
      deletions: review.deletions,
      heldMessage: 'inspect the saved analysis before merging',
    });
    setIngestStatus('Analysis ready for review', false);
  } catch (error) {
    setQueryError(String(error));
  } finally {
    querySaveEl.disabled = false;
    setQueryRunning(false);
  }
}

interface ReviewPayload {
  jobId: number;
  source: string;
  patch: string;
  newIssues: string[];
  deletions: string[];
  summary: string;
}

interface ChangeReview {
  kind: 'ingest' | 'query';
  id: number;
  subject: string;
  patch: string;
  newIssues: string[];
  deletions: string[];
  heldMessage: string;
}

function showReview(p: ChangeReview): void {
  if (!queryPanelEl.hidden) closeQuery();
  if (!profileToolsEl.hidden) closeProfileTools();
  closeSidePanels();
  reviewId = p.id;
  reviewKind = p.kind;
  reviewTitleEl.textContent = p.kind === 'ingest' ? 'Review ingest' : 'Review analysis';
  const parts = [
    p.newIssues.length > 0 ? `${p.newIssues.length} new lint issue${p.newIssues.length === 1 ? '' : 's'}` : '',
    p.deletions.length > 0 ? `${p.deletions.length} deletion${p.deletions.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  reviewSubEl.textContent = `${p.subject} — ${parts.length > 0 ? `held: ${parts.join(' · ')}` : p.heldMessage}`;
  reviewIssuesEl.innerHTML = '';
  for (const del of p.deletions) {
    const item = document.createElement('div');
    item.className = 'issue issue-broken-link';
    item.dataset.rule = 'deletion';
    item.textContent = `${del} would be deleted — deletions are never auto-merged`;
    reviewIssuesEl.appendChild(item);
  }
  for (const issue of p.newIssues) {
    const item = document.createElement('div');
    item.className = 'issue issue-orphan';
    item.dataset.rule = 'new lint issue';
    item.textContent = issue;
    reviewIssuesEl.appendChild(item);
  }
  reviewPatchEl.innerHTML = '';
  for (const line of p.patch.split('\n')) {
    const span = document.createElement('span');
    span.textContent = `${line}\n`;
    if (line.startsWith('diff ') || line.startsWith('+++') || line.startsWith('---')) {
      span.className = 'diff-file';
    } else if (line.startsWith('+')) {
      span.className = 'diff-add';
    } else if (line.startsWith('-')) {
      span.className = 'diff-del';
    }
    reviewPatchEl.appendChild(span);
  }
  reviewEl.hidden = false;
  syncOperationModal();
}

async function decideReview(accept: boolean): Promise<void> {
  if (reviewId === null || reviewKind === null) return;
  const id = reviewId;
  const kind = reviewKind;
  reviewId = null;
  reviewKind = null;
  reviewEl.hidden = true;
  syncOperationModal();
  try {
    if (kind === 'ingest') {
      await invoke('ingest_decide', { jobId: id, accept });
    } else {
      await invoke('query_decide', { reviewId: id, accept });
      if (currentVault) await openVault(currentVault);
      setIngestStatus(accept ? 'Analysis saved to the brain' : 'Analysis not saved', false);
    }
  } catch (error) {
    setIngestStatus(String(error), false);
    reviewId = id;
    reviewKind = kind;
    reviewEl.hidden = false;
    syncOperationModal();
  }
}

function forwardDev(tag: string, payload: unknown): void {
  if (!import.meta.env.DEV || !import.meta.env.VITE_DEV_VAULT) return;
  void fetch('/__dev-report', {
    method: 'POST',
    body: JSON.stringify({ ingest: tag, payload }),
  }).catch(() => {});
}

interface JobInfo {
  id: number;
  sourceName: string;
  status: string;
  error?: string;
}

void listen('ingest:state', (event) => {
  const p = event.payload as { current: JobInfo | null; queue: JobInfo[]; done: JobInfo[] };
  if (p.current) {
    setIngestStatus(
      `ingesting ${p.current.sourceName}${p.queue.length > 0 ? ` · ${p.queue.length} queued` : ''}`,
      true,
    );
  } else if (p.queue.length > 0) {
    setIngestStatus(`${p.queue.length} queued — waiting on review`, false);
  } else if (p.done.length > 0) {
    const merged = p.done.filter((j) => j.status === 'merged').length;
    const failed = p.done.filter((j) => j.status === 'failed');
    if (failed.length > 0) {
      const latest = failed.at(-1)!;
      const source = latest.sourceName || 'a source';
      const error = latest.error || 'The agent could not process this source.';
      setIngestStatus(`Ingest stopped at ${source}: ${error}`, false, true);
    } else {
      setIngestStatus(`${merged}/${p.done.length} sources ingested`, false);
    }
  }
  opIngestEl.classList.toggle('active', p.current !== null);
  forwardDev('state', p);
});

void listen('ingest:activity', (event) => {
  const p = event.payload as { jobId: number; kind: string; value: string };
  if (p.kind === 'file') {
    markAgentFile(p.value);
    setIngestStatus(`agent → ${p.value}`, true);
  }
  forwardDev('activity', p);
});

void listen('ingest:merged', async (event) => {
  clearAgentActive();
  forwardDev('merged', event.payload);
  if (currentVault) await openVault(currentVault);
});

void listen('ingest:review', (event) => {
  const p = event.payload as ReviewPayload;
  clearAgentActive();
  showReview({
    kind: 'ingest',
    id: p.jobId,
    subject: p.source,
    patch: p.patch,
    newIssues: p.newIssues,
    deletions: p.deletions,
    heldMessage: 'inspect the proposed ingest before merging',
  });
  forwardDev('review', {
    jobId: p.jobId,
    source: p.source,
    newIssues: p.newIssues,
    deletions: p.deletions,
    patchBytes: p.patch.length,
    summary: p.summary,
  });
});

void listen('ingest:failed', (event) => {
  const p = event.payload as { jobId: number; source: string; error: string };
  clearAgentActive();
  setIngestStatus(`Ingest stopped at ${p.source}: ${p.error}`, false, true);
  forwardDev('failed', p);
});

void listen('ingest:rejected', async (event) => {
  forwardDev('rejected', event.payload);
  if (currentVault) await openVault(currentVault); // pick up the log entry
});

/* Wiring -------------------------------------------------------------------- */
document.getElementById('go-home')!.addEventListener('click', goHome);
document.getElementById('empty-open')!.addEventListener('click', showBrainLibrary);
document.getElementById('empty-new')!.addEventListener('click', showNewVault);
document.getElementById('empty-manage')!.addEventListener('click', showBrainManager);
document.getElementById('empty-settings')!.addEventListener('click', showAppSettings);
document.getElementById('brain-library-close')!.addEventListener('click', closeBrainLibrary);
brainLibraryImportEl.addEventListener('click', () => void importBrain());
document.getElementById('brain-library-manage')!.addEventListener('click', showBrainManager);
document.getElementById('brain-library-new')!.addEventListener('click', () => {
  closeBrainLibrary();
  showNewVault();
});
document.getElementById('brain-manager-close')!.addEventListener('click', closeBrainManager);
brainManagerFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveBrainManagerSettings();
});
brainManagerProfileEl.addEventListener('change', () => {
  const profile = profileDefinition(brainManagerProfileEl.value);
  brainManagerModulesEl.textContent = `Modules: ${profile.modules.join(' · ')}`;
});
document.getElementById('app-settings-close')!.addEventListener('click', closeAppSettings);
appLanguageEl.addEventListener('change', changeAppLanguage);
document.getElementById('new-vault-cancel')!.addEventListener('click', closeNewVault);
newVaultNameEl.addEventListener('input', () => {
  setNewVaultError(null);
  updateNewVaultCreateState();
});
newVaultLanguageEl.addEventListener('input', () => {
  setNewVaultError(null);
  updateNewVaultCreateState();
});
newVaultProfileEl.addEventListener('change', () => {
  updateNewVaultProfileFrame();
  setNewVaultError(null);
  updateNewVaultCreateState();
});
newVaultAgentEls.forEach((input) =>
  input.addEventListener('change', () => {
    setNewVaultError(null);
    updateNewVaultCreateState();
  }),
);
newVaultFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  void createNewVault();
});
document.getElementById('detail-close')!.addEventListener('click', deselect);
opIngestEl.addEventListener('click', () => void startIngest());
opQueryEl.addEventListener('click', showQuery);
opProfileToolsEl.addEventListener('click', showProfileTools);
document.getElementById('profile-tools-close')!.addEventListener('click', closeProfileTools);
profileToolsSaveEl.addEventListener('click', () => void saveProfileToolAsAnalysis());
document.getElementById('query-close')!.addEventListener('click', closeQuery);
queryFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  void runQuery();
});
querySaveEl.addEventListener('click', () => void saveQueryAsAnalysis());
opLintEl.addEventListener('click', () => toggleSidePanel('lint'));
opLogEl.addEventListener('click', () => toggleSidePanel('log'));
reorganizeGraphEl.addEventListener('click', reorganizeGraph);
document.getElementById('review-accept')!.addEventListener('click', () => void decideReview(true));
document.getElementById('review-reject')!.addEventListener('click', () => void decideReview(false));
document.querySelectorAll<HTMLButtonElement>('.panel-close[data-panel]').forEach((btn) =>
  btn.addEventListener('click', closeSidePanels),
);

operationScrimEl.addEventListener('click', () => {
  // A review changes repository state, so it requires an explicit decision.
  if (!reviewEl.hidden) return;
  if (!queryPanelEl.hidden) closeQuery();
  else if (!brainManagerEl.hidden) closeBrainManager();
  else if (!appSettingsEl.hidden) closeAppSettings();
  else closeSidePanels();
});

svg.addEventListener('click', deselect);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  // The review panel requires an explicit accept/reject — Escape skips it.
  if (!reviewEl.hidden) return;
  if (!queryPanelEl.hidden) {
    closeQuery();
    return;
  }
  if (!brainManagerEl.hidden) {
    closeBrainManager();
    return;
  }
  if (!appSettingsEl.hidden) {
    closeAppSettings();
    return;
  }
  if (!brainLibraryEl.hidden) {
    closeBrainLibrary();
    return;
  }
  if (!newVaultEl.hidden) {
    closeNewVault();
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

applyInterfaceLanguage();
updateExclusions();

// Dev-only test hooks (stripped from production builds): VITE_DEV_VAULT
// auto-opens a vault on launch, VITE_DEV_SELECT auto-selects a node, and
// VITE_DEV_INGEST enqueues a source file; a render report and all ingest
// events are POSTed back to the vite terminal for verification.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_VAULT) {
  void (async () => {
    const report = (payload: unknown) =>
      fetch('/__dev-report', { method: 'POST', body: JSON.stringify(payload) });
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const nodePos = (g: Element): { x: number; y: number } => {
      const m = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
      return { x: m ? parseFloat(m[1]) : 0, y: m ? parseFloat(m[2]) : 0 };
    };
    try {
      await openVault(import.meta.env.VITE_DEV_VAULT as string);
      await sleep(1200);
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
        meanY: (() => {
          const ys = [...svg.querySelectorAll('.node')].map((g) => nodePos(g).y);
          return ys.length > 0 ? Math.round(ys.reduce((a, b) => a + b, 0) / ys.length) : null;
        })(),
        selected: selectId ? { id: selectId, sidebarText: sidebar.innerText } : null,
      });
      const devIngest = import.meta.env.VITE_DEV_INGEST as string | undefined;
      if (devIngest) {
        const vaultRoot = import.meta.env.VITE_DEV_VAULT as string;
        // 'scan' enqueues every not-yet-ingested file in raw/ (sorted);
        // anything else is a single source path.
        const sources =
          devIngest === 'scan'
            ? []
            : [devIngest.startsWith('/') ? devIngest : `${vaultRoot}/${devIngest}`];
        const queued = await invoke('ingest_enqueue', { vault: vaultRoot, sources });
        await report({ ingest: 'enqueued', payload: { mode: devIngest, queued } });
      }
    } catch (error) {
      await report({ error: String(error) });
    }
  })();
}
