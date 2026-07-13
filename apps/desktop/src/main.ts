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
  ui,
  type AppLanguage,
  type ChromeKey,
  type TranslationKey,
} from './i18n';
import {
  buildGraph,
  buildVault,
  lintVault,
  resolveLink,
  type Graph,
  type LintIssue,
  type Page,
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
    modules: ['goals', 'observations', 'journal', 'timeline'],
    tools: [{
      id: 'personal-review',
    }],
    purposeLabel: 'What would you like to track?',
    purposePlaceholder: 'Goals, habits, health observations, or a question you want to understand…',
  },
  {
    id: 'research',
    modules: ['thesis', 'evidence', 'contradictions', 'bibliography'],
    tools: [{
      id: 'evidence-map',
    }],
    purposeLabel: 'What question are you investigating?',
    purposePlaceholder: 'The topic, question, or thesis you want this brain to develop…',
  },
  {
    id: 'reading',
    modules: ['chapters', 'characters', 'threads', 'themes'],
    tools: [{
      id: 'reading-threads',
    }],
    purposeLabel: 'Which book or text are you following?',
    purposePlaceholder: 'Title, author, and any spoiler boundary you want Eva to respect…',
  },
  {
    id: 'business',
    modules: ['projects', 'decisions', 'meetings', 'risks'],
    tools: [{
      id: 'decision-brief',
    }],
    purposeLabel: 'What business context should this brain maintain?',
    purposePlaceholder: 'A team, company, customer area, project, or decision space…',
  },
  {
    id: 'planning',
    modules: ['objectives', 'constraints', 'options', 'timeline'],
    tools: [{
      id: 'options-review',
    }],
    purposeLabel: 'What are you planning?',
    purposePlaceholder: 'A trip, project, purchase, move, or other decision you are working through…',
  },
  {
    id: 'course',
    modules: ['concepts', 'materials', 'practice', 'revision'],
    tools: [
      {
        id: 'flashcards', countOptions: [10, 15, 20],
      },
      {
        id: 'practice-exam', formatOptions: [
          { value: 'mixed', label: 'Mixed' },
          { value: 'multiple-choice', label: 'Multiple choice' },
          { value: 'written', label: 'Written responses' },
          { value: 'short-answer', label: 'Short answer' },
        ],
        countOptions: [6, 8, 10, 12],
      },
    ],
    purposeLabel: 'What are you learning?',
    purposePlaceholder: 'The course, subject, skill, or syllabus you want to master…',
  },
  {
    id: 'blank',
    modules: ['knowledge-base'],
    tools: [],
  },
] as const;

type BrainProfileId = (typeof BRAIN_PROFILES)[number]['id'];
type ProfileToolId = (typeof BRAIN_PROFILES)[number]['tools'][number]['id'];

function profileDefinition(id: string): (typeof BRAIN_PROFILES)[number] {
  return BRAIN_PROFILES.find((profile) => profile.id === id) ?? BRAIN_PROFILES.at(-1)!;
}

function profileLabel(id: BrainProfileId): string {
  return ui(`profile.${id}` as ChromeKey);
}

function toolLabel(id: ProfileToolId): string {
  return ui(`tool.${id}` as ChromeKey);
}

const colorFor = (type: string | null): string =>
  (type !== null && TYPE_COLORS[type]) || FALLBACK_COLOR;

const TYPE_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  index: 'type.index',
  entity: 'type.entity',
  concept: 'type.concept',
  summary: 'type.summary',
  analysis: 'type.analysis',
  person: 'type.person',
  project: 'type.project',
  note: 'type.note',
  log: 'type.log',
  untyped: 'type.untyped',
};

function pageTypeLabel(type: string | null): string {
  return t(TYPE_TRANSLATION_KEYS[type ?? 'untyped'] ?? 'type.untyped');
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  type: string | null;
}

interface GraphCamera {
  x: number;
  y: number;
  zoom: number;
}

type FloatingPanelName = 'map' | 'legend' | 'reader';

interface FloatingPanelPosition {
  left: number;
  top: number;
}

interface ReaderPanelSize {
  width: number;
  height: number;
}

interface SavedGraphLayout {
  version: 1;
  camera: GraphCamera;
  nodes: Record<string, { x: number; y: number }>;
  floating?: Partial<Record<FloatingPanelName, FloatingPanelPosition>>;
  readerSize?: ReaderPanelSize;
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
const graphNavigationEl = document.getElementById('graph-navigation') as HTMLElement;
const graphZoomOutEl = document.getElementById('graph-zoom-out') as HTMLButtonElement;
const graphZoomInEl = document.getElementById('graph-zoom-in') as HTMLButtonElement;
const graphZoomLevelEl = document.getElementById('graph-zoom-level') as HTMLOutputElement;
const graphCenterViewEl = document.getElementById('graph-center-view') as HTMLButtonElement;
const graphShowAllEl = document.getElementById('graph-show-all') as HTMLButtonElement;
const graphNavigationHintEl = document.getElementById('graph-navigation-hint') as HTMLElement;
const lintPanelEl = document.getElementById('lint-panel') as HTMLElement;
const lintSubEl = document.getElementById('lint-sub') as HTMLElement;
const lintBodyEl = document.getElementById('lint-body') as HTMLElement;
const logPanelEl = document.getElementById('log-panel') as HTMLElement;
const logSubEl = document.getElementById('log-sub') as HTMLElement;
const logBodyEl = document.getElementById('log-body') as HTMLElement;
const opIngestEl = document.getElementById('op-ingest') as HTMLButtonElement;
const opExploreEl = document.getElementById('op-explore') as HTMLButtonElement;
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
const queryScopeEl = document.getElementById('query-scope') as HTMLElement;
const explorePanelEl = document.getElementById('explore-panel') as HTMLElement;
const exploreSearchEl = document.getElementById('explore-search') as HTMLInputElement;
const exploreTypeFiltersEl = document.getElementById('explore-type-filters') as HTMLElement;
const exploreConnectedEl = document.getElementById('explore-connected') as HTMLButtonElement;
const exploreScopeEl = document.getElementById('explore-scope') as HTMLInputElement;
const exploreSummaryEl = document.getElementById('explore-summary') as HTMLElement;
const exploreResultsEl = document.getElementById('explore-results') as HTMLElement;
const exploreClearEl = document.getElementById('explore-clear') as HTMLButtonElement;
const profileToolsEl = document.getElementById('profile-tools') as HTMLElement;
const profileToolsKickerEl = document.getElementById('profile-tools-kicker') as HTMLElement;
const profileToolsCopyEl = document.getElementById('profile-tools-copy') as HTMLElement;
const profileToolsListEl = document.getElementById('profile-tools-list') as HTMLElement;
const profileToolsOtherToggleEl = document.getElementById('profile-tools-other-toggle') as HTMLButtonElement;
const profileToolsOtherEl = document.getElementById('profile-tools-other') as HTMLElement;
const profileToolsOtherListEl = document.getElementById('profile-tools-other-list') as HTMLElement;
const profileToolsConfigEl = document.getElementById('profile-tools-config') as HTMLElement;
const profileToolsConfigOriginEl = document.getElementById('profile-tools-config-origin') as HTMLElement;
const profileToolsConfigTitleEl = document.getElementById('profile-tools-config-title') as HTMLElement;
const profileToolsConfigCopyEl = document.getElementById('profile-tools-config-copy') as HTMLElement;
const profileToolsScopeEl = document.getElementById('profile-tools-scope') as HTMLElement;
const profileToolsFocusEl = document.getElementById('profile-tools-focus') as HTMLTextAreaElement;
const profileToolsFormatFieldEl = document.getElementById('profile-tools-format-field') as HTMLElement;
const profileToolsFormatEl = document.getElementById('profile-tools-format') as HTMLSelectElement;
const profileToolsCountFieldEl = document.getElementById('profile-tools-count-field') as HTMLElement;
const profileToolsCountLabelEl = document.getElementById('profile-tools-count-label') as HTMLElement;
const profileToolsCountEl = document.getElementById('profile-tools-count') as HTMLSelectElement;
const profileToolsRunEl = document.getElementById('profile-tools-run') as HTMLButtonElement;
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
const brainManagerModelsEl = document.getElementById('brain-manager-models') as HTMLElement;
const brainManagerEffortEl = document.getElementById('brain-manager-effort') as HTMLSelectElement;
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
const newVaultModelsEl = document.getElementById('new-vault-models') as HTMLElement;
const newVaultEffortEl = document.getElementById('new-vault-effort') as HTMLSelectElement;
const newVaultPurposeEl = document.getElementById('new-vault-purpose') as HTMLTextAreaElement;
const newVaultPurposeLabelEl = document.getElementById('new-vault-purpose-label') as HTMLElement;
const newVaultErrorEl = document.getElementById('new-vault-error') as HTMLElement;
const newVaultCreateEl = document.getElementById('new-vault-create') as HTMLButtonElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GRAPH_LAYOUT_STORAGE_PREFIX = 'eva:graph-layout:v1:';
const GRAPH_MIN_ZOOM = 0.3;
const GRAPH_MAX_ZOOM = 2.5;
const INFRA_FILES = new Set(['log.md', 'eva.md', 'agents.md', 'claude.md']);

let vault: Vault | null = null;
let wholeGraph: Graph | null = null;
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
let graphCamera: GraphCamera = { x: 0, y: 0, zoom: 1 };
let graphPan: { pointerId: number; clientX: number; clientY: number; cameraX: number; cameraY: number; moved: boolean } | null = null;
let suppressGraphClickUntil = 0;
let lockGraphWhenSettled = false;
let floatingPanelPositions: Partial<Record<FloatingPanelName, FloatingPanelPosition>> = {};
let readerPanelSize: ReaderPanelSize | null = null;
let reviewId: number | null = null;
let reviewKind: 'ingest' | 'query' | null = null;
let latestQuery: { question: string; answer: QueryAnswer } | null = null;
let currentBrainSettings: BrainSettings | null = null;
let latestProfileTool: { tool: ProfileToolId; title: string; answer: QueryAnswer } | null = null;
let profileToolRunning = false;
let selectedProfileTool: ProfileToolId | null = null;
let selectedPageId: string | null = null;
let exploreQuery = '';
let exploreVisibleTypes = new Set<string>();
let exploreConnectionsOnly = false;
let exploreScopeEnabled = false;
let otherProfileToolsVisible = false;
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
    option.textContent = profileLabel(profile.id);
    select.appendChild(option);
  }
  select.value = profileDefinition(selected).id;
}

function selectedNewVaultProfile(): BrainProfileId {
  return profileDefinition(newVaultProfileEl.value).id;
}

type AgentChoice = 'codex' | 'claude';

interface AgentModelOption {
  value: string;
  label: string;
}

const AGENT_MODELS: Record<AgentChoice, AgentModelOption[]> = {
  codex: [
    { value: 'gpt-5.6', label: 'GPT-5.6' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
  ],
  claude: [
    { value: 'fable', label: 'Fable' },
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
  ],
};

const AGENT_EFFORTS: Record<AgentChoice, string[]> = {
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
};

const EFFORT_TRANSLATIONS: Record<string, TranslationKey> = {
  none: 'ai.none',
  minimal: 'ai.minimal',
  low: 'ai.low',
  medium: 'ai.medium',
  high: 'ai.high',
  xhigh: 'ai.xhigh',
  max: 'ai.max',
  ultra: 'ai.ultra',
};

function agentChoice(value: string): AgentChoice {
  return value === 'claude' ? 'claude' : 'codex';
}

function selectedAgentModel(modelsEl: HTMLElement): string {
  return modelsEl.querySelector<HTMLInputElement>('input:checked')?.value ?? '';
}

function populateAgentPreferences(
  agent: AgentChoice,
  modelsEl: HTMLElement,
  modelInputName: string,
  effort: HTMLSelectElement,
  selectedModel = selectedAgentModel(modelsEl),
  selectedEffort = effort.value,
): void {
  modelsEl.innerHTML = '';
  const models = [...AGENT_MODELS[agent]];
  if (selectedModel && !models.some((model) => model.value === selectedModel)) {
    models.push({ value: selectedModel, label: `${t('ai.savedModel')}: ${selectedModel}` });
  }
  for (const model of [{ value: '', label: t('ai.default') }, ...models]) {
    const card = document.createElement('label');
    card.className = 'model-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = modelInputName;
    input.value = model.value;
    input.checked = model.value === selectedModel;
    const name = document.createElement('span');
    name.className = 'model-choice-name';
    name.textContent = model.label;
    card.append(input, name);
    modelsEl.appendChild(card);
  }
  effort.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = t('ai.default');
  effort.appendChild(defaultOption);
  for (const value of AGENT_EFFORTS[agent]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(EFFORT_TRANSLATIONS[value]);
    effort.appendChild(option);
  }
  effort.value = AGENT_EFFORTS[agent].includes(selectedEffort) ? selectedEffort : '';
}

function updateNewVaultAgentPreferences(selectedModel?: string): void {
  populateAgentPreferences(
    agentChoice(selectedNewVaultAgent()),
    newVaultModelsEl,
    'new-vault-model',
    newVaultEffortEl,
    selectedModel,
  );
}

function updateBrainManagerAgentPreferences(selectedModel?: string): void {
  populateAgentPreferences(
    agentChoice(selectedBrainManagerAgent()),
    brainManagerModelsEl,
    'brain-manager-model',
    brainManagerEffortEl,
    selectedModel,
  );
}

function updateNewVaultProfileFrame(): void {
  const profile = profileDefinition(selectedNewVaultProfile());
  newVaultProfileDetailEl.textContent = ui('profile.detail');
  newVaultPurposeLabelEl.textContent = t('new.purpose');
  newVaultPurposeEl.placeholder = t('new.purposePlaceholder');
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
  document.querySelectorAll<HTMLElement>('[data-ui]').forEach((element) => {
    element.textContent = ui(element.dataset.ui as ChromeKey);
  });
  document.querySelectorAll<HTMLElement>('[data-ui-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', ui(element.dataset.uiPlaceholder as ChromeKey));
  });
  document.querySelectorAll<HTMLElement>('[data-ui-title]').forEach((element) => {
    element.title = ui(element.dataset.uiTitle as ChromeKey);
  });
  document.querySelectorAll<HTMLElement>('[data-ui-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', ui(element.dataset.uiAriaLabel as ChromeKey));
  });
  populateAppLanguageOptions();
  populateBrainProfileOptions(newVaultProfileEl, newVaultProfileEl.value || 'research');
  updateNewVaultProfileFrame();
  updateNewVaultAgentPreferences();
  updateBrainManagerAgentPreferences();
  if (!currentVault) vaultPathEl.textContent = t('nav.noBrain');
  const selectedId = svg.querySelector<SVGGElement>('.node.selected')?.dataset.id;
  if (vault) renderLegend(exploredPages());
  if (vault) renderExplorePanel();
  if (selectedId) select(selectedId);
  refreshRecentViews();
  if (!brainLibraryEl.hidden) void loadBrainLibrary();
  if (!brainManagerEl.hidden) renderBrainManager();
  if (!profileToolsEl.hidden) renderProfileTools();
  if (!lintPanelEl.hidden) renderLintPanel();
  if (!logPanelEl.hidden) renderLogPanel();
  if (!queryPanelEl.hidden && !queryPanelEl.classList.contains('is-processing')) setQueryRunning(false);
  updateGraphNavigation();
}

function setAppSettingsStatus(message: string | null): void {
  appSettingsStatusEl.hidden = !message;
  appSettingsStatusEl.textContent = message ?? '';
}

/* A brain map is a canvas, not a shelf behind the current panel. Operations
   are overlays and never move it. Only the Home target needs to follow a
   resized window while a reorganization is running. */
function updateExclusions(): void {
  const center = pageCenter();
  homeCenterX.x((node) => (isHomeNode(node) ? center.x : 0));
  homeCenterY.y((node) => (isHomeNode(node) ? center.y : 0));
}

function pageCenter(): { x: number; y: number } {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LAYOUT_START_ALPHA = 0.16;
const LAYOUT_REORGANIZE_ALPHA = 0.2;
const LAYOUT_ALPHA_DECAY = 0.018;
const LAYOUT_VELOCITY_DECAY = 0.8;

function isHomeNode(node: Pick<SimNode, 'id' | 'type'>): boolean {
  return node.id === 'index' || node.type === 'index';
}

// Labels are the reading surface of a brain graph, so their width belongs in
// the layout's physical model—not merely in the SVG paint. The cap keeps a
// single long title from claiming the entire canvas.
function nodeCollisionRadius(node: Pick<SimNode, 'title'>): number {
  return Math.min(150, Math.max(42, 20 + node.title.length * 3.1));
}

function typeClusterTargets(nodes: SimNode[], center: { x: number; y: number }): Map<string, { x: number; y: number }> {
  const types = [...new Set(nodes.filter((node) => !isHomeNode(node)).map((node) => node.type ?? 'untyped'))].sort();
  const targets = new Map<string, { x: number; y: number }>();
  const orbit = Math.max(290, 66 * Math.sqrt(Math.max(1, nodes.length - 1)));
  for (const [index, type] of types.entries()) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(types.length, 1);
    targets.set(type, {
      x: center.x + orbit * Math.cos(angle),
      y: center.y + orbit * Math.sin(angle),
    });
  }
  return targets;
}

function seedGraphNodes(nodes: SimNode[], center: { x: number; y: number }): void {
  const home = nodes.find(isHomeNode);
  if (home) {
    home.x = center.x;
    home.y = center.y;
    home.vx = 0;
    home.vy = 0;
  }
  const targets = typeClusterTargets(nodes, center);
  const byType = new Map<string, SimNode[]>();
  for (const node of nodes) {
    if (node === home) continue;
    const type = node.type ?? 'untyped';
    const group = byType.get(type) ?? [];
    group.push(node);
    byType.set(type, group);
  }
  for (const [type, group] of byType) {
    const target = targets.get(type) ?? center;
    for (const [index, node] of group.entries()) {
      const radius = 52 + 64 * Math.sqrt(index + 0.5);
      const angle = index * GOLDEN_ANGLE;
      node.x = target.x + radius * Math.cos(angle);
      node.y = target.y + radius * Math.sin(angle);
      node.vx = 0;
      node.vy = 0;
    }
  }
}

function graphStorageKey(): string | null {
  return currentVault ? `${GRAPH_LAYOUT_STORAGE_PREFIX}${currentVault}` : null;
}

const floatingPanels: Record<FloatingPanelName, HTMLElement> = {
  map: graphNavigationEl,
  legend: legendEl,
  reader: detailEl,
};

function normalizeFloatingPanelPositions(candidate: unknown): Partial<Record<FloatingPanelName, FloatingPanelPosition>> {
  if (!candidate || typeof candidate !== 'object') return {};
  const source = candidate as Record<string, unknown>;
  const positions: Partial<Record<FloatingPanelName, FloatingPanelPosition>> = {};
  for (const name of ['map', 'legend', 'reader'] as const) {
    const point = source[name];
    if (!point || typeof point !== 'object') continue;
    const { left, top } = point as Partial<FloatingPanelPosition>;
    if (typeof left !== 'number' || typeof top !== 'number' || !Number.isFinite(left) || !Number.isFinite(top)) continue;
    positions[name] = { left, top };
  }
  return positions;
}

function normalizeReaderPanelSize(candidate: unknown): ReaderPanelSize | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const { width, height } = candidate as Partial<ReaderPanelSize>;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width: Math.max(280, width), height: Math.max(220, height) };
}

function resetFloatingPanelPositions(): void {
  floatingPanelPositions = {};
  for (const panel of Object.values(floatingPanels)) {
    panel.style.removeProperty('left');
    panel.style.removeProperty('top');
    panel.style.removeProperty('right');
    panel.style.removeProperty('bottom');
  }
}

function resetReaderPanelSize(): void {
  readerPanelSize = null;
  detailEl.style.removeProperty('width');
  detailEl.style.removeProperty('height');
}

function applyFloatingPanelPositions(): void {
  for (const [name, point] of Object.entries(floatingPanelPositions) as [FloatingPanelName, FloatingPanelPosition][]) {
    const panel = floatingPanels[name];
    panel.style.left = `${point.left}px`;
    panel.style.top = `${point.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
}

function applyReaderPanelSize(): void {
  if (!readerPanelSize) return;
  detailEl.style.width = `${readerPanelSize.width}px`;
  detailEl.style.height = `${readerPanelSize.height}px`;
}

function normalizeGraphCamera(candidate: unknown): GraphCamera | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const { x, y, zoom } = candidate as Partial<GraphCamera>;
  if (![x, y, zoom].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return { x: x!, y: y!, zoom: Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, zoom!)) };
}

function readSavedGraphLayout(): SavedGraphLayout | null {
  const key = graphStorageKey();
  if (!key) return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const layout = parsed as Partial<SavedGraphLayout>;
    if (layout.version !== 1 || !layout.nodes || typeof layout.nodes !== 'object') return null;
    const camera = normalizeGraphCamera(layout.camera);
    if (!camera) return null;
    return { version: 1, camera, nodes: layout.nodes, floating: layout.floating, readerSize: layout.readerSize };
  } catch {
    return null;
  }
}

function applySavedGraphLayout(nodes: SimNode[]): boolean {
  resetFloatingPanelPositions();
  resetReaderPanelSize();
  const saved = readSavedGraphLayout();
  if (!saved) return false;
  graphCamera = saved.camera;
  floatingPanelPositions = normalizeFloatingPanelPositions(saved.floating);
  readerPanelSize = normalizeReaderPanelSize(saved.readerSize);
  applyFloatingPanelPositions();
  applyReaderPanelSize();
  let restored = 0;
  for (const node of nodes) {
    const point = saved.nodes[node.id];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    node.x = point.x;
    node.y = point.y;
    node.fx = point.x;
    node.fy = point.y;
    node.vx = 0;
    node.vy = 0;
    restored += 1;
  }
  return restored === nodes.length;
}

function persistGraphLayout(): void {
  const key = graphStorageKey();
  if (!key || simNodes.length === 0) return;
  const nodes: SavedGraphLayout['nodes'] = {};
  for (const node of simNodes) {
    const x = node.x ?? node.fx;
    const y = node.y ?? node.fy;
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    nodes[node.id] = { x, y };
  }
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        camera: graphCamera,
        nodes,
        floating: floatingPanelPositions,
        readerSize: readerPanelSize ?? undefined,
      } satisfies SavedGraphLayout),
    );
  } catch {
    // The map remains usable if this webview cannot write preferences.
  }
}

function lockGraphLayout(): void {
  for (const node of simNodes) {
    const x = node.x ?? node.fx;
    const y = node.y ?? node.fy;
    if (x == null || y == null) continue;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
  }
  refreshPositions?.();
  persistGraphLayout();
}

function viewportWorldSize(): { width: number; height: number } {
  return { width: window.innerWidth / graphCamera.zoom, height: window.innerHeight / graphCamera.zoom };
}

function applyGraphCamera(): void {
  const { width, height } = viewportWorldSize();
  svg.setAttribute('viewBox', `${graphCamera.x} ${graphCamera.y} ${width} ${height}`);
  graphZoomLevelEl.value = `${Math.round(graphCamera.zoom * 100)}%`;
  graphZoomLevelEl.textContent = graphZoomLevelEl.value;
}

function centerGraphCamera(zoom = 1): void {
  graphCamera.zoom = Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, zoom));
  const center = pageCenter();
  const { width, height } = viewportWorldSize();
  graphCamera.x = center.x - width / 2;
  graphCamera.y = center.y - height / 2;
  applyGraphCamera();
}

function graphPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const { width, height } = viewportWorldSize();
  return {
    x: graphCamera.x + ((clientX - rect.left) / rect.width) * width,
    y: graphCamera.y + ((clientY - rect.top) / rect.height) * height,
  };
}

function zoomGraphAt(clientX: number, clientY: number, nextZoom: number): void {
  const anchor = graphPointFromClient(clientX, clientY);
  graphCamera.zoom = Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, nextZoom));
  const rect = svg.getBoundingClientRect();
  const { width, height } = viewportWorldSize();
  graphCamera.x = anchor.x - ((clientX - rect.left) / rect.width) * width;
  graphCamera.y = anchor.y - ((clientY - rect.top) / rect.height) * height;
  applyGraphCamera();
}

function updateGraphNavigation(): void {
  const selectedId = svg.querySelector<SVGGElement>('.node.selected')?.dataset.id;
  const selected = selectedId ? simNodes.find((node) => node.id === selectedId) : null;
  graphNavigationEl.setAttribute('aria-label', ui('map.label'));
  graphZoomOutEl.setAttribute('aria-label', ui('map.zoomOut'));
  graphZoomOutEl.title = ui('map.zoomOut');
  graphZoomInEl.setAttribute('aria-label', ui('map.zoomIn'));
  graphZoomInEl.title = ui('map.zoomIn');
  graphShowAllEl.hidden = !selected && !exploreHasNarrowing();
  graphNavigationHintEl.textContent = selected ? ui('map.focus', { title: selected.title }) : ui('map.hint');
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
  seedGraphNodes(simNodes, center);
  homeCenterX.x((node) => (isHomeNode(node) ? center.x : 0));
  homeCenterY.y((node) => (isHomeNode(node) ? center.y : 0));
  centerGraphCamera();

  if (reducedMotion) {
    simulation.stop();
    simulation.alpha(1).tick(420);
    refreshPositions?.();
    lockGraphLayout();
  } else {
    lockGraphWhenSettled = true;
    simulation.alpha(LAYOUT_REORGANIZE_ALPHA).alphaTarget(0).restart();
  }
  setIngestStatus(ui('map.reorganized'), false);
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
  model: string;
  effort: string;
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
    loading.textContent = ui('library.loading');
    brainLibraryBodyEl.appendChild(loading);
    return;
  }
  if (brains.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'brain-library-empty';
    empty.textContent = ui('library.empty');
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
  if (!currentVault && newVaultEl.hidden && brainManagerEl.hidden && appSettingsEl.hidden) {
    emptyEl.hidden = false;
  }
  updateExclusions();
}

function showBrainLibrary(): void {
  // Choosing a local brain is its own first-screen task. Hide the launcher so
  // the library reads as one quiet destination, not a second sheet on top of
  // the opening choices.
  if (!currentVault) emptyEl.hidden = true;
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
    loading.textContent = ui('manager.loading');
    brainManagerListEl.appendChild(loading);
  } else if (brainManagerBrains.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'brain-manager-empty';
    empty.textContent = ui('manager.empty');
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
  brainManagerModulesEl.textContent = ui('profile.modules', { count: settings.modules.length });
  brainManagerLanguageEl.value = settings.language;
  brainManagerAgentEls.forEach((input) => {
    input.checked = input.value === settings.agent;
  });
  populateAgentPreferences(
    agentChoice(settings.agent),
    brainManagerModelsEl,
    'brain-manager-model',
    brainManagerEffortEl,
    settings.model,
    settings.effort,
  );
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
      model: selectedAgentModel(brainManagerModelsEl),
      effort: brainManagerEffortEl.value,
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
  populateAgentPreferences('codex', newVaultModelsEl, 'new-vault-model', newVaultEffortEl, '', '');
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
  syncOperationModal();
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
  syncOperationModal();
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
      model: selectedAgentModel(newVaultModelsEl),
      effort: newVaultEffortEl.value,
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
  // Any route into a brain completes the library flow. This also protects
  // against a late list refresh leaving the chooser over an opened brain.
  closeBrainLibrary();
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
  wholeGraph = buildGraph(vault);
  resetExploreState();
  issues = lintVault(vault);
  saveRecents([root, ...getRecents().filter((p) => p !== root)]);
  refreshRecentViews();
  vaultPathEl.textContent = `${basenameOf(root)} · ${ui('count.pages', { count: vault.pages.length })}`;
  vaultPathEl.title = root;
  emptyEl.hidden = true;
  commandEl.hidden = false;
  graphNavigationEl.hidden = false;
  closeSidePanels();
  renderLegend();
  renderGraph(wholeGraph);
  renderExplorePanel();
  updateExclusions();
}

function renderLegend(pages = vault?.pages ?? []): void {
  if (!vault) return;
  const present = new Set(pages.map((p) => p.type ?? 'untyped'));
  legendEl.innerHTML = '';
  for (const type of [...TYPE_ORDER, 'untyped']) {
    if (!present.has(type)) continue;
    const key = document.createElement('span');
    key.className = 'key';
    const dot = document.createElement('span');
    dot.className = 'type-dot';
    dot.style.setProperty('--dot', colorFor(type === 'untyped' ? null : type));
    key.append(dot, document.createTextNode(pageTypeLabel(type === 'untyped' ? null : type)));
    legendEl.appendChild(key);
  }
  legendEl.hidden = pages.length === 0;
}

function normalizeExploreText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

function allExploreTypes(): string[] {
  if (!vault) return [];
  return [...new Set(vault.pages.map((page) => page.type ?? 'untyped'))];
}

function resetExploreState(): void {
  exploreQuery = '';
  exploreVisibleTypes = new Set(allExploreTypes());
  exploreConnectionsOnly = false;
  exploreScopeEnabled = false;
  selectedPageId = null;
  exploreSearchEl.value = '';
  exploreScopeEl.checked = false;
}

function exploreHasNarrowing(): boolean {
  return Boolean(
    exploreQuery ||
    exploreConnectionsOnly ||
    (vault && exploreVisibleTypes.size !== allExploreTypes().length),
  );
}

function exploredPages(): Page[] {
  if (!vault) return [];
  const needle = normalizeExploreText(exploreQuery.trim());
  let pages = vault.pages.filter((page) => {
    const type = page.type ?? 'untyped';
    if (!exploreVisibleTypes.has(type)) return false;
    if (!needle) return true;
    const searchable = [page.title, page.id, page.type ?? '', ...Object.values(page.frontmatter), page.body].join('\n');
    return normalizeExploreText(searchable).includes(needle);
  });
  if (exploreConnectionsOnly && selectedPageId && wholeGraph) {
    const connected = new Set<string>([selectedPageId]);
    for (const edge of wholeGraph.edges) {
      if (edge.source === selectedPageId) connected.add(edge.target);
      if (edge.target === selectedPageId) connected.add(edge.source);
    }
    pages = pages.filter((page) => connected.has(page.id));
  }
  return pages;
}

function exploredGraph(pages = exploredPages()): Graph {
  if (!wholeGraph) return { nodes: [], edges: [] };
  const ids = new Set(pages.map((page) => page.id));
  return {
    nodes: wholeGraph.nodes.filter((node) => ids.has(node.id)),
    edges: wholeGraph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

function activeWorkingSetPageIds(): string[] {
  return exploreScopeEnabled ? exploredPages().map((page) => page.id) : [];
}

function renderWorkingSetNotes(): void {
  const pages = activeWorkingSetPageIds();
  const text = ui('explore.scopeActive', { count: pages.length });
  queryScopeEl.hidden = pages.length === 0;
  queryScopeEl.textContent = pages.length > 0 ? text : '';
  profileToolsScopeEl.hidden = pages.length === 0;
  profileToolsScopeEl.textContent = pages.length > 0 ? text : '';
}

function renderExplorePanel(): void {
  if (!vault) return;
  const pages = exploredPages();
  const types = allExploreTypes();
  exploreTypeFiltersEl.innerHTML = '';
  for (const type of [...TYPE_ORDER, 'untyped']) {
    if (!types.includes(type)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'explore-type-filter';
    button.classList.toggle('active', exploreVisibleTypes.has(type));
    button.setAttribute('aria-pressed', String(exploreVisibleTypes.has(type)));
    const dot = document.createElement('span');
    dot.className = 'type-dot';
    dot.style.setProperty('--dot', colorFor(type === 'untyped' ? null : type));
    button.append(dot, document.createTextNode(pageTypeLabel(type === 'untyped' ? null : type)));
    button.addEventListener('click', () => {
      if (exploreVisibleTypes.has(type)) exploreVisibleTypes.delete(type);
      else exploreVisibleTypes.add(type);
      applyExploreFilters();
    });
    exploreTypeFiltersEl.appendChild(button);
  }
  const hasSelection = selectedPageId !== null;
  exploreConnectedEl.disabled = !hasSelection;
  exploreConnectedEl.setAttribute('aria-pressed', String(exploreConnectionsOnly));
  exploreConnectedEl.classList.toggle('active', exploreConnectionsOnly);
  exploreScopeEl.checked = exploreScopeEnabled;
  exploreSummaryEl.textContent = ui('explore.visible', { count: pages.length });
  exploreResultsEl.innerHTML = '';
  if (pages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'explore-empty';
    empty.textContent = ui('explore.none');
    exploreResultsEl.appendChild(empty);
  } else {
    for (const page of pages.slice(0, 36)) {
      const result = document.createElement('button');
      result.type = 'button';
      result.className = 'explore-result';
      result.classList.toggle('selected', page.id === selectedPageId);
      const title = document.createElement('span');
      title.className = 'explore-result-title';
      title.textContent = page.title;
      const meta = document.createElement('span');
      meta.className = 'explore-result-meta';
      meta.textContent = `${pageTypeLabel(page.type)} · ${page.id}`;
      result.append(title, meta);
      result.addEventListener('click', () => select(page.id));
      exploreResultsEl.appendChild(result);
    }
  }
  renderWorkingSetNotes();
  opExploreEl.classList.toggle('active', !explorePanelEl.hidden || exploreHasNarrowing() || exploreScopeEnabled);
  opExploreEl.setAttribute('aria-pressed', String(!explorePanelEl.hidden));
}

function applyExploreFilters(): void {
  if (!vault || !wholeGraph) return;
  const pages = exploredPages();
  if (pages.length === 0) exploreScopeEnabled = false;
  const visibleIds = new Set(pages.map((page) => page.id));
  const selected = selectedPageId;
  if (selected && !visibleIds.has(selected)) {
    selectedPageId = null;
    detailEl.hidden = true;
  }
  renderLegend(pages);
  renderGraph(exploredGraph(pages));
  if (selectedPageId) select(selectedPageId);
  else updateGraphNavigation();
  renderExplorePanel();
}

function clearExploreFilters(): void {
  if (!vault) return;
  exploreQuery = '';
  exploreSearchEl.value = '';
  exploreVisibleTypes = new Set(allExploreTypes());
  exploreConnectionsOnly = false;
  exploreScopeEnabled = false;
  exploreScopeEl.checked = false;
  applyExploreFilters();
}

function showExplore(): void {
  if (!vault) return;
  explorePanelEl.hidden = false;
  renderExplorePanel();
  window.setTimeout(() => exploreSearchEl.focus(), 0);
}

function closeExplore(): void {
  explorePanelEl.hidden = true;
  renderExplorePanel();
}

function renderGraph(graph: Graph): void {
  simulation?.stop();
  lockGraphWhenSettled = false;
  // Seed Home at the page center, then spread page types into their own
  // regions. A large brain gets a larger map instead of a tighter knot.
  const center = pageCenter();
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  seedGraphNodes(nodes, center);
  const restoredWholeLayout = applySavedGraphLayout(nodes);
  if (restoredWholeLayout) applyGraphCamera();
  else centerGraphCamera();
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

  const stage = document.createElementNS(SVG_NS, 'g');
  stage.setAttribute('class', 'graph-stage');
  svg.appendChild(stage);

  const lineEls = links.map((link) => {
    const line = document.createElementNS(SVG_NS, 'line');
    const sourceId = (link.source as string | SimNode) instanceof Object
      ? (link.source as SimNode).id
      : (link.source as string);
    const targetId = (link.target as string | SimNode) instanceof Object
      ? (link.target as SimNode).id
      : (link.target as string);
    line.setAttribute('class', sourceId === 'index' || targetId === 'index' ? 'edge catalog-edge' : 'edge');
    line.dataset.source = sourceId;
    line.dataset.target = targetId;
    stage.appendChild(line);
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
    stage.appendChild(g);
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

  const clusterTargets = typeClusterTargets(nodes, center);
  const homeOrbit = Math.max(380, 78 * Math.sqrt(Math.max(1, nodes.length - 1)));
  const clusterStrength = nodes.length > 70 ? 0.009 : 0.016;
  centerX = forceX<SimNode>((node) =>
    isHomeNode(node) ? center.x : (clusterTargets.get(node.type ?? 'untyped')?.x ?? center.x),
  ).strength((node) => (isHomeNode(node) ? 0.08 : clusterStrength));
  centerY = forceY<SimNode>((node) =>
    isHomeNode(node) ? center.y : (clusterTargets.get(node.type ?? 'untyped')?.y ?? center.y),
  ).strength((node) => (isHomeNode(node) ? 0.08 : clusterStrength));
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
          isHomeNode(link.source as SimNode) || isHomeNode(link.target as SimNode) ? homeOrbit : 180,
        )
        .strength((link) =>
          isHomeNode(link.source as SimNode) || isHomeNode(link.target as SimNode) ? 0.035 : 0.3,
        ),
    )
    .force('charge', forceManyBody().strength(-460 * Math.max(1, Math.sqrt(nodes.length / 32))))
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
    .on('tick', updatePositions)
    .on('end', () => {
      if (!lockGraphWhenSettled) return;
      lockGraphWhenSettled = false;
      lockGraphLayout();
    });

  if (restoredWholeLayout) {
    simulation.stop();
    updatePositions();
  } else if (reducedMotion) {
    // Settle instantly for reduced-motion users, then freeze the resulting
    // atlas. There is never ambient drift.
    simulation.stop();
    simulation.tick(300);
    updatePositions();
    lockGraphLayout();
  } else {
    // One visible reflow when a map is first built; after that it is fixed
    // until the person explicitly reorganizes it.
    lockGraphWhenSettled = true;
    simulation.alpha(LAYOUT_START_ALPHA).alphaTarget(0).restart();
  }
}

/* Dragging: pointer events straight on the node group (the graph is hand-run
   SVG, not d3-selection). A dropped node becomes a fixed local placement;
   the rest of a dense map never needs to churn in response. */
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
    // A hand-placed node is exact intent. The map does not reheat the whole
    // simulation around a single move; this is what keeps dense brains calm.
    node.x = node.fx ?? node.x;
    node.y = node.fy ?? node.y;
    node.vx = 0;
    node.vy = 0;
    g.classList.add('pinned');
    refreshPositions?.();
    persistGraphLayout();
  };

  g.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // The graph is an interaction surface, never a text editor. Suppress the
    // browser's native selection gesture before pointer capture begins so a
    // drag across other labels cannot leave them highlighted.
    event.preventDefault();
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
  });

  g.addEventListener('pointermove', (event) => {
    if (activePointer !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 3) moved = true;
    const point = graphPointFromClient(event.clientX, event.clientY);
    node.fx = point.x;
    node.fy = point.y;
    node.x = point.x;
    node.y = point.y;
    refreshPositions?.();
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

/* Reader -------------------------------------------------------------------
   A brain is stored as Markdown, but reading it should not feel like opening
   the source file. This deliberately small renderer builds DOM nodes rather
   than trusting source HTML, so a local note cannot inject UI into Eva. */
const READER_INLINE_TOKEN = /(\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

function appendReaderInline(container: HTMLElement, value: string): void {
  let cursor = 0;
  for (const match of value.matchAll(READER_INLINE_TOKEN)) {
    const at = match.index ?? 0;
    if (at > cursor) container.append(document.createTextNode(value.slice(cursor, at)));
    const [token, , wikiTarget, wikiAlias, linkLabel, linkUrl, code, bold, italic] = match;
    if (wikiTarget) {
      const target = wikiTarget.trim();
      const label = (wikiAlias ?? target).trim();
      const resolved = vault ? resolveLink(vault, target) : null;
      if (resolved) {
        const link = document.createElement('a');
        link.className = 'reader-link';
        link.href = `#${encodeURIComponent(resolved.id)}`;
        link.textContent = label;
        link.title = `Open ${resolved.title}`;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          select(resolved.id);
        });
        container.appendChild(link);
      } else {
        const missing = document.createElement('span');
        missing.className = 'reader-link reader-link-missing';
        missing.textContent = label;
        missing.title = `No page matches ${target}`;
        container.appendChild(missing);
      }
    } else if (linkLabel && linkUrl) {
      const link = document.createElement('a');
      link.className = 'reader-external-link';
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = linkLabel;
      container.appendChild(link);
    } else if (code) {
      const inlineCode = document.createElement('code');
      inlineCode.textContent = code;
      container.appendChild(inlineCode);
    } else if (bold) {
      const strong = document.createElement('strong');
      strong.textContent = bold;
      container.appendChild(strong);
    } else if (italic) {
      const emphasis = document.createElement('em');
      emphasis.textContent = italic;
      container.appendChild(emphasis);
    } else {
      container.append(document.createTextNode(token));
    }
    cursor = at + token.length;
  }
  if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
}

function readerTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isReaderTableRule(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isReaderBlockStart(line: string): boolean {
  return /^(#{1,6}\s+|```|>\s?|[-+*]\s+|\d+\.\s+|---+\s*$)/.test(line) || isReaderTableRule(line);
}

function renderReaderBody(markdown: string): HTMLElement {
  const article = document.createElement('article');
  article.className = 'reader-body';
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      const element = document.createElement(`h${level}`);
      appendReaderInline(element, heading[2]);
      article.appendChild(element);
      index += 1;
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      article.appendChild(document.createElement('hr'));
      index += 1;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const source: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        source.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const code = document.createElement('pre');
      code.className = 'reader-code';
      if (language) code.dataset.language = language;
      code.textContent = source.join('\n');
      article.appendChild(code);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isReaderTableRule(lines[index + 1])) {
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const cell of readerTableRow(line)) {
        const th = document.createElement('th');
        appendReaderInline(th, cell);
        headRow.appendChild(th);
      }
      head.appendChild(headRow);
      table.appendChild(head);
      const body = document.createElement('tbody');
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|') && lines[index].trim()) {
        const row = document.createElement('tr');
        for (const cell of readerTableRow(lines[index])) {
          const td = document.createElement('td');
          appendReaderInline(td, cell);
          row.appendChild(td);
        }
        body.appendChild(row);
        index += 1;
      }
      table.appendChild(body);
      article.appendChild(table);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      const quote = document.createElement('blockquote');
      appendReaderInline(quote, quoteLines.join(' '));
      article.appendChild(quote);
      continue;
    }

    const unordered = /^[-+*]\s+(.+)$/.exec(line);
    const ordered = /^(\d+)\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const list = document.createElement(unordered ? 'ul' : 'ol');
      while (index < lines.length) {
        const itemMatch = unordered
          ? /^[-+*]\s+(.+)$/.exec(lines[index])
          : /^(\d+)\.\s+(.+)$/.exec(lines[index]);
        if (!itemMatch) break;
        const item = document.createElement('li');
        const task = /^\[([ xX])\]\s+(.+)$/.exec(itemMatch[1]);
        if (task) {
          const marker = document.createElement('span');
          marker.className = 'reader-task';
          marker.textContent = task[1].toLowerCase() === 'x' ? ui('reader.done') : ui('reader.todo');
          item.append(marker, document.createTextNode(' '));
          appendReaderInline(item, task[2]);
        } else {
          appendReaderInline(item, itemMatch[1]);
        }
        list.appendChild(item);
        index += 1;
      }
      article.appendChild(list);
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isReaderBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = document.createElement('p');
    appendReaderInline(paragraph, paragraphLines.join(' '));
    article.appendChild(paragraph);
  }

  if (article.childElementCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'reader-empty';
    empty.textContent = ui('reader.empty');
    article.appendChild(empty);
  }
  return article;
}

function select(id: string): void {
  if (!vault) return;
  const page = vault.byId.get(id);
  if (!page) return;
  selectedPageId = id;

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
  updateGraphNavigation();

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
  chip.append(dot, document.createTextNode(pageTypeLabel(page.type)));
  meta.append(pathSpan, chip);

  const lintBox = document.createElement('div');
  lintBox.className = 'lint';
  if (pageIssues.length === 0) {
    lintBox.classList.add('clean');
    lintBox.textContent = ui('health.pageClean');
  } else {
    for (const issue of pageIssues) {
      const item = document.createElement('div');
      item.className = `issue issue-${issue.rule}`;
      item.dataset.rule = issue.rule;
      item.textContent = issue.message;
      lintBox.appendChild(item);
    }
  }

  const body = renderReaderBody(page.body);

  sidebar.append(heading, meta, lintBox, body);
  detailEl.hidden = false;
  updateExclusions();
  renderExplorePanel();
}

function deselect(): void {
  selectedPageId = null;
  if (exploreConnectionsOnly) {
    exploreConnectionsOnly = false;
    applyExploreFilters();
    return;
  }
  detailEl.hidden = true;
  svg.classList.remove('focused');
  svg.querySelectorAll('.node.selected').forEach((el) => el.classList.remove('selected'));
  svg.querySelectorAll('.node.faded').forEach((el) => el.classList.remove('faded'));
  svg.querySelectorAll('line.edge').forEach((el) => el.classList.remove('lit', 'faded'));
  updateExclusions();
  updateGraphNavigation();
  renderExplorePanel();
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
  closeExplore();
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
  wholeGraph = null;
  issues = [];
  logRaw = null;
  currentVault = null;
  currentBrainSettings = null;
  resetExploreState();
  updateProfileToolsAvailability();
  healthReport = null;
  healthError = null;
  healthCheckRunning = false;
  vaultPathEl.textContent = t('nav.noBrain');
  vaultPathEl.title = '';
  legendEl.hidden = true;
  graphNavigationEl.hidden = true;
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
  return !newVaultEl.hidden || !queryPanelEl.hidden || !profileToolsEl.hidden || !lintPanelEl.hidden || !logPanelEl.hidden || !reviewEl.hidden || !brainManagerEl.hidden || !appSettingsEl.hidden;
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
    pending.textContent = ui('health.pending');
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
    clean.textContent = ui('health.none');
    section.appendChild(clean);
    return;
  }
  for (const finding of healthReport.findings) {
    const item = document.createElement('article');
    item.className = `health-finding health-${healthKindClass(finding.kind)}`;
    const kind = document.createElement('span');
    kind.className = 'health-kind';
    kind.textContent = ui(`health.kind.${finding.kind}` as ChromeKey);
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
      next.textContent = `${ui('health.next')} ${finding.nextStep}`;
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
  setIngestStatus(ui('health.checkingStatus'), true);
  try {
    const report = await invoke<HealthReport>('health_check_run', { vault: vaultPath });
    if (currentVault !== vaultPath) return;
    healthReport = report;
    setIngestStatus(
      ui('health.findings', { count: report.findings.length }),
      false,
    );
  } catch (error) {
    if (currentVault === vaultPath) {
      healthError = String(error);
      setIngestStatus(ui('health.failed'), false);
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
  lintSubEl.textContent = `${ui('count.issues', { count: issues.length })} · ${ui('count.pages', { count: vault.pages.length })}`;
  lintBodyEl.innerHTML = '';

  const structural = document.createElement('p');
  structural.className = 'recent-label';
  structural.textContent = ui('health.structural');
  lintBodyEl.appendChild(structural);

  if (issues.length === 0) {
    const clean = document.createElement('p');
    clean.className = 'lint-clean';
    clean.textContent = ui('health.clean');
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
  healthLabel.textContent = ui('health.advisory');
  const intro = document.createElement('p');
  intro.className = 'health-intro';
  intro.textContent = ui('health.intro');
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'btn-stamp aux';
  run.textContent = healthCheckRunning ? ui('health.running') : healthReport ? ui('health.runAgain') : ui('health.run');
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
    const raw = renderReaderBody(logRaw.trim());
    raw.classList.add('log-reader');
    logBodyEl.appendChild(raw);
    return;
  }
  logSubEl.textContent = `log.md · ${ui('count.entries', { count: entries.length })} · ${ui('log.newest')}`;
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
    appendReaderInline(title, entry.title);
    const body = renderReaderBody(entry.body.trim());
    body.classList.add('log-body');
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
  renderWorkingSetNotes();
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
  const available = currentVault !== null;
  opProfileToolsEl.hidden = !available;
  opProfileToolsEl.title = available ? ui('tool.menu') : '';
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
  profileToolsEl.querySelectorAll<HTMLButtonElement>('.profile-tool, .profile-tool-other, #profile-tools-other-toggle, #profile-tools-run').forEach((button) => {
    button.disabled = running;
  });
  opProfileToolsEl.classList.toggle('active', running);
}

function profileToolEntry(id: ProfileToolId) {
  for (const profile of BRAIN_PROFILES) {
    const tool = profile.tools.find((candidate) => candidate.id === id);
    if (tool) return { profile, tool };
  }
  return null;
}

function renderProfileToolButton(
  tool: (typeof BRAIN_PROFILES)[number]['tools'][number],
  className: 'profile-tool' | 'profile-tool-other',
  origin?: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.classList.toggle('selected', selectedProfileTool === tool.id);
  if (origin) {
    const source = document.createElement('span');
    source.className = 'profile-tool-origin';
    source.textContent = origin;
    button.appendChild(source);
  }
  const title = document.createElement('span');
  title.className = 'profile-tool-title';
  title.textContent = toolLabel(tool.id);
  const detail = document.createElement('span');
  detail.className = 'profile-tool-detail';
  detail.textContent = ui('tool.detail');
  button.append(title, detail);
  button.addEventListener('click', () => selectProfileTool(tool.id));
  return button;
}

function renderProfileTools(): void {
  const profile = openProfileDefinition();
  profileToolsKickerEl.textContent = profileLabel(profile.id);
  document.getElementById('profile-tools-title')!.textContent = profileLabel(profile.id);
  profileToolsCopyEl.textContent = ui('profile.detail');
  profileToolsListEl.innerHTML = '';
  for (const tool of profile.tools) {
    profileToolsListEl.appendChild(renderProfileToolButton(tool, 'profile-tool'));
  }

  const otherProfiles = BRAIN_PROFILES.filter((candidate) => candidate.id !== profile.id && candidate.tools.length > 0);
  const otherToolCount = otherProfiles.reduce((total, candidate) => total + candidate.tools.length, 0);
  profileToolsOtherToggleEl.textContent = ui('tool.other', { count: otherToolCount });
  profileToolsOtherToggleEl.hidden = otherToolCount === 0;
  profileToolsOtherToggleEl.setAttribute('aria-expanded', String(otherProfileToolsVisible));
  profileToolsOtherEl.hidden = !otherProfileToolsVisible;
  profileToolsOtherListEl.innerHTML = '';
  if (otherProfileToolsVisible) {
    for (const otherProfile of otherProfiles) {
      for (const tool of otherProfile.tools) {
        profileToolsOtherListEl.appendChild(renderProfileToolButton(tool, 'profile-tool-other', profileLabel(otherProfile.id)));
      }
    }
  }
}

function selectProfileTool(tool: ProfileToolId): void {
  const entry = profileToolEntry(tool);
  if (!entry) return;
  selectedProfileTool = tool;
  latestProfileTool = null;
  profileToolsResultEl.hidden = true;
  profileToolsFocusEl.value = '';
  profileToolsConfigOriginEl.textContent = entry.profile.id === openProfileDefinition().id
    ? ui('tool.primary')
    : ui('tool.crossProfile', { profile: profileLabel(entry.profile.id) });
  profileToolsConfigTitleEl.textContent = toolLabel(entry.tool.id);
  profileToolsConfigCopyEl.textContent = ui('tool.detail');
  profileToolsFocusEl.placeholder = ui('tool.focusPlaceholder');
  profileToolsFormatFieldEl.hidden = !('formatOptions' in entry.tool);
  profileToolsFormatEl.innerHTML = '';
  if ('formatOptions' in entry.tool) {
    for (const option of entry.tool.formatOptions) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = ui(`format.${option.value}` as ChromeKey);
      profileToolsFormatEl.appendChild(element);
    }
  }
  profileToolsCountFieldEl.hidden = !('countOptions' in entry.tool);
  profileToolsCountEl.innerHTML = '';
  if ('countOptions' in entry.tool) {
    profileToolsCountLabelEl.textContent = entry.tool.id === 'flashcards' ? ui('tool.flashcards') : ui('tool.questions');
    for (const count of entry.tool.countOptions) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = String(count);
      profileToolsCountEl.appendChild(option);
    }
    if (entry.tool.countOptions.length > 1) profileToolsCountEl.selectedIndex = 1;
  }
  profileToolsRunEl.textContent = ui('tool.run', { tool: toolLabel(entry.tool.id) });
  profileToolsConfigEl.hidden = false;
  renderProfileTools();
  window.setTimeout(() => profileToolsFocusEl.focus(), 0);
}

function closeProfileTools(): void {
  profileToolsEl.hidden = true;
  profileToolsResultEl.hidden = true;
  profileToolsCitationsEl.innerHTML = '';
  latestProfileTool = null;
  selectedProfileTool = null;
  otherProfileToolsVisible = false;
  profileToolsConfigEl.hidden = true;
  setProfileToolsError(null);
  setProfileToolRunning(false);
  syncOperationModal();
}

function showProfileTools(): void {
  if (!currentVault) return;
  if (!queryPanelEl.hidden) closeQuery();
  closeSidePanels();
  latestProfileTool = null;
  selectedProfileTool = null;
  otherProfileToolsVisible = false;
  profileToolsConfigEl.hidden = true;
  profileToolsResultEl.hidden = true;
  setProfileToolsError(null);
  setProfileToolRunning(false);
  renderProfileTools();
  renderWorkingSetNotes();
  profileToolsEl.hidden = false;
  syncOperationModal();
  window.setTimeout(() => {
    (profileToolsListEl.querySelector<HTMLButtonElement>('button') ?? profileToolsOtherToggleEl).focus();
  }, 0);
}

function renderProfileToolResult(result: ProfileToolResult): void {
  profileToolsResultTitleEl.textContent = result.title;
  profileToolsContentEl.textContent = result.content;
  profileToolsCitationsEl.innerHTML = '';
  if (result.citations.length === 0) {
    const none = document.createElement('p');
    none.className = 'query-no-citations';
    none.textContent = ui('tool.none');
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

async function runProfileTool(): Promise<void> {
  if (!currentVault || !selectedProfileTool || profileToolRunning) return;
  const entry = profileToolEntry(selectedProfileTool);
  if (!entry) return;
  setProfileToolsError(null);
  profileToolsResultEl.hidden = true;
  setProfileToolRunning(true);
  try {
    const options = {
      focus: profileToolsFocusEl.value.trim(),
      format: profileToolsFormatFieldEl.hidden ? '' : profileToolsFormatEl.value,
      count: profileToolsCountFieldEl.hidden || !profileToolsCountEl.value ? null : Number(profileToolsCountEl.value),
    };
    const result = await invoke<ProfileToolResult>('profile_tool_run', {
      vault: currentVault,
      tool: selectedProfileTool,
      options,
      scope: activeWorkingSetPageIds(),
    });
    latestProfileTool = {
      tool: selectedProfileTool,
      title: result.title,
      answer: { answer: result.content, citations: result.citations },
    };
    profileToolsKickerEl.textContent = toolLabel(entry.tool.id);
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
  const tool = profileToolEntry(latestProfileTool.tool)?.tool;
  profileToolsSaveEl.disabled = true;
  setProfileToolsError(null);
  setProfileToolRunning(true, 'Preparing review…');
  try {
    const review = await invoke<QueryReviewPayload>('query_save', {
      vault: currentVault,
      question: `${tool ? toolLabel(tool.id) : ui('tool.result')} · ${profileLabel(profile.id)}`,
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
    const answer = await invoke<QueryAnswer>('query_run', {
      vault: currentVault,
      question,
      scope: activeWorkingSetPageIds(),
    });
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
  brainManagerModulesEl.textContent = ui('profile.modules', { count: profile.modules.length });
});
brainManagerAgentEls.forEach((input) =>
  input.addEventListener('change', () => {
    updateBrainManagerAgentPreferences('');
  }),
);
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
    updateNewVaultAgentPreferences('');
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
opExploreEl.addEventListener('click', () => {
  if (explorePanelEl.hidden) showExplore();
  else closeExplore();
});
document.getElementById('explore-close')!.addEventListener('click', closeExplore);
exploreSearchEl.addEventListener('input', () => {
  exploreQuery = exploreSearchEl.value;
  applyExploreFilters();
});
exploreConnectedEl.addEventListener('click', () => {
  if (!selectedPageId) return;
  exploreConnectionsOnly = !exploreConnectionsOnly;
  applyExploreFilters();
});
exploreScopeEl.addEventListener('change', () => {
  exploreScopeEnabled = exploreScopeEl.checked;
  renderExplorePanel();
});
exploreClearEl.addEventListener('click', clearExploreFilters);
opQueryEl.addEventListener('click', showQuery);
opProfileToolsEl.addEventListener('click', showProfileTools);
document.getElementById('profile-tools-close')!.addEventListener('click', closeProfileTools);
profileToolsOtherToggleEl.addEventListener('click', () => {
  otherProfileToolsVisible = !otherProfileToolsVisible;
  renderProfileTools();
});
profileToolsRunEl.addEventListener('click', () => void runProfileTool());
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

function makeFloatingPanelDraggable(
  panel: HTMLElement,
  name: FloatingPanelName,
  isHandle: (target: Element | null) => boolean,
): void {
  let drag: { pointerId: number; clientX: number; clientY: number; left: number; top: number; moved: boolean } | null = null;

  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    panel.classList.remove('is-dragging');
    try {
      panel.releasePointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers are never captured */
    }
    if (moved) persistGraphLayout();
  };

  panel.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!isHandle(target)) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    panel.classList.add('is-dragging');
    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers are never captured */
    }
  });

  panel.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    if (Math.hypot(deltaX, deltaY) > 3) drag.moved = true;
    const rect = panel.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, drag.left + deltaX));
    const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, drag.top + deltaY));
    floatingPanelPositions[name] = { left, top };
    applyFloatingPanelPositions();
  });

  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);
}

makeFloatingPanelDraggable(graphNavigationEl, 'map', (target) => Boolean(target?.closest('.graph-navigation-kicker')));
makeFloatingPanelDraggable(legendEl, 'legend', () => true);
makeFloatingPanelDraggable(detailEl, 'reader', (target) => Boolean(target?.closest('.detail-drag-handle')));

let readerResizeFrame: number | null = null;
const readerResizeObserver = new ResizeObserver(() => {
  if (detailEl.hidden || readerResizeFrame != null) return;
  readerResizeFrame = requestAnimationFrame(() => {
    readerResizeFrame = null;
    if (detailEl.hidden) return;
    const { width, height } = detailEl.getBoundingClientRect();
    readerPanelSize = { width: Math.round(width), height: Math.round(height) };
    persistGraphLayout();
  });
});
readerResizeObserver.observe(detailEl);

graphZoomOutEl.addEventListener('click', () => {
  zoomGraphAt(window.innerWidth / 2, window.innerHeight / 2, graphCamera.zoom / 1.22);
  persistGraphLayout();
});
graphZoomInEl.addEventListener('click', () => {
  zoomGraphAt(window.innerWidth / 2, window.innerHeight / 2, graphCamera.zoom * 1.22);
  persistGraphLayout();
});
graphCenterViewEl.addEventListener('click', () => {
  centerGraphCamera();
  persistGraphLayout();
});
graphShowAllEl.addEventListener('click', () => {
  if (exploreHasNarrowing()) clearExploreFilters();
  deselect();
});

svg.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.node')) return;
  event.preventDefault();
  graphPan = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    cameraX: graphCamera.x,
    cameraY: graphCamera.y,
    moved: false,
  };
  svg.classList.add('is-panning');
  try {
    svg.setPointerCapture(event.pointerId);
  } catch {
    /* synthetic pointers are never captured */
  }
});

svg.addEventListener('pointermove', (event) => {
  if (!graphPan || graphPan.pointerId !== event.pointerId) return;
  event.preventDefault();
  if (Math.hypot(event.clientX - graphPan.clientX, event.clientY - graphPan.clientY) > 3) graphPan.moved = true;
  graphCamera.x = graphPan.cameraX - (event.clientX - graphPan.clientX) / graphCamera.zoom;
  graphCamera.y = graphPan.cameraY - (event.clientY - graphPan.clientY) / graphCamera.zoom;
  applyGraphCamera();
});

const endGraphPan = (event: PointerEvent) => {
  if (!graphPan || graphPan.pointerId !== event.pointerId) return;
  const moved = graphPan.moved;
  graphPan = null;
  if (moved) suppressGraphClickUntil = Date.now() + 180;
  svg.classList.remove('is-panning');
  try {
    svg.releasePointerCapture(event.pointerId);
  } catch {
    /* synthetic pointers are never captured */
  }
  persistGraphLayout();
};
svg.addEventListener('pointerup', endGraphPan);
svg.addEventListener('pointercancel', endGraphPan);
svg.addEventListener('wheel', (event) => {
  if (!vault) return;
  event.preventDefault();
  const multiplier = Math.exp(-event.deltaY * 0.0015);
  zoomGraphAt(event.clientX, event.clientY, graphCamera.zoom * multiplier);
  persistGraphLayout();
}, { passive: false });
svg.addEventListener('click', () => {
  if (Date.now() < suppressGraphClickUntil) return;
  deselect();
});
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
  if (!explorePanelEl.hidden) {
    closeExplore();
    return;
  }
  if (!lintPanelEl.hidden || !logPanelEl.hidden) {
    closeSidePanels();
    return;
  }
  deselect();
});

window.addEventListener('resize', () => {
  updateExclusions();
  if (!vault) return;
  applyGraphCamera();
  refreshPositions?.();
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
