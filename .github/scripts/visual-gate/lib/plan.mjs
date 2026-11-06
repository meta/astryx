// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shot plan: which (story, theme, mode) combinations the visual gate
 *       captures, and why each one is in the set.
 *
 * @input  the Storybook index, the theming-target enumeration
 *         (packages/cli/foundation/discovery/theming-targets.mjs), and the
 *         built theme packages
 * @output a deterministic, ordered list of shots, each carrying the reason it
 *         exists
 *
 * A theme binds to components through theming targets — a class name plus the
 * variant/state data on it. Nothing in the type system notices when a
 * component stops rendering the element a theme targets: `astryx theme build`
 * validates that an override KEY exists, so a renamed class is caught, but an
 * override that silently stops painting (element moved behind a wrapper, state
 * no longer reflected, cascade order changed) is invisible until someone looks
 * at the pixels. That is what this plan aims the camera at.
 *
 * The canonical release baseline is deliberately small and closed:
 *
 *   surface — one representative story per Core component, plus explicit
 *     visual-baseline / visual-theme-matrix stories, in Neutral light and dark.
 *   probe — the smallest story set that renders every theming target, in the
 *     generated Probe fixture light and dark.
 *
 * `theme-matrix` remains available for focused theme evidence, but it does not
 * own permanent baseline keys. `full` widens `surface` to every story for an
 * explicit audit.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Storybook globals the preview reads. Keep in sync with apps/storybook/.storybook/preview.tsx. */
export const MODES = ['light', 'dark'];

/** Story names preferred as a component's representative, most preferred first. */
const REPRESENTATIVE_NAMES = ['Default', 'Basic', 'Primary', 'Overview', 'Example'];

/** A story carrying this tag is captured in the default theme for a touched component. */
export const VISUAL_BASELINE_TAG = 'visual-baseline';

/** A story carrying this tag is captured in every accepted theme for a touched component. */
export const VISUAL_THEME_MATRIX_TAG = 'visual-theme-matrix';

/** A story carrying this tag is never captured (see visual-gate.config.json for the reasoned list). */
export const SKIP_TAG = 'no-visual';


/** Workspace package manifests are the only package eligibility source. */
export function readPackageCatalog(repoRoot) {
  const files = [];
  for (const parent of [path.join(repoRoot, 'packages'), path.join(repoRoot, 'packages/themes')]) {
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const file = path.join(parent, entry.name, 'package.json');
      if (fs.existsSync(file)) files.push(file);
    }
  }
  return new Map(files.map(file => {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [manifest.name, manifest];
  }));
}

export function packageFromComponentPath(componentPath) {
  if (!componentPath) return null;
  const normalized = componentPath.replaceAll('\\', '/');
  const names = new Set();
  for (const match of normalized.matchAll(/(?:^|\/)node_modules\/(@[^/]+\/[^/]+|[^/]+)(?=\/|$)/g)) {
    names.add(match[1]);
  }
  for (const match of normalized.matchAll(/(?:^|\/)packages\/(themes\/[^/]+|[^/]+)(?=\/|$)/g)) {
    const [group, leaf] = match[1].split('/');
    names.add(leaf ? `@astryxdesign/theme-${leaf}` : `@astryxdesign/${group}`);
  }
  const bare = normalized.match(/^(@[^/]+\/[^/]+)(?:\/.*)?$/);
  if (bare) names.add(bare[1]);
  if (names.size > 1) throw new Error(`Ambiguous Storybook componentPath: ${componentPath}`);
  if (names.size === 0) throw new Error(`Unsupported Storybook componentPath: ${componentPath}`);
  return [...names][0];
}

function eligible(manifest) {
  return manifest.private !== true && manifest.astryx?.canaryOnly !== true;
}

function titlePackage(title, catalog, candidates = null) {
  const parts = String(title ?? '').split('/').filter(Boolean);
  const wanted = [];
  if (parts[0]) wanted.push(`@astryxdesign/${parts[0].toLowerCase()}`);
  if (parts.at(-1)?.endsWith(' Theme')) {
    const slug = parts.at(-1).slice(0, -6).trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
    wanted.unshift(`@astryxdesign/theme-${slug}`);
  }
  return wanted.find(name => catalog.has(name) && (!candidates || candidates.includes(name))) ?? null;
}

function storyPackageNames(entry, storybookDir, repoRoot, catalog) {
  const fromComponent = packageFromComponentPath(entry.componentPath);
  const titleOwner = titlePackage(entry.title, catalog);
  let names = fromComponent ? [fromComponent] : [];
  if (!fromComponent) {
    const relative = entry.importPath?.replace(/^\.\//, '');
    const source = relative && path.resolve(path.dirname(storybookDir), relative);
    if (source && fs.existsSync(source)) {
      const text = fs.readFileSync(source, 'utf8');
      names = [...new Set([...text.matchAll(/(?:from\s+|import\s*)['"](@astryxdesign\/[^/'"]+)/g)].map(match => match[1]))].sort();
    } else if (titleOwner) {
      // Trusted workflow_run jobs inspect PR-built Storybook artifacts from a
      // default-branch checkout. A new PR-only story has no local source yet,
      // so use its package-scoped Storybook title when that title names one
      // known workspace package.
      names = [titleOwner];
    } else {
      throw new Error(`Story ${entry.id} has no resolvable package metadata.`);
    }
  }
  const scopedTitleOwner = titlePackage(entry.title, catalog, names);
  const themeOwner = titleOwner?.startsWith('@astryxdesign/theme-') ? titleOwner : null;
  const owner =
    fromComponent ??
    themeOwner ??
    scopedTitleOwner ??
    (names.length === 1 ? names[0] : null);
  if (!owner) throw new Error(`Story ${entry.id} has ambiguous package ownership: ${names.join(', ')}.`);
  for (const name of new Set([...names, owner])) {
    if (!catalog.has(name)) throw new Error(`Story ${entry.id} names unknown package ${name}.`);
  }
  return {
    packageNames: names.length ? names : [owner],
    packageName: owner,
    // The package that OWNS the component's source, when Storybook recorded
    // one. `packageName` can be inferred from imports or from the title, so it
    // says which package a story belongs to; this says which package publishes
    // the thing it photographs, and only that answers "may this story own a
    // canonical baseline frame".
    componentPackage: fromComponent ?? null,
    stableVisual: eligible(catalog.get(owner)),
  };
}

/**
 * @param {string} repoRoot
 * @param {string[]} [fixtureThemes] - private generated themes allowed to own baseline coverage
 */
export function readThemeCatalog(repoRoot, fixtureThemes = []) {
  const catalog = readPackageCatalog(repoRoot);
  const fixtures = new Set(fixtureThemes);
  const themes = {};
  const parent = path.join(repoRoot, 'packages/themes');
  if (!fs.existsSync(parent)) return themes;
  for (const entry of fs.readdirSync(parent, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const manifest = catalog.get(`@astryxdesign/theme-${entry.name}`);
    if (!manifest) continue;
    themes[entry.name] = {
      packageName: manifest.name,
      stableVisual:
        fixtures.has(entry.name) ||
        (manifest.private !== true && manifest.astryx?.canaryOnly !== true),
      coverageFixture: fixtures.has(entry.name),
    };
  }
  return themes;
}

export function withThemeMetadata(shots, themes) {
  return shots.map(shot => {
    const theme = themes[shot.theme];
    if (!theme) throw new Error(`Shot ${shot.key} names unknown theme ${shot.theme}.`);
    return {...shot, themePackageName: theme.packageName, stableThemeVisual: theme.stableVisual};
  });
}

function baselinePackage(shot, repoRoot, catalog) {
  if (shot.packageName && catalog.has(shot.packageName)) {
    return {packageName: shot.packageName, source: 'stored-package'};
  }
  const component = String(shot.component ?? '').trim();
  if (component) {
    const owners = [...catalog.keys()].filter(name => {
      if (!name.startsWith('@astryxdesign/') || name.includes('/theme-')) return false;
      const leaf = name.slice('@astryxdesign/'.length);
      return fs.existsSync(path.join(repoRoot, 'packages', leaf, 'src', component));
    });
    if (owners.length === 1) return {packageName: owners[0], source: 'stored-component'};
  }
  const fromTitle = titlePackage(shot.title, catalog);
  return fromTitle ? {packageName: fromTitle, source: 'stored-title'} : null;
}

export function accountBaseline(manifest, stories, themes, repoRoot) {
  const catalog = readPackageCatalog(repoRoot);
  const byId = new Map(stories.map(story => [story.id, story]));
  const stable = {};
  const categories = {
    currentStable: [],
    intentionallyExcluded: [],
    preservedLegacy: [],
    unclassified: [],
  };
  for (const [key, shot] of Object.entries(manifest.shots ?? {})) {
    const currentStory = byId.get(shot.storyId);
    const owner = shot.packageName && catalog.has(shot.packageName)
      ? {
          packageName: shot.packageName,
          source: shot.membershipSource ?? 'stored-package',
        }
      : currentStory
        ? {packageName: currentStory.packageName, source: 'current-story'}
        : baselinePackage(shot, repoRoot, catalog);
    const storedTheme = shot.themePackageName
      ? catalog.get(shot.themePackageName)
      : null;
    const currentTheme = themes[shot.theme];
    const theme =
      storedTheme && currentTheme?.packageName !== storedTheme.name
        ? null
        : currentTheme;
    if (!owner || !catalog.has(owner.packageName) || !theme) {
      categories.unclassified.push(key);
      continue;
    }
    const state = eligible(catalog.get(owner.packageName)) && theme.stableVisual
      ? 'stable'
      : 'ineligible';
    if (state === 'ineligible') {
      categories.intentionallyExcluded.push(key);
      continue;
    }
    const story = byId.get(shot.storyId);
    const value = {
      ...shot,
      packageName: owner.packageName,
      packageNames: story?.packageNames ?? [owner.packageName],
      stableVisual: true,
      themePackageName: theme.packageName,
      stableThemeVisual: true,
      membershipSource: owner.source,
    };
    stable[key] = value;
    (story ? categories.currentStable : categories.preservedLegacy).push(key);
  }
  for (const values of Object.values(categories)) values.sort();
  const total = Object.keys(manifest.shots ?? {}).length;
  const classified = Object.values(categories).reduce((sum, values) => sum + values.length, 0);
  if (classified !== total) throw new Error(`Baseline accounting overlap: ${classified} states for ${total} keys.`);
  return {manifest: {...manifest, shots: stable}, categories, total};
}

export function summarizeBaselineAccounting(account, releaseShots) {
  const planned = new Set(releaseShots.map(shot => shot.key));
  const policyExcluded = account.categories.currentStable.filter(
    key => !planned.has(key),
  );
  const unclassified = [...account.categories.unclassified];
  const plannedCurrentStable =
    account.categories.currentStable.length - policyExcluded.length;
  const counts = {
    total: account.total,
    plannedCurrentStable,
    policyExcluded: policyExcluded.length,
    intentionallyExcluded: account.categories.intentionallyExcluded.length,
    preservedLegacy: account.categories.preservedLegacy.length,
    unclassified: unclassified.length,
  };
  const sum =
    counts.plannedCurrentStable +
    counts.policyExcluded +
    counts.intentionallyExcluded +
    counts.preservedLegacy +
    counts.unclassified;
  if (sum !== counts.total) throw new Error(`Baseline accounting overlap: ${sum} states for ${counts.total} keys.`);
  return {
    ...counts,
    ...(unclassified.length ? {unclassifiedKeys: unclassified} : {}),
  };
}

export function stableBaseline(manifest, stories, themes, repoRoot) {
  return accountBaseline(manifest, stories, themes, repoRoot).manifest;
}

export function withBaselineCoverage(plan, {stories, baselineManifest, themes}) {
  const planned = new Map(plan.map(shot => [shot.key, shot]));
  const byId = new Map(stories.map(story => [story.id, story]));
  for (const [key, baseline] of Object.entries(baselineManifest.shots ?? {})) {
    const story = byId.get(baseline.storyId);
    if (!story || !themes[baseline.theme] || !MODES.includes(baseline.mode)) continue;
    const shot = {...toShotBase(story), theme: baseline.theme, mode: baseline.mode};
    if (shotKey(shot) !== key) continue;
    const existing = planned.get(key);
    planned.set(key, existing
      ? {...existing, reasons: [...new Set([...existing.reasons, 'baseline'])]}
      : {...shot, key, reasons: ['baseline']});
  }
  return [...planned.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function createReleasePlan(shots) {
  const keys = shots.map(shot => shot.key).sort();
  if (new Set(keys).size !== keys.length) throw new Error('Canonical release plan repeats a shot key.');
  return {
    version: 1,
    lane: 'stable-release',
    authority: 'report-removals',
    keys,
    digest: crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex'),
  };
}

/**
 * @typedef {object} Shot
 * @property {string} key - stable identity of the shot; also its file name
 * @property {string} storyId
 * @property {string} title - Storybook title, for the report
 * @property {string} name - story name, for the report
 * @property {string} component - the component this story renders
 * @property {string} packageName
 * @property {string[]} packageNames
 * @property {boolean} stableVisual
 * @property {string} theme
 * @property {string} themePackageName
 * @property {boolean} stableThemeVisual
 * @property {'light'|'dark'} mode
 * @property {string[]} reasons - why the shot is in the plan
 */

/**
 * Read the story entries of a built Storybook index, dropping docs pages and
 * anything opted out.
 *
 * An exclusion may name one story id, or end in `*` to cover a whole story
 * file — a component whose every story streams live data has no stable story
 * to fall back to, and excluding them one at a time just promotes the next
 * unstable one into the plan.
 *
 * @param {string} storybookDir
 * @param {Iterable<string>} excluded - story ids (or `prefix*`) excluded by config
 * @returns {Array<{id: string, title: string, name: string, component: string, tags: string[], packageNames: string[], packageName: string, componentPackage: string | null, stableVisual: boolean}>}
 */
export function readStoryIndex(storybookDir, excluded = [], repoRoot) {
  const exclusions = [...excluded];
  const isExcluded = id =>
    exclusions.some(rule =>
      rule.endsWith('*') ? id.startsWith(rule.slice(0, -1)) : id === rule,
    );
  const indexPath = path.join(storybookDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `No Storybook index at ${indexPath} — build Storybook first (pnpm storybook:build).`,
    );
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const catalog = readPackageCatalog(repoRoot);
  return Object.values(index.entries ?? {})
    .filter(entry => entry.type === 'story')
    .filter(entry => !(entry.tags ?? []).includes(SKIP_TAG))
    .filter(entry => !isExcluded(entry.id))
    .map(entry => ({
      id: entry.id,
      title: entry.title ?? '',
      name: entry.name ?? '',
      component: componentOf(entry),
      tags: entry.tags ?? [],
      ...storyPackageNames(entry, storybookDir, repoRoot, catalog),
    }));
}

/**
 * The component a story renders. `componentPath` is authoritative
 * (`../../packages/core/src/Button/index.ts` → `Button`); the title's last
 * segment is the fallback for stories that declare no component.
 * @param {{componentPath?: string, title?: string}} entry
 * @returns {string}
 */
function componentOf(entry) {
  const fromPath = entry.componentPath?.match(/\/src\/([^/]+)\//)?.[1];
  if (fromPath) return fromPath;
  const segments = (entry.title ?? '').split('/');
  return segments[segments.length - 1] ?? '';
}

/**
 * Stable visual baselines are package-scoped. Storybook titles carry the
 * package as their first segment (`Core/Button`, `Lab/Drawer`), so filtering
 * here keeps canary-only stories out of both the plan and the target coverage
 * analysis. `*` is an explicit audit override, never the release default.
 *
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @param {string[]} packages
 */
export function storiesInPackages(stories, packages) {
  if (packages.includes('*')) return stories;
  const wanted = new Set(packages.map(configuredPackageName));
  return stories.filter(story => story.stableVisual && story.packageNames.some(name => wanted.has(name)));
}

/** Config names a package either by its Storybook group (`Core`) or in full. */
function configuredPackageName(name) {
  return name.startsWith('@') ? name : `@astryxdesign/${name.toLowerCase()}`;
}

/**
 * Which stories may own canonical baseline frames.
 *
 * The question is ownership, and a Storybook title is only ever evidence of
 * it. A story that merely IMPORTS Core components must not own a canonical
 * frame; a component Core publishes must not lose its frames because its story
 * happens to be titled under another group. Storybook records the source file
 * of the component a story declares, and `readStoryIndex` resolves that file
 * to its workspace package, so when the index has that fact it decides.
 * `groups` is the fallback for stories that declare no component at all —
 * composed demos and template pages — where the title group is the only
 * ownership signal there is.
 *
 * `*` is an explicit audit override in either list, never the release default.
 *
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @param {{groups: string[], packages: string[]}} owners
 */
export function canonicalBaselineStories(stories, {groups, packages}) {
  if (groups.includes('*')) return stories;
  const everyPackage = packages.includes('*');
  const wantedGroups = new Set(groups);
  const wantedPackages = new Set(packages.map(configuredPackageName));
  return stories.filter(story =>
    story.componentPackage
      ? everyPackage || wantedPackages.has(story.componentPackage)
      : wantedGroups.has(String(story.title).split('/')[0]),
  );
}

/**
 * One story per component: the first match against REPRESENTATIVE_NAMES, else
 * the first story in index order (which is source order, so it is stable).
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @returns {Map<string, (typeof stories)[number]>}
 */
export function representativeStories(stories) {
  /** @type {Map<string, (typeof stories)[number]>} */
  const byComponent = new Map();
  for (const story of stories) {
    if (!story.component) continue;
    const current = byComponent.get(story.component);
    if (!current || rank(story.name) < rank(current.name)) byComponent.set(story.component, story);
  }
  return byComponent;
}

/**
 * The components a scoped pull request's visual gate audits (spec:AST-030
 * FR13): every touched component, which must have a stable representative,
 * plus each reverse-dependent folder that has one. A dependent folder with no
 * stable story is reported, not audited.
 *
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @param {string[]} touched
 * @param {string[]} dependents
 * @returns {{components: string[], dropped: string[]}}
 */
export function visualComponentScope(stories, touched, dependents) {
  const representatives = representativeStories(stories);
  const kept = [];
  const dropped = [];
  for (const dependent of new Set(dependents)) {
    if (touched.includes(dependent)) continue;
    (representatives.has(dependent) ? kept : dropped).push(dependent);
  }
  return {components: [...new Set([...touched, ...kept])], dropped};
}

/**
 * Select the focused PR stories for touched components and fail closed when a
 * requested component has no stable representative in the built Storybook.
 *
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @param {string[]} components
 */
export function componentVisualStories(stories, components) {
  const wanted = [...new Set(components)];
  const representatives = representativeStories(stories);
  const missing = wanted.filter(component => !representatives.has(component));
  if (missing.length > 0) {
    throw new Error(
      `Touched component(s) have no stable visual representative: ${missing.join(', ')}`,
    );
  }
  return stories
    .filter(story => {
      if (!wanted.includes(story.component)) return false;
      return (
        representatives.get(story.component)?.id === story.id ||
        (story.tags ?? []).includes(VISUAL_BASELINE_TAG) ||
        (story.tags ?? []).includes(VISUAL_THEME_MATRIX_TAG)
      );
    })
    .map(story => ({
      story,
      useThemeMatrix:
        representatives.get(story.component)?.id === story.id ||
        (story.tags ?? []).includes(VISUAL_THEME_MATRIX_TAG),
    }));
}

function isComponentScopeReason(reason) {
  return reason === 'component' || /^theme:[^:]+$/.test(reason);
}

/**
 * A component edit may compare an accepted baseline contract, but it may not
 * create one. Keep independently selected theme/probe shots even when the same
 * key is also part of the component scope.
 */
export function existingComponentBaselinePlan(plan, manifest) {
  const accepted = new Set(Object.keys(manifest?.shots ?? {}));
  return plan.filter(shot => {
    const reasons = shot.reasons ?? [];
    const componentScoped = reasons.some(isComponentScopeReason);
    const independentlyScoped = reasons.some(
      reason => !isComponentScopeReason(reason),
    );
    return !componentScoped || independentlyScoped || accepted.has(shot.key);
  });
}

/**
 * Themes already represented by the accepted stable baseline. The default
 * theme is always present for a focused component capture.
 */
export function acceptedVisualThemes(manifest, themes, defaultTheme) {
  const accepted = new Set(
    Object.values(manifest?.shots ?? {})
      .map(shot => shot.theme)
      .filter(theme => themes[theme]?.stableVisual === true),
  );
  if (themes[defaultTheme]?.stableVisual === true) accepted.add(defaultTheme);
  return [...accepted].sort();
}

/** Current stable stories that own at least one accepted baseline contract. */
export function baselineVisualStories(stories, manifest) {
  const indexed = new Map(stories.map(story => [story.id, story]));
  const selected = new Map();
  for (const shot of Object.values(manifest?.shots ?? {})) {
    const story = indexed.get(shot.storyId);
    if (story) selected.set(story.id, story);
  }
  return [...selected.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Resolve the total-plan ceiling: review budget for broad plans, safety budget for focused scopes. */
export function resolvePrVisualTotalShotLimit({
  explicitMaxShots,
  components,
  matrixThemes,
  tiers,
  configuredLimit,
  safetyLimit,
}) {
  if (!Number.isSafeInteger(safetyLimit) || safetyLimit <= 0) {
    throw new Error('Visual plan safety limit must be a positive integer.');
  }
  if (explicitMaxShots != null) {
    const explicit = Number(explicitMaxShots);
    if (!Number.isSafeInteger(explicit) || explicit < 0) {
      throw new Error('--max-shots must be a non-negative integer.');
    }
    return Math.min(explicit, safetyLimit);
  }
  const focusedComponent =
    tiers.includes('component') && components.length > 0;
  const focusedTheme =
    tiers.includes('theme-matrix') && matrixThemes.length > 0;
  if (focusedComponent || focusedTheme) return safetyLimit;
  return Math.min(configuredLimit, safetyLimit);
}

/** Component review budgets are shared by the ordinary and trusted planners. */
export function exceedsPrVisualShotLimit(count, limit) {
  return count > limit;
}

/**
 * Why every lane refuses an empty plan.
 *
 * A run that captures nothing compares nothing, so a clean verdict from one
 * reports the absence of evidence as evidence. Every lane reaches that state
 * the same way — a scope whose keys are not in the accepted baseline — so they
 * refuse it with one sentence rather than three behaviors, and they name the
 * one path that can seed the missing frames.
 *
 * @param {string} scope - what the lane planned, named for the message
 * @returns {string}
 */
export function emptyVisualPlanMessage(scope) {
  return `${scope} planned no shots; an empty plan compares nothing and cannot report clean. Seed coverage through the manual baseline workflow.`;
}

/**
 * @param {string} name
 * @returns {number}
 */
function rank(name) {
  const index = REPRESENTATIVE_NAMES.indexOf(name);
  return index === -1 ? REPRESENTATIVE_NAMES.length : index;
}

/**
 * Build the plan.
 *
 * @param {object} options
 * @param {ReturnType<typeof readStoryIndex>} options.stories
 * @param {import('../../../../packages/cli/foundation/discovery/theming-targets.mjs').ThemingTarget[]} options.targets
 * @param {Record<string, Record<string, string[]>>} options.themeOverrides - theme → component key → override selectors
 * @param {Record<string, Record<string, string[]>>} [options.observations] - story id → targets it rendered, from a scout pass
 * @param {string} options.defaultTheme
 * @param {string[]} options.tiers - any of 'theme-matrix', 'surface', 'full', 'component', 'probe'
 * @param {string[]} [options.components] - for the 'component' tier: the components to cover
 * @param {string[]} [options.componentThemes] - accepted themes for representative and matrix-tagged stories
 * @param {string[]} [options.matrixThemes] - restrict theme-matrix to changed shipped themes
 * @param {ReturnType<typeof readStoryIndex>} [options.themeStories] - accepted stories to render for changed themes
 * @param {string} [options.probeTheme] - name of the generated coverage theme
 * @returns {Shot[]}
 */
export function buildPlan({
  stories,
  targets,
  themeOverrides,
  observations,
  defaultTheme,
  tiers,
  components = [],
  componentThemes = [],
  matrixThemes = [],
  themeStories = [],
  probeTheme = 'probe',
}) {
  /** @type {Map<string, Shot>} */
  const shots = new Map();
  const representatives = representativeStories(stories);

  /** @param {Omit<Shot, 'key' | 'reasons'>} shot @param {string} reason */
  const add = (shot, reason) => {
    const key = shotKey(shot);
    const existing = shots.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    shots.set(key, {...shot, key, reasons: [reason]});
  };

  if (tiers.includes('surface') || tiers.includes('full')) {
    const subject = tiers.includes('full')
      ? stories
      : stories.filter(
          story =>
            representatives.get(story.component)?.id === story.id ||
            (story.tags ?? []).includes(VISUAL_BASELINE_TAG) ||
            (story.tags ?? []).includes(VISUAL_THEME_MATRIX_TAG),
        );
    for (const story of subject) {
      for (const mode of MODES) {
        add({...toShotBase(story), theme: defaultTheme, mode}, 'surface');
      }
    }
  }

  if (tiers.includes('component')) {
    // The PR tier: one representative story in every accepted theme.
    // visual-baseline adds a default-theme story; visual-theme-matrix opts a
    // visually dense story into the same all-theme matrix. Behavioral and
    // audit-only fixtures remain available to their dedicated checks without
    // multiplying the baseline.
    for (const {story, useThemeMatrix} of componentVisualStories(
      stories,
      components,
    )) {
      for (const mode of MODES) {
        add({...toShotBase(story), theme: defaultTheme, mode}, 'component');
        if (!useThemeMatrix) continue;
        for (const theme of componentThemes) {
          if (theme === defaultTheme) continue;
          add({...toShotBase(story), theme, mode}, `theme:${theme}`);
        }
      }
    }
  }

  if (tiers.includes('theme-matrix')) {
    if (matrixThemes.length > 0) {
      if (themeStories.length === 0) {
        throw new Error(
          `Changed theme(s) have no accepted visual stories: ${matrixThemes.join(', ')}`,
        );
      }
      for (const theme of matrixThemes) {
        for (const story of themeStories) {
          for (const mode of MODES) {
            add(
              {...toShotBase(story), theme, mode},
              `changed-theme:${theme}`,
            );
          }
        }
      }
    } else {
      for (const shot of themeMatrix({
        stories,
        targets,
        themeOverrides,
        observations,
      })) {
        add(shot.shot, shot.reason);
      }
    }
  }

  if (tiers.includes('probe')) {
    // The coverage tier. The probe theme styles every declared target, so
    // "which story shows this target" is the only question left — and the
    // scout already answered it. One shot per target, on the story that
    // renders it, which is what makes a newly added target verified from the
    // day its doc lands instead of whenever a designer happens to style it.
    for (const {shot, reason} of probeShots({
      stories,
      targets,
      observations,
      probeTheme,
    })) {
      add(shot, reason);
    }
    for (const story of stories.filter(candidate =>
      (candidate.tags ?? []).includes(VISUAL_THEME_MATRIX_TAG),
    )) {
      for (const mode of MODES) {
        add({...toShotBase(story), theme: probeTheme, mode}, 'probe:opt-in');
      }
    }
  }

  return [...shots.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * One shot per theming target, in the probe theme, on a story that renders it.
 *
 * Targets are grouped so a story covering twenty of them costs one shot, not
 * twenty: the probe theme colours every target differently, so a single frame
 * verifies all of them at once. Without observations there is nothing to aim
 * at — the probe tier needs the scout.
 *
 * @param {object} options
 * @param {ReturnType<typeof readStoryIndex>} options.stories
 * @param {Array<{key: string, component: string}>} options.targets
 * @param {Record<string, Record<string, string[]>>} [options.observations]
 * @param {string} options.probeTheme
 */
function probeShots({stories, targets, observations, probeTheme}) {
  if (!observations) return [];

  const wanted = new Set(targets.map(target => target.key));
  const byStory = new Map();
  for (const story of stories) {
    const rendered = Object.keys(observations[story.id] ?? {}).filter(key => wanted.has(key));
    if (rendered.length > 0) byStory.set(story, new Set(rendered));
  }

  // Greedy set cover: fewest stories that between them render every target.
  const planned = [];
  const uncovered = new Set(wanted);
  while (uncovered.size > 0) {
    let best = null;
    let bestCount = 0;
    for (const [story, rendered] of byStory) {
      const count = [...rendered].filter(key => uncovered.has(key)).length;
      if (count > bestCount) {
        best = story;
        bestCount = count;
      }
    }
    if (!best) break;
    for (const key of byStory.get(best)) uncovered.delete(key);
    for (const mode of MODES) {
      planned.push({shot: {...toShotBase(best), theme: probeTheme, mode}, reason: 'probe'});
    }
    byStory.delete(best);
  }
  return planned;
}

/**
 * The targeted net: for every selector a theme overrides, one story that
 * actually renders it.
 *
 * Selection is a small greedy set cover per (theme, target key). A component's
 * "Variants" story usually renders every variant at once, so covering the six
 * `badge` overrides costs one shot rather than six — and a selector no story
 * renders is simply left uncovered, where the report can name it, instead of
 * being papered over with the default story.
 *
 * With no observations (no scout pass), it falls back to the component's
 * representative story: coverage is thinner, but the matrix still exists.
 *
 * @param {object} options
 * @param {ReturnType<typeof readStoryIndex>} options.stories
 * @param {Array<{key: string, component: string}>} options.targets
 * @param {Record<string, Record<string, string[]>>} options.themeOverrides
 * @param {Record<string, Record<string, string[]>>} [options.observations]
 * @returns {Array<{shot: Omit<Shot, 'key'|'reasons'>, reason: string}>}
 */
function themeMatrix({stories, targets, themeOverrides, observations}) {
  const componentsByKey = new Map();
  for (const target of targets) {
    if (!componentsByKey.has(target.key)) componentsByKey.set(target.key, new Set());
    componentsByKey.get(target.key).add(target.component);
  }
  const representatives = representativeStories(stories);
  const storiesByComponent = new Map();
  for (const story of stories) {
    if (!storiesByComponent.has(story.component)) storiesByComponent.set(story.component, []);
    storiesByComponent.get(story.component).push(story);
  }

  const planned = [];
  for (const [theme, keys] of Object.entries(themeOverrides)) {
    for (const [key, selectors] of Object.entries(keys)) {
      for (const component of componentsByKey.get(key) ?? []) {
        for (const story of chooseStories({
          candidates: storiesByComponent.get(component) ?? [],
          fallback: representatives.get(component),
          key,
          selectors,
          observations,
        })) {
          for (const mode of MODES) {
            planned.push({
              shot: {...toShotBase(story), theme, mode},
              reason: `theme:${theme}:${key}`,
            });
          }
        }
      }
    }
  }
  return planned;
}

/**
 * @param {object} options
 * @param {ReturnType<typeof readStoryIndex>} options.candidates
 * @param {ReturnType<typeof readStoryIndex>[number] | undefined} options.fallback
 * @param {string} options.key
 * @param {string[]} options.selectors
 * @param {Record<string, Record<string, string[]>>} [options.observations]
 */
function chooseStories({candidates, fallback, key, selectors, observations}) {
  if (!observations) return fallback ? [fallback] : [];

  const renders = story => Boolean(observations[story.id]?.[key]);
  const rendering = candidates.filter(renders);
  if (rendering.length === 0) return [];

  // `base` and pseudo-class overrides need no particular state — any story
  // rendering the target proves they had something to bind to.
  const wanted = new Set(
    selectors.filter(selector => selector !== 'base' && !selector.startsWith(':')),
  );
  const chosen = [];
  const covers = story => new Set(observations[story.id]?.[key] ?? []);

  while (wanted.size > 0) {
    let best = null;
    let bestCount = 0;
    for (const story of rendering) {
      const count = [...covers(story)].filter(selector => wanted.has(selector)).length;
      if (count > bestCount) {
        best = story;
        bestCount = count;
      }
    }
    if (!best) break;
    chosen.push(best);
    for (const selector of covers(best)) wanted.delete(selector);
  }

  // Always keep one plain shot of the target, for `base` and for the case
  // where every override is a pseudo-class.
  if (chosen.length === 0) chosen.push(rendering.find(renders) ?? rendering[0]);
  return [...new Set(chosen)];
}

/** @param {ReturnType<typeof readStoryIndex>[number]} story */
function toShotBase(story) {
  return {
    storyId: story.id,
    title: story.title,
    name: story.name,
    component: story.component,
    packageName: story.packageName,
    packageNames: story.packageNames,
    stableVisual: story.stableVisual,
  };
}

/**
 * Shot identity. Doubles as the PNG file name, so it stays filesystem-safe and
 * stable across runs — a baseline is only comparable if its key is.
 * @param {{storyId: string, theme: string, mode: string}} shot
 * @returns {string}
 */
export function shotKey({storyId, theme, mode}) {
  return `${storyId}__${theme}-${mode}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Theming targets declared by components but never reachable through the plan
 * — the coverage gap in what the camera can see.
 * @param {import('../../../../packages/cli/foundation/discovery/theming-targets.mjs').ThemingTarget[]} targets
 * @param {Shot[]} plan
 * @returns {Array<{key: string, component: string}>}
 */
export function uncoveredTargets(targets, plan) {
  const photographed = new Set(plan.map(shot => shot.component));
  return targets
    .filter(target => !photographed.has(target.component))
    .map(target => ({key: target.key, component: target.component}));
}
