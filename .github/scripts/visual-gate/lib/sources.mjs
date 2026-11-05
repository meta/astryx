// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where the gate gets its facts: the theming targets components declare,
 *       and the component overrides themes actually author.
 *
 * @input  the repo
 * @output the two enumerations the plan and the targeting analysis are built
 *         from
 *
 * Both come from the same places the product does — `collectThemingTargets`
 * is the CLI's own enumeration (the one `astryx theme targets` prints and
 * `astryx theme build` validates against), and theme overrides are read out of
 * the built theme packages rather than parsed out of their source. Nothing
 * here is a second registry: if the gate and the compiler ever disagree about
 * what is themeable, that is a bug in one shared function, not a drift between
 * two lists.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

/** The compiled entry a built theme's own `@astryxdesign/core/theme` import resolves to. */
const CORE_THEME_ENTRY = 'packages/core/dist/theme/index.js';

const BUILD_TIMEOUT_MS = 300_000;

/**
 * @param {string} repoRoot
 * @param {string} pkg
 */
function pnpmBuild(repoRoot, pkg) {
  execFileSync('pnpm', ['-F', pkg, 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
}

/**
 * @param {string} file
 * @param {string} [query] - cache-buster, so a post-build retry is a fresh import
 * @returns {Promise<{ok: true, module: Record<string, any>} | {ok: false, error: Error}>}
 */
async function importBuilt(file, query = '') {
  try {
    return {ok: true, module: await import(pathToFileURL(file).href + query)};
  } catch (error) {
    return {ok: false, error: /** @type {Error} */ (error)};
  }
}

/**
 * @param {string} dir
 * @returns {string}
 */
function packageName(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
}

/**
 * @param {string} repoRoot
 * @returns {Promise<import('../../../../packages/cli/foundation/discovery/theming-targets.mjs').ThemingTarget[]>}
 */
export async function loadThemingTargets(repoRoot) {
  const module = await import(
    pathToFileURL(
      path.join(repoRoot, 'packages/cli/foundation/discovery/theming-targets.mjs'),
    ).href
  );
  return module.collectThemingTargets(path.join(repoRoot, 'packages/core/src'));
}

/**
 * Every shipped theme's component overrides, as theme name → target key →
 * the selectors it styles (`base`, `variant:primary`, `selected`, …).
 *
 * Reads the built packages: a theme's `components` map is the product of
 * `defineTheme`, not a literal in its source, so the built artifact is the
 * only honest answer.
 *
 * The probe theme is deliberately EXCLUDED. It styles every target by
 * construction, so feeding it to the theme matrix would ask for a shot per
 * (target x story that renders it) — 614 shots here — to answer a question the
 * probe tier answers in 128 with a set cover. It is a coverage instrument, not
 * a theme someone ships.
 *
 * Builds what it cannot read. On CI these dists arrive as an artifact from the
 * job that already built them, and three changes in one day to how that
 * artifact is named and filled each reddened the gate on every open component
 * PR with a missing-file error about something no PR had touched. The gate owns its own
 * prerequisites now, so how they get onto the runner is an optimisation rather
 * than a correctness dependency.
 *
 * @param {string} repoRoot
 * @param {string} [probeTheme] - name of the coverage fixture to leave out
 * @param {(repoRoot: string, pkg: string) => void} [build] - seam for tests
 * @returns {Promise<Record<string, Record<string, string[]>>>}
 */
export async function loadThemeOverrides(repoRoot, probeTheme = 'probe', build = pnpmBuild) {
  const themesDir = path.join(repoRoot, 'packages/themes');
  /** @type {Record<string, Record<string, string[]>>} */
  const overrides = {};
  /** @type {string[]} */
  const rebuilt = [];

  /**
   * @param {string} pkg
   * @param {string} why
   */
  const buildOnce = (pkg, why) => {
    if (rebuilt.includes(pkg)) return;
    rebuilt.push(pkg);
    console.log(`visual gate: ${why}; building ${pkg} here rather than failing.`);
    build(repoRoot, pkg);
  };

  for (const entry of fs.readdirSync(themesDir, {withFileTypes: true}).sort()) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(themesDir, entry.name);
    const built = path.join(dir, 'dist/source.mjs');

    let loaded = await importBuilt(built);
    if (!loaded.ok) {
      if (!fs.existsSync(path.join(repoRoot, CORE_THEME_ENTRY))) {
        buildOnce(
          '@astryxdesign/core',
          `${CORE_THEME_ENTRY} is missing and every built theme imports it`,
        );
      }
      if (!fs.existsSync(built)) {
        buildOnce(packageName(dir), `${path.relative(repoRoot, built)} is missing`);
      }
      loaded = await importBuilt(built, '?rebuilt');
      if (!loaded.ok) {
        throw unreadableTheme(repoRoot, entry.name, built, loaded.error, rebuilt);
      }
    }

    const theme = Object.values(loaded.module).find(value => value?.name && value?.components);
    if (!theme || theme.name === probeTheme) continue;
    overrides[theme.name] = Object.fromEntries(
      Object.entries(theme.components).map(([key, styles]) => [key, Object.keys(styles ?? {})]),
    );
  }

  return overrides;
}

/**
 * @param {string} repoRoot
 * @param {string} name
 * @param {string} built
 * @param {Error} error
 * @param {string[]} rebuilt
 * @returns {Error}
 */
function unreadableTheme(repoRoot, name, built, error, rebuilt) {
  const rel = path.relative(repoRoot, built);
  return new Error(
    [
      `The visual gate could not load theme ${name} from ${rel}.`,
      `  ${error.message}`,
      rebuilt.length
        ? `  The gate rebuilt ${rebuilt.join(' and ')} here and the import still fails, so this is a broken build rather than a missing one.`
        : `  Both ${rel} and ${CORE_THEME_ENTRY} are present, so this is not a missing build.`,
      `The gate reads each theme's BUILT source because a theme's component map is what defineTheme returns, not a literal in its source.`,
    ].join('\n'),
    {cause: error},
  );
}

/**
 * @param {string} repoRoot
 * @returns {{excludeStories: Record<string, string>, viewport: {width: number, height: number}, settleMs: number, scoutConcurrency: number, captureConcurrency: number, compareConcurrency: number, threshold: number, maxDiffPixels: number, defaultTheme: string, probeTheme: string, baselineThemes: string[], stableStoryPackages: string[], stableStoryGroups: string[], prVisualShotLimit: number, visualPlanSafetyLimit: number, tiers: string[]}}
 */
export function loadConfig(repoRoot) {
  const defaults = {
    excludeStories: {},
    viewport: {width: 1024, height: 768},
    settleMs: 50,
    scoutConcurrency: 2,
    captureConcurrency: 2,
    compareConcurrency: 2,
    threshold: 0.1,
    maxDiffPixels: 0,
    defaultTheme: 'neutral',
    probeTheme: 'probe',
    baselineThemes: ['neutral', 'probe'],
    stableStoryPackages: ['Core'],
    stableStoryGroups: ['Core'],
    prVisualShotLimit: 240,
    visualPlanSafetyLimit: 5000,
    tiers: ['surface', 'theme-matrix', 'probe'],
  };
  const configPath = path.join(repoRoot, '.github/scripts/visual-gate/visual-gate.config.json');
  if (!fs.existsSync(configPath)) return defaults;
  return {...defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8'))};
}
