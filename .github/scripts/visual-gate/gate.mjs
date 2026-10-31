#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The visual gate CLI.
 *
 * @input  a built Storybook, a baseline directory
 * @output a verdict (JSON), a report (HTML), and — only ever through `accept`
 *         — a new baseline
 *
 * Commands:
 *   plan     what would be captured, and why
 *   capture  take the shots
 *   check    capture, compare against the baseline, write verdict + report
 *   scout    observe one shard of the release plan's theming-target scout
 *   accept   record that the after is the correct picture, for named shots
 *
 * Exit codes are the contract for automation: 0 clean, 1 crashed, 2 changed.
 * `changed` is separated from `crashed` precisely because a change is a
 * question ("is this what you meant?") and a crash is not.
 *
 * Usage:
 *   node .github/scripts/visual-gate/gate.mjs check \
 *     --storybook-dir apps/storybook/dist --baseline .visual-baseline --out .visual-run
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {capture, scout} from './lib/capture.mjs';
import {
  mergeScoutShards,
  parseShard,
  readShardFiles,
  shardFile,
  shardStoryIds,
} from './lib/scout-shards.mjs';
import {
  analyzeTargeting,
  buildVerdict,
  compareCaptures,
  compareReleaseCaptures,
  validateReleasePlan,
} from './lib/compare.mjs';
import {
  acceptedVisualThemes,
  accountBaseline,
  baselineVisualStories,
  buildPlan,
  canonicalBaselineStories,
  createReleasePlan,
  emptyVisualPlanMessage,
  exceedsPrVisualShotLimit,
  existingComponentBaselinePlan,
  readStoryIndex,
  readThemeCatalog,
  resolvePrVisualTotalShotLimit,
  storiesInPackages,
  summarizeBaselineAccounting,
  visualComponentScope,
  withThemeMetadata,
} from './lib/plan.mjs';
import {renderReport} from './lib/report.mjs';
import {accept, incomparable, readBaseline} from './lib/baseline.mjs';
import {loadConfig, loadThemeOverrides, loadThemingTargets} from './lib/sources.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const EXIT = {clean: 0, crashed: 1, changed: 2};
const RELEASE_TIERS = ['surface', 'probe'];

const argv = process.argv.slice(2);
const command = argv[0];
const flag = name => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1];
};
const has = name => argv.includes(`--${name}`);
const captureIdentity = () => ({
  sha: process.env.ASTRYX_VISUAL_SHA ?? process.env.GITHUB_SHA ?? null,
  runId: process.env.ASTRYX_VISUAL_RUN_ID ?? process.env.GITHUB_RUN_ID ?? null,
  runAttempt:
    process.env.ASTRYX_VISUAL_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? null,
});

const config = loadConfig(REPO_ROOT);
const releaseMode = command === 'release';
// `scout` observes a shard of exactly the release plan's scout, so it plans
// with the same inputs and accepts no flag that could change that list.
const releasePlanInputs = releaseMode || command === 'scout';
const themeCatalog = readThemeCatalog(REPO_ROOT, config.baselineThemes);
const storybookDir = path.resolve(flag('storybook-dir') ?? 'apps/storybook/dist');
const baselineDir = path.resolve(flag('baseline') ?? '.visual-baseline');
let outDir = path.resolve(flag('out') ?? '.visual-run');
const tiers = releasePlanInputs
  ? RELEASE_TIERS
  : (flag('tiers') ?? config.tiers.join(',')).split(',').filter(Boolean);
const sample = flag('sample') ? Number(flag('sample')) : null;
/** Restrict the plan to story ids containing any of these — for debugging a shot, never for a gate run. */
const only = (flag('only') ?? '').split(',').filter(Boolean);
/** For the `component` tier: the components a PR touched. */
let components = (flag('components') ?? '').split(',').filter(Boolean);
/**
 * For the `component` tier: the folders the touched modules reach (reverse
 * dependents, spec:AST-030 FR13), audited where they have a stable story.
 */
const dependents = (flag('dependents') ?? '').split(',').filter(Boolean);
/**
 * Exit code that asks the caller for the whole plan instead: nothing the scope
 * reaches has a stable story. An over-budget focused plan writes the
 * `skipped` verdict, which the workflow also answers with the whole plan.
 */
const BROADEN_EXIT_CODE = 3;
/** For the `theme-matrix` tier: only these shipped themes changed. */
const matrixThemes = (flag('themes') ?? '').split(',').filter(Boolean);
const explicitMaxShots = has('max-shots') ? flag('max-shots') : null;
if (has('max-shots') && explicitMaxShots === undefined) {
  throw new Error('--max-shots requires a value.');
}
let maxShots = resolvePrVisualTotalShotLimit({
  explicitMaxShots,
  components,
  matrixThemes,
  tiers,
  configuredLimit: releaseMode
    ? config.visualPlanSafetyLimit
    : config.prVisualShotLimit,
  safetyLimit: config.visualPlanSafetyLimit,
});
const storyPackages = (flag('story-packages') ?? config.stableStoryPackages.join(','))
  .split(',')
  .filter(Boolean);
/** A trusted, exact shot list used only to recapture an accepted merged result. */
const planFile = flag('plan-file');
if (
  releasePlanInputs &&
  (flag('tiers') ||
    flag('story-packages') ||
    flag('observations') ||
    flag('max-shots') ||
    has('no-scout') ||
    planFile ||
    components.length ||
    dependents.length ||
    matrixThemes.length ||
    only.length ||
    sample)
) {
  throw new Error('The stable release plan is internal and cannot be scoped by CLI flags.');
}

function readExactPlan(file) {
  const shots = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!Array.isArray(shots) || shots.length > config.visualPlanSafetyLimit) {
    throw new Error(
      `Exact visual plan must contain at most ${config.visualPlanSafetyLimit} trusted shots.`,
    );
  }
  const keys = new Set();
  for (const shot of shots) {
    if (
      !/^[A-Za-z0-9._-]{1,240}$/.test(shot?.key ?? '') ||
      typeof shot.storyId !== 'string' ||
      !shot.storyId ||
      typeof shot.theme !== 'string' ||
      !shot.theme ||
      !['light', 'dark'].includes(shot.mode) ||
      !Array.isArray(shot.reasons)
    ) {
      throw new Error(`Exact visual plan contains an invalid shot: ${JSON.stringify(shot)}`);
    }
    if (keys.has(shot.key)) throw new Error(`Exact visual plan repeats ${shot.key}.`);
    keys.add(shot.key);
  }
  return shots;
}

/**
 * Which stories the scout needs to look at: every story of a component some
 * theme overrides. Scouting the whole index would cost more than it returns —
 * the surface tier photographs one story per component regardless.
 *
 * @param {ReturnType<typeof readStoryIndex>} stories
 * @param {Array<{key: string, component: string}>} targets
 * @param {Record<string, Record<string, string[]>>} themeOverrides
 * @returns {string[]}
 */
function storiesToScout(stories, targets, themeOverrides) {
  const overridden = new Set(Object.values(themeOverrides).flatMap(keys => Object.keys(keys)));
  const components = new Set(
    targets.filter(target => overridden.has(target.key)).map(target => target.component),
  );
  return stories.filter(story => components.has(story.component)).map(story => story.id);
}

/** @returns {Promise<{shots: import('./lib/plan.mjs').Shot[], stories: ReturnType<typeof readStoryIndex>}>} */
/** The Storybook build a run reads, as stamped by the build job (or null). */
function storybookBuildSha() {
  const stamp = path.join(storybookDir, 'astryx-build-sha.txt');
  return fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() || null : null;
}

/**
 * @param {{scoutOnly?: boolean}} [options] `scoutOnly` returns the scout's
 *   story list instead of a plan; `null` when this plan scouts nothing.
 */
async function plan({scoutOnly = false} = {}) {
  if (planFile) {
    return {
      shots: withThemeMetadata(readExactPlan(planFile), themeCatalog),
      stories: [],
    };
  }
  const [targets, allThemeOverrides] = await Promise.all([
    loadThemingTargets(REPO_ROOT),
    loadThemeOverrides(REPO_ROOT, config.probeTheme),
  ]);
  const themeOverrides = releasePlanInputs
    ? Object.fromEntries(
        Object.entries(allThemeOverrides).filter(
          ([theme]) => themeCatalog[theme]?.stableVisual === true,
        ),
      )
    : allThemeOverrides;
  const indexedStories = readStoryIndex(
    storybookDir,
    Object.keys(config.excludeStories),
    REPO_ROOT,
  );
  const packageStories = storiesInPackages(indexedStories, storyPackages);
  const stories = canonicalBaselineStories(packageStories, {
    groups: config.stableStoryGroups,
    packages: storyPackages,
  });
  const {manifest: baselineManifest} = readBaseline(baselineDir);
  const componentThemes = acceptedVisualThemes(
    baselineManifest,
    themeCatalog,
    config.defaultTheme,
  );
  const themeStories = baselineVisualStories(stories, baselineManifest);
  if (dependents.length > 0) {
    const scope = visualComponentScope(stories, components, dependents);
    if (scope.dropped.length > 0) {
      console.log(`Reverse dependents with no stable story: ${scope.dropped.join(', ')}`);
    }
    components = scope.components;
    if (components.length === 0) {
      // Nothing the scope reaches has a stable story: the caller runs the
      // whole plan rather than an empty one.
      console.log('No touched component or reverse dependent has a stable story; asking for the whole plan.');
      process.exit(BROADEN_EXIT_CODE);
    }
    maxShots = resolvePrVisualTotalShotLimit({
      explicitMaxShots,
      components,
      matrixThemes,
      tiers,
      configuredLimit: config.prVisualShotLimit,
      safetyLimit: config.visualPlanSafetyLimit,
    });
  }

  let observations;
  const scouts =
    !has('no-scout') &&
    (tiers.includes('probe') ||
      (tiers.includes('theme-matrix') && matrixThemes.length === 0));
  const storyIds = scouts
    ? tiers.includes('probe')
      ? stories.map(story => story.id)
      : storiesToScout(stories, targets, themeOverrides)
    : null;
  if (scoutOnly) return {scoutStoryIds: storyIds};
  if (scouts) {
    const cachePath = flag('observations');
    const shardDir = flag('observation-shards');
    if (shardDir) {
      // Shards scouted this same list on this same build in parallel jobs;
      // the merge refuses anything less than the complete set.
      observations = mergeScoutShards(readShardFiles(shardDir), {
        storyIds,
        storybookSha: storybookBuildSha(),
      });
      process.stderr.write(`Read ${storyIds.length} scouted stories from ${shardDir}\n`);
    } else if (cachePath && fs.existsSync(cachePath)) {
      observations = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } else {
      process.stderr.write(`Scouting ${storyIds.length} stories for theming targets…\n`);
      observations = await scout({
        storyIds,
        storybookDir,
        theme: config.defaultTheme,
        viewport: config.viewport,
        concurrency: config.scoutConcurrency,
      });
      if (cachePath) fs.writeFileSync(cachePath, `${JSON.stringify(observations)}\n`);
    }
  }

  const componentShotCount = tiers.includes('component')
    ? existingComponentBaselinePlan(
        buildPlan({
          stories,
          targets,
          themeOverrides,
          observations,
          defaultTheme: config.defaultTheme,
          tiers: ['component'],
          components,
          componentThemes,
          probeTheme: config.probeTheme,
        }),
        baselineManifest,
      ).length
    : 0;
  let shots = buildPlan({
    stories,
    targets,
    themeOverrides,
    observations,
    defaultTheme: config.defaultTheme,
    tiers,
    components,
    componentThemes,
    matrixThemes,
    themeStories,
    probeTheme: config.probeTheme,
  });
  if (tiers.includes('component')) {
    shots = existingComponentBaselinePlan(shots, baselineManifest);
  }
  let baselineAccount = null;
  if (releaseMode) {
    baselineAccount = accountBaseline(
      baselineManifest,
      indexedStories,
      themeCatalog,
      REPO_ROOT,
    );
  }
  shots = withThemeMetadata(shots, themeCatalog);
  // A sample is for trying the rig out, never for a gate run: it is taken
  // evenly across the plan so it spans components rather than the first few.
  const filtered = only.length
    ? shots.filter(shot => only.some(fragment => shot.storyId.includes(fragment)))
    : shots;
  if (!sample || sample >= filtered.length) {
    return {
      shots: filtered,
      stories: indexedStories,
      baselineAccount,
      componentShotCount,
    };
  }
  const step = filtered.length / sample;
  return {
    shots: Array.from(
      {length: sample},
      (_, index) => filtered[Math.floor(index * step)],
    ),
    stories: indexedStories,
    baselineAccount,
    componentShotCount,
  };
}

/** How this run describes what it planned, for a refusal a human has to act on. */
function plannedScope() {
  if (planFile) return 'The exact trusted plan';
  if (components.length) return `Component scope ${components.join(', ')}`;
  return `Tier scope ${tiers.join(', ')}`;
}

async function runCapture(shots, releasePlan = null) {
  // An empty plan is not a clean run. Every lane that captures pixels refuses
  // one here, on the way in, so a scope whose keys are missing from the
  // accepted baseline cannot report the absence of evidence as evidence.
  if (shots.length === 0) {
    throw new Error(emptyVisualPlanMessage(plannedScope()));
  }
  if (shots.length > config.visualPlanSafetyLimit) {
    throw new Error(
      `Visual plan has ${shots.length} shots; safety limit is ${config.visualPlanSafetyLimit}.`,
    );
  }
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});
  let last = 0;
  const {manifest, failures} = await capture({
    plan: shots,
    storybookDir,
    outDir,
    viewport: config.viewport,
    settleMs: config.settleMs,
    fastGlobals: !has('no-fast-globals'),
    bootstrapGlobals: {astryxTheme: config.defaultTheme, colorMode: 'light'},
    concurrency: config.captureConcurrency,
    onProgress: ({done, total}) => {
      if (done === total || done - last >= 50) {
        last = done;
        process.stderr.write(`  captured ${done}/${total}\n`);
      }
    },
  });
  const planByKey = new Map(shots.map(shot => [shot.key, shot]));
  for (const [key, captured] of Object.entries(manifest.shots)) {
    const planned = planByKey.get(key);
    Object.assign(captured, {
      packageName: planned.packageName,
      packageNames: planned.packageNames,
      stableVisual: planned.stableVisual,
      themePackageName: planned.themePackageName,
      stableThemeVisual: planned.stableThemeVisual,
      membershipSource: 'accepted-capture',
    });
  }
  manifest.context = {
    // `sha` is the tested synthetic merge tree on pull_request runs. Keep the
    // contributor's head and the base separately: acceptance binds to the head
    // humans reviewed, while post-merge verification bridges to the final
    // squash commit by comparing rendered hashes.
    ...captureIdentity(),
    headSha: process.env.ASTRYX_PR_HEAD_SHA ?? null,
    baseSha: process.env.ASTRYX_PR_BASE_SHA ?? null,
    ref: process.env.GITHUB_REF ?? null,
    ...(releasePlan ? {releasePlan} : {}),
  };
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return {manifest, failures};
}

/** Copy the three image sets the report links to, next to the report itself. */
function stageReportImages({reportDir, keys, currentDir, baselinePath}) {
  for (const [name, source] of [
    ['before', baselinePath],
    ['after', path.join(currentDir, 'shots')],
  ]) {
    fs.mkdirSync(path.join(reportDir, name), {recursive: true});
    for (const key of keys) {
      const from = path.join(source, `${key}.png`);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(reportDir, name, `${key}.png`));
    }
  }
}

async function check() {
  const {shots, stories, baselineAccount, componentShotCount = 0} =
    await plan();
  const releasePlan = releaseMode ? createReleasePlan(shots) : null;
  const baselineAccounting = releaseMode
    ? summarizeBaselineAccounting(baselineAccount, shots)
    : null;
  const ineligible = releaseMode
    ? shots.filter(shot => !shot.stableVisual || !shot.stableThemeVisual)
    : [];
  if (ineligible.length) {
    throw new Error(
      `Canonical stable release plan contains ${ineligible.length} ineligible shot(s): ${ineligible.slice(0, 5).map(shot => shot.key).join(', ')}`,
    );
  }

  // Over budget: say so in the verdict rather than capturing. The focused
  // ceiling applies only to component-selected shots; theme-only matrices are
  // release evidence, not component review expansion. Broad unscoped plans use
  // the same configured ceiling through maxShots.
  const componentOverBudget = exceedsPrVisualShotLimit(
    componentShotCount,
    config.prVisualShotLimit,
  );
  const totalOverBudget = shots.length > maxShots;
  if (componentOverBudget || totalOverBudget) {
    const measuredShots = componentOverBudget
      ? componentShotCount
      : shots.length;
    const budget = componentOverBudget
      ? config.prVisualShotLimit
      : maxShots;
    const scope = componentOverBudget
      ? `component-selected shots (${components.length} components touched)`
      : 'shots';
    const verdict = {
      version: 1,
      status: 'skipped',
      generatedAt: new Date().toISOString(),
      reason: `${measuredShots} ${scope} exceeds the ${budget}-shot budget — no visual comparison was performed. Run the full canonical plan through CI before relying on this scope.`,
      context: {
        ...captureIdentity(),
        headSha: process.env.ASTRYX_PR_HEAD_SHA ?? null,
        baseSha: process.env.ASTRYX_PR_BASE_SHA ?? null,
        ref: process.env.GITHUB_REF ?? null,
        tiers,
        components,
        ...(releasePlan ? {releasePlan} : {}),
      },
      counts: {total: shots.length, unchanged: 0, changed: 0, added: 0, removed: 0, failed: 0},
      components,
      changes: [],
      added: [],
      removed: [],
      failures: [],
    };
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(path.join(outDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
    const summary = `## Visual gate: skipped\n\n${verdict.reason}\n`;
    process.stdout.write(summary);
    if (flag('summary-output')) fs.writeFileSync(flag('summary-output'), summary);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `status=skipped\nchanged=0\nadded=0\nfailed=0\ntotal=${shots.length}\n`,
      );
    }
    return EXIT.clean;
  }

  process.stderr.write(`Visual gate: ${shots.length} shots (${tiers.join(', ')})\n`);
  const {manifest, failures: captureFailures} = await runCapture(shots, releasePlan);
  let failures = [
    ...captureFailures,
    ...(baselineAccounting?.unclassifiedKeys ?? []).map(key => ({
      key,
      error: 'Baseline membership is unclassified.',
    })),
  ];

  const {manifest: rawBaseline, exists} = readBaseline(baselineDir);
  const baselineManifest = rawBaseline;
  const blocker = exists ? incomparable(baselineManifest, manifest) : null;
  if (blocker) {
    failures.push({key: 'baseline', error: blocker});
  }

  const reportDir = path.join(outDir, 'report');
  const compare = releaseMode ? compareReleaseCaptures : compareCaptures;
  let comparison;
  try {
    comparison = await compare({
      baselineDir: path.join(baselineDir, 'shots'),
      currentDir: path.join(outDir, 'shots'),
      baselineManifest,
      currentManifest: manifest,
      diffDir: path.join(reportDir, 'diff'),
      threshold: config.threshold,
      maxDiffPixels: config.maxDiffPixels,
      concurrency: config.compareConcurrency,
      failures,
    });
  } catch (error) {
    if (!releaseMode) throw error;
    failures = [
      ...failures,
      {key: 'release-plan', error: String(error?.message ?? error)},
    ];
    comparison = await compareCaptures({
      baselineDir: path.join(baselineDir, 'shots'),
      currentDir: path.join(outDir, 'shots'),
      baselineManifest,
      currentManifest: manifest,
      diffDir: path.join(reportDir, 'diff'),
      threshold: config.threshold,
      maxDiffPixels: config.maxDiffPixels,
      concurrency: config.compareConcurrency,
    });
  }

  const [targets, themeOverrides] = await Promise.all([
    loadThemingTargets(REPO_ROOT),
    loadThemeOverrides(REPO_ROOT, config.probeTheme),
  ]);
  const targeting = analyzeTargeting({
    observedTargets: manifest.observedTargets,
    targets,
    themeOverrides,
  });

  const verdict = buildVerdict({
    comparison,
    currentManifest: manifest,
    baselineManifest,
    targeting,
    failures,
    context: {
      ...manifest.context,
      tiers,
      baselineExists: exists,
      components,
      ...(baselineAccounting ? {baselineAccounting} : {}),
    },
  });

  stageReportImages({
    reportDir,
    keys: [
      ...comparison.changes.map(change => change.key),
      ...comparison.added,
      ...comparison.removed,
    ],
    currentDir: outDir,
    baselinePath: path.join(baselineDir, 'shots'),
  });
  fs.writeFileSync(path.join(reportDir, 'index.html'), renderReport(verdict));
  const verdictJson = `${JSON.stringify(verdict, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, 'verdict.json'), verdictJson);
  // Also inside the report, so the published report directory is self-contained
  // and the verdict has a stable URL next to the pictures it describes.
  fs.writeFileSync(path.join(reportDir, 'verdict.json'), verdictJson);

  const summary = summarize(verdict, exists);
  process.stdout.write(summary);
  if (flag('summary-output')) fs.writeFileSync(flag('summary-output'), summary);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `status=${verdict.status}`,
        `changed=${verdict.counts.changed}`,
        `added=${verdict.counts.added}`,
        `failed=${verdict.counts.failed}`,
        `total=${verdict.counts.total}`,
      ].join('\n') + '\n',
    );
  }

  if (verdict.status === 'failed') return EXIT.crashed;
  return verdict.status === 'changed' ? EXIT.changed : EXIT.clean;
}

/** @param {object} verdict @param {boolean} baselineExists */
function summarize(verdict, baselineExists) {
  const lines = [`## Visual gate: ${verdict.status}`, ''];
  if (!baselineExists) {
    lines.push('No baseline existed — this run establishes one. Nothing was compared.', '');
  }
  lines.push(
    `| shots | changed | added | removed | failed |`,
    `|---|---|---|---|---|`,
    `| ${verdict.counts.total} | ${verdict.counts.changed} | ${verdict.counts.added} | ${verdict.counts.removed} | ${verdict.counts.failed} |`,
    '',
  );
  const accounting = verdict.context?.baselineAccounting;
  if (accounting) {
    lines.push(
      `Baseline accounting: ${accounting.plannedCurrentStable} planned stable · ${accounting.policyExcluded} policy-excluded · ${accounting.intentionallyExcluded} intentionally excluded · ${accounting.preservedLegacy} preserved legacy · ${accounting.unclassified} unclassified`,
      '',
    );
    if (accounting.unclassifiedKeys) {
      lines.push(
        'Unclassified baseline keys:',
        ...accounting.unclassifiedKeys.map(key => `- \`${key}\``),
        '',
      );
    }
  }
  if (verdict.changes.length > 0) {
    lines.push('### Changed', '', '| shot | theme | mode | diff px | why it is in the plan |', '|---|---|---|---|---|');
    for (const change of verdict.changes.slice(0, 40)) {
      lines.push(
        `| \`${change.key}\` | ${change.theme} | ${change.mode} | ${change.diffPixels} | ${(change.reasons ?? []).join(', ')} |`,
      );
    }
    if (verdict.changes.length > 40) lines.push(`| … | | | | ${verdict.changes.length - 40} more |`);
    lines.push('');
  }
  const unexercised = verdict.targeting?.unexercisedOverrides ?? [];
  if (unexercised.length > 0) {
    lines.push(
      `### Theme overrides that bound to nothing (${unexercised.length})`,
      '',
      ...unexercised
        .slice(0, 25)
        .map(finding => `- \`${finding.theme}\` → \`${finding.key}${finding.selector ? `.${finding.selector}` : ''}\``),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  switch (command) {
    case 'scout': {
      const shard = parseShard(flag('shard'));
      const out = flag('observations-out');
      if (!out) throw new Error('scout needs --observations-out <file>.');
      const {scoutStoryIds} = await plan({scoutOnly: true});
      if (!scoutStoryIds) throw new Error('The release plan scouts nothing.');
      const mine = shardStoryIds(scoutStoryIds, shard);
      // A shard job may run on a bigger runner than the config's pages assume.
      if (has('concurrency') && flag('concurrency') === undefined) {
        throw new Error('--concurrency requires a value.');
      }
      const pages = flag('concurrency') ?? String(config.scoutConcurrency);
      const concurrency = Number(pages);
      if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new Error(`--concurrency must be a positive integer, got ${pages}.`);
      }
      process.stderr.write(
        `Scouting shard ${shard.index}/${shard.count}: ${mine.length} of ${scoutStoryIds.length} stories…\n`,
      );
      const observations = await scout({
        storyIds: mine,
        storybookDir,
        theme: config.defaultTheme,
        viewport: config.viewport,
        concurrency,
      });
      fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
      fs.writeFileSync(
        out,
        `${JSON.stringify(
          shardFile({
            storyIds: scoutStoryIds,
            shard,
            storybookSha: storybookBuildSha(),
            observations,
          }),
        )}\n`,
      );
      return EXIT.clean;
    }
    case 'plan': {
      const {shots} = await plan();
      if (has('json')) {
        process.stdout.write(`${JSON.stringify(shots, null, 2)}\n`);
        return EXIT.clean;
      }
      const byReason = {};
      for (const shot of shots) {
        for (const reason of shot.reasons) {
          const bucket = reason.split(':').slice(0, 2).join(':');
          byReason[bucket] = (byReason[bucket] ?? 0) + 1;
        }
      }
      process.stdout.write(`${shots.length} shots\n`);
      for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
        process.stdout.write(`  ${String(count).padStart(5)}  ${reason}\n`);
      }
      return EXIT.clean;
    }
    case 'capture': {
      const {shots} = await plan();
      const {failures} = await runCapture(shots);
      process.stdout.write(`Captured ${shots.length - failures.length}/${shots.length} into ${outDir}\n`);
      return failures.length > 0 ? EXIT.crashed : EXIT.clean;
    }
    case 'check':
    case 'release':
      return check();
    case 'flaky': {
      // A gate that cries wolf gets ignored, so the exclusion list is
      // evidence, not guesswork: capture the same build twice and name every
      // shot that could not reproduce itself.
      const {shots} = await plan();
      const passes = Number(flag('passes') ?? 2);
      /** @type {Map<string, Set<string>>} */
      const seen = new Map();
      const passRoot = outDir;
      for (let pass = 0; pass < passes; pass += 1) {
        process.stderr.write(`Pass ${pass + 1}/${passes}\n`);
        // Each pass keeps its own directory: when a shot turns out to be
        // unstable, the evidence of how it differed has to survive the run.
        outDir = path.join(passRoot, `pass-${pass + 1}`);
        const {manifest} = await runCapture(shots);
        for (const [key, shot] of Object.entries(manifest.shots)) {
          if (!seen.has(key)) seen.set(key, new Set());
          seen.get(key).add(shot.sha256);
        }
      }
      outDir = passRoot;
      const unstable = [...seen.entries()]
        .filter(([, hashes]) => hashes.size > 1)
        .map(([key]) => key);
      const stories = [...new Set(unstable.map(key => key.split('__')[0]))].sort();
      process.stdout.write(
        `${unstable.length} unstable shot(s) across ${passes} passes, in ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}\n`,
      );
      for (const story of stories) process.stdout.write(`  ${story}\n`);
      if (unstable.length > 0) {
        process.stdout.write(
          `\nEach pass is kept under ${passRoot} — diff them to see what moved, then add these to excludeStories in visual-gate.config.json with the reason each one cannot reproduce.\n`,
        );
      }
      return unstable.length > 0 ? EXIT.changed : EXIT.clean;
    }
    case 'accept': {
      const manifestPath = path.join(outDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`No capture at ${outDir} — run check or capture first.`);
      }
      const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const verdictPath = path.join(outDir, 'verdict.json');
      let verdict = null;
      if (fs.existsSync(verdictPath)) {
        try {
          verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
        } catch (error) {
          throw new Error(`Refusing to promote: ${verdictPath} is unreadable (${error.message}).`);
        }
      }
      // accept() validates the verdict against the current baseline before
      // writing, including the narrowly allowed full browser refresh.
      const requested = flag('keys');
      const removed = new Set(verdict?.removed ?? []);
      // The dispatch form invites "a, b" — trim each key before it meets the
      // key validation in accept().
      const named =
        !requested || requested === 'all'
          ? [
              ...Object.keys(currentManifest.shots),
              ...(has('prune') ? removed : []),
            ]
          : requested.split(',').map(key => key.trim()).filter(Boolean);
      if (new Set(named).size !== named.length) throw new Error('accept repeats a shot key.');
      const prune = has('prune') ? named.filter(key => removed.has(key)) : [];
      const keys = named.filter(key => currentManifest.shots[key]);
      const unknown = named.filter(key => !currentManifest.shots[key] && !removed.has(key));
      if (unknown.length) throw new Error(`accept names unknown shot(s): ${unknown.join(', ')}`);
      if (prune.length) {
        if (verdict?.status === 'failed') {
          throw new Error('Refusing to prune from a failed visual verdict.');
        }
        const plan = validateReleasePlan(
          currentManifest.context?.releasePlan,
          currentManifest,
        );
        if (JSON.stringify(verdict?.context?.releasePlan) !== JSON.stringify(plan)) {
          throw new Error('Refusing to prune without the capture’s canonical release plan.');
        }
      }
      const baselineManifest = {
        ...currentManifest,
        context: currentManifest.context
          ? {...currentManifest.context, releasePlan: undefined}
          : null,
      };
      const result = accept({
        baselineDir,
        captureDir: outDir,
        currentManifest: baselineManifest,
        verdict,
        keys,
        reason: flag('reason') ?? '',
        actor: flag('actor') ?? process.env.GITHUB_ACTOR ?? process.env.USER ?? 'unknown',
        runId: process.env.GITHUB_RUN_ID ?? null,
        prune,
      });
      process.stdout.write(
        `Promoted ${result.promoted.length} shot(s), pruned ${result.pruned.length}, into ${baselineDir}\n`,
      );
      return EXIT.clean;
    }
    default:
      process.stderr.write(
        'Usage: gate.mjs <flaky|plan|scout|capture|check|release|accept> [--storybook-dir dir] [--baseline dir] [--out dir] [--tiers a,b] [--sample n]\n',
      );
      return EXIT.crashed;
  }
}

main().then(
  code => process.exit(code),
  error => {
    process.stderr.write(`::error::${error?.stack ?? error}\n`);
    process.exit(EXIT.crashed);
  },
);
