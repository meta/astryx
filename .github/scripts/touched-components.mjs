// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Touched-components check: scope and per-component results.
 * @input The pull request's analysis.json, and the visual verdict, accessibility
 *   report and RTL reports a touched-components run wrote
 * @output `scope`: GitHub step outputs naming what each suite audits.
 *   `report`: touched-components.json, one row per touched component with a
 *   pass/fail/changed/not-run result for each suite, for the pull-request
 *   comment; a step summary; exit 1 when a suite failed.
 * @position Default pull-request check (spec:AST-030 FR12). It audits only the
 *   components a change touches and never widens to a full suite; full suites
 *   run behind their `ci:run-<suite>` labels and in the release check.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import componentPackages from '../../scripts/component-packages.cjs';

const require = createRequire(import.meta.url);
const {diffAgainstBaseline} = require('./lib/a11y-baseline.js');
const {
  componentPackage,
  componentExportsFromBarrel,
  documentedComponentNames,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = componentPackages;

const SUITES = ['visual', 'a11y', 'rtl'];

/**
 * The most components the default check audits. Over the merged pull requests
 * of the two weeks before this check, a pull request that touched components
 * touched one at the median, two at the 90th percentile and three at the
 * 95th; 2.1% touched more than five. A wider change is a wide change: the
 * full suites behind the ci:run-<suite> labels are the check for it.
 */
export const MAX_TOUCHED_COMPONENTS = 5;

/**
 * Style-affecting foundations: a change here can move any component's pixels,
 * so no touched set describes it. Behaviour-only changes in shared utilities,
 * hooks, gestures or motion are not foundations.
 */
const FOUNDATION_PATTERNS = [
  /^packages\/themes\//,
  /^packages\/[^/]+\/src\/theme\//,
  /(^|\/)tokens\.stylex\.ts$/,
  /^packages\/[^/]+\/src\/(utils|hooks|internal|theme|Layer)\/(.*\/)?[^/]+\.stylex\.ts$/,
];

/** The changed paths that are style-affecting foundations. */
export function foundationChanges(files) {
  return files.filter(file =>
    FOUNDATION_PATTERNS.some(pattern => pattern.test(file)),
  );
}

/**
 * Whether the default check runs: at most MAX_TOUCHED_COMPONENTS touched
 * component folders and no foundation changed. A wide change skips it;
 * nothing starts a full suite on its own. Folders are counted, as the
 * threshold's data counted them, so one change inside a multi-component
 * folder such as Chat is one component.
 */
export function decideWideChange(scope, files) {
  const foundations = foundationChanges(files);
  const componentCount = scope.folders.length;
  return {
    componentCount,
    foundations,
    wideChange:
      componentCount > MAX_TOUCHED_COMPONENTS || foundations.length > 0,
  };
}

/** `core/Button` → its package and name. */
export function ownerIdentity(owner) {
  const slash = owner.indexOf('/');
  const pkg = owner.slice(0, slash);
  return {
    key: owner,
    package: `@astryxdesign/${pkg}`,
    shortPackage: pkg,
    name: owner.slice(slash + 1),
  };
}

const strings = value =>
  Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];

/**
 * The public components a changed multi-component folder (such as Chat or
 * Table) implements. The analysis leaves those folders unresolved; this
 * expands only the changed folder, as the accessibility scope does, without
 * reading Storybook.
 */
export function expandFolderOwners(sources, repoRoot = process.cwd()) {
  const members = [];
  const publicByPackage = new Map();
  for (const source of sources) {
    const [shortPackage, directory, extra] = source.split('/');
    const pkg = componentPackage(shortPackage);
    if (
      !pkg ||
      extra !== undefined ||
      !/^[A-Za-z0-9_.-]+$/.test(directory ?? '')
    ) {
      continue;
    }
    const sourceRoot = path.join(repoRoot, pkg.src);
    const changedDirectory = path.join(sourceRoot, directory);
    if (!fs.existsSync(changedDirectory)) continue;
    const names = documentedComponentNames(changedDirectory);
    if (names.length === 0) continue;
    if (!publicByPackage.has(shortPackage)) {
      publicByPackage.set(
        shortPackage,
        new Set(
          pkg.layout === 'flat'
            ? flatPackageComponentNames(repoRoot, pkg)
            : nestedPackageComponentNames(repoRoot, pkg),
        ),
      );
    }
    const exports = componentExportsFromBarrel(
      path.join(sourceRoot, 'index.ts'),
      sourceRoot,
    );
    for (const name of names) {
      if (!publicByPackage.get(shortPackage).has(name)) continue;
      if (exports.get(name)?.startsWith(`${changedDirectory}${path.sep}`)) {
        members.push({owner: `${shortPackage}/${name}`, folder: directory});
      }
    }
  }
  return members;
}

/**
 * What each suite audits for this pull request: the touched components only,
 * in every package, with a changed multi-component folder expanded to its
 * members. Reverse dependents stay with the opted-in owners (FR13): the
 * analysis reports every component whose bundle reaches a change, which for a
 * shared primitive is most of Core, so they would not fit this check's
 * 15-minute limit. Nothing here selects a full suite either: a change the
 * analysis cannot scope audits its touched components, and the comment
 * points to the labels for the rest. Visual stories are keyed by folder, so
 * a folder member's visual result is its folder's.
 */
export function resolveTouchedScope(
  analysis,
  {repoRoot = process.cwd(), expand = expandFolderOwners} = {},
) {
  const entries = new Map();
  for (const owner of [
    ...strings(analysis.newComponentOwners),
    ...strings(analysis.modifiedComponentOwners),
  ]) {
    if (owner.includes('/') && !entries.has(owner)) {
      entries.set(owner, ownerIdentity(owner).name);
    }
  }
  for (const {owner, folder} of expand(
    strings(analysis.unresolvedComponentSources),
    repoRoot,
  )) {
    if (!entries.has(owner)) entries.set(owner, folder);
  }
  const touched = [...entries.keys()].sort();
  const visualKeyByOwner = Object.fromEntries(entries);
  const folders = [
    ...new Set(
      touched.map(
        owner =>
          `${ownerIdentity(owner).shortPackage}/${visualKeyByOwner[owner]}`,
      ),
    ),
  ].sort();
  const packages = [
    ...new Set(touched.map(owner => ownerIdentity(owner).shortPackage)),
  ].sort();
  return {
    touched,
    folders,
    visualKeyByOwner,
    visualComponents: [
      ...new Set(
        touched
          .filter(owner => ownerIdentity(owner).shortPackage === 'core')
          .map(owner => visualKeyByOwner[owner]),
      ),
    ].sort(),
    noVisualBaseline: [],
    rtlOwnersByPackage: Object.fromEntries(
      packages.map(pkg => [
        pkg,
        touched.filter(owner => owner.startsWith(`${pkg}/`)),
      ]),
    ),
    a11yOwners: touched,
    broad: analysis.forceFullComponentAudits === true,
  };
}

/**
 * Keep only the visual components the accepted baseline has a shot for: a
 * component that has none yet (one a pull request adds) has nothing to
 * compare, so it is reported not-run instead of failing the check. Baseline
 * story ids are `core-<title path>--<story>`, ending in the component.
 */
export function withVisualBaseline(scope, baselineShots) {
  const storyIds = Object.values(baselineShots ?? {})
    .map(shot => shot?.storyId)
    .filter(id => typeof id === 'string');
  const hasShot = name => {
    const lower = name.toLowerCase();
    return storyIds.some(id =>
      new RegExp(`^core-(?:[a-z0-9-]+-)?${lower}--`).test(id),
    );
  };
  return {
    ...scope,
    visualComponents: scope.visualComponents.filter(hasShot),
    noVisualBaseline: scope.visualComponents.filter(name => !hasShot(name)),
  };
}

function readJson(file) {
  if (file == null || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Whether a component name or owner from a report names this owner. */
function namesOwner(value, identity) {
  if (typeof value !== 'string') return false;
  return (
    value === identity.key ||
    value === identity.name ||
    value === `${identity.package}/${identity.name}`
  );
}

/**
 * The visual result for one owner, from pr-visual's verdict for its folder
 * (visual stories are keyed by folder). Added, removed and failed shots are
 * listed by key; the run's manifest names their components. `jobResult` is
 * pr-visual's job result: a failed job that left no verdict is a failure,
 * never a not-run.
 */
export function visualResult(
  identity,
  verdict,
  scope,
  shots = {},
  jobResult = null,
) {
  if (identity.shortPackage !== 'core') {
    return {result: 'not-run', detail: 'no stable visual stories outside Core'};
  }
  const key = scope.visualKeyByOwner?.[identity.key] ?? identity.name;
  if ((scope.noVisualBaseline ?? []).includes(key)) {
    return {result: 'not-run', detail: 'no accepted visual baseline yet'};
  }
  if (!scope.visualComponents.includes(key)) return {result: 'not-run'};
  if (verdict == null) {
    return jobResult === 'failure'
      ? {result: 'fail', detail: 'the visual check failed before its verdict'}
      : {result: 'not-run'};
  }
  if (verdict.status === 'skipped') return {result: 'not-run'};
  const componentOf = entry =>
    typeof entry === 'string'
      ? shots[entry]?.component
      : (entry?.component ?? shots[entry?.key]?.component);
  const mine = entry => componentOf(entry) === key;
  const failures = verdict.failures ?? [];
  // A failure that names no component may be this one's.
  if (
    failures.some(mine) ||
    failures.some(entry => componentOf(entry) == null)
  ) {
    return {result: 'fail', detail: 'a story image could not be captured'};
  }
  const changed =
    (verdict.changes ?? []).filter(mine).length +
    (verdict.added ?? []).filter(mine).length +
    (verdict.removed ?? []).filter(mine).length;
  if (changed > 0) {
    return {result: 'changed', detail: `${changed} story image(s) changed`};
  }
  return {result: 'pass'};
}

/** The accessibility result for one owner: new violations fail it. */
export function a11yResult(identity, report, newViolations) {
  if (report == null) return {result: 'not-run'};
  const audited = Object.keys(report.components ?? {}).some(component =>
    namesOwner(component, identity),
  );
  if (!audited) return {result: 'not-run'};
  const mine = newViolations.filter(violation =>
    namesOwner(violation.component, identity),
  );
  return mine.length > 0
    ? {
        result: 'fail',
        detail: [...new Set(mine.map(violation => violation.ruleId))].join(
          ', ',
        ),
      }
    : {result: 'pass'};
}

const RTL_SECTIONS = [
  'autoDiscovery',
  'positionalMirror',
  'directionalDecorations',
];

/** A curated card's rollup, as one of the section verdicts. */
const CURATED_VERDICT = {
  'RTL-ready': 'pass',
  'not-RTL': 'fail',
  ERROR: 'fail',
  'MISSING-STORY': 'fail',
};

/**
 * The RTL result for one owner, across every package report: the automatic
 * sections and the curated targets' cards.
 */
export function rtlResult(identity, reports) {
  const results = reports.flatMap(report => [
    ...RTL_SECTIONS.flatMap(section => report?.[section]?.results ?? []),
    ...(report?.curated?.results ?? []).map(card => ({
      component: card.component,
      verdict: CURATED_VERDICT[card.rollup] ?? 'N-A',
    })),
  ]);
  const mine = results.filter(result => namesOwner(result.component, identity));
  if (mine.length === 0) return {result: 'not-run'};
  if (mine.every(result => result.verdict === 'N-A')) {
    return {result: 'not-run', detail: 'no RTL check applies'};
  }
  const failed = mine.filter(
    result => result.verdict !== 'pass' && result.verdict !== 'N-A',
  );
  if (failed.length > 0) {
    return {result: 'fail', detail: `${failed.length} RTL check(s) failed`};
  }
  return {result: 'pass'};
}

/** touched-components.json for the pull-request comment. */
export function buildTouchedReport({
  headSha,
  scope,
  verdict,
  visualShots = {},
  visualJobResult = null,
  a11yReport,
  a11yBaseline,
  rtlReports,
}) {
  const newViolations =
    a11yReport != null && a11yBaseline != null
      ? diffAgainstBaseline(a11yReport, a11yBaseline).newViolations
      : [];
  const row = owner => {
    const identity = ownerIdentity(owner);
    const visual = visualResult(
      identity,
      verdict,
      scope,
      visualShots,
      visualJobResult,
    );
    const a11y = a11yResult(identity, a11yReport, newViolations);
    const rtl = rtlResult(identity, rtlReports);
    const details = Object.entries({visual, a11y, rtl})
      .filter(([, value]) => value.detail)
      .map(([suite, value]) => `${suite}: ${value.detail}`);
    return {
      key: identity.key,
      package: identity.package,
      name: identity.name,
      results: {visual: visual.result, a11y: a11y.result, rtl: rtl.result},
      ...(details.length > 0 ? {detail: details.join('; ')} : {}),
    };
  };
  return {
    headSha,
    wideChange: false,
    componentCount: scope.folders.length,
    broad: scope.broad,
    components: scope.touched.map(row),
  };
}

export function hasFailure(report) {
  return report.components.some(component =>
    SUITES.some(suite => component.results[suite] === 'fail'),
  );
}

/**
 * The skipped verdict pr-visual writes for a wide change, so the pull-request
 * comment names the label for the full suite. It carries the run's identity,
 * as a captured verdict does, so the report publisher accepts it.
 */
export function wideVisualVerdict(decision, env = process.env) {
  return {
    version: 1,
    status: 'skipped',
    generatedAt: new Date().toISOString(),
    reason: `Wide change (${decision.componentCount} components): add ci:run-visual to run the full suite.`,
    context: {
      sha: env.GITHUB_SHA ?? null,
      runId: env.GITHUB_RUN_ID ?? null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
      headSha: env.ASTRYX_PR_HEAD_SHA ?? null,
      baseSha: env.ASTRYX_PR_BASE_SHA ?? null,
      ref: env.GITHUB_REF ?? null,
      scope: 'touched',
    },
    counts: {
      total: 0,
      unchanged: 0,
      changed: 0,
      added: 0,
      removed: 0,
      failed: 0,
    },
    changes: [],
    added: [],
    removed: [],
    failures: [],
    targeting: {
      unexercisedOverrides: [],
      uncoveredTargets: [],
      undeclaredTargets: [],
    },
  };
}

/** The record a wide change writes instead of results. */
export function wideReport({headSha, scope, decision}) {
  return {
    headSha,
    wideChange: true,
    componentCount: decision.componentCount,
    foundations: decision.foundations,
    components: scope.touched.map(owner => {
      const identity = ownerIdentity(owner);
      return {
        key: identity.key,
        package: identity.package,
        name: identity.name,
      };
    }),
  };
}

export function summaryMarkdown(report) {
  if (report.wideChange) {
    const reason =
      report.foundations?.length > 0
        ? `it changes shared styles (${report.foundations.join(', ')})`
        : `it touches ${report.componentCount} components (more than ${MAX_TOUCHED_COMPONENTS})`;
    return `### Touched components\n\nWide change (${report.componentCount} components): the touched-components check did not run because ${reason}. Add \`ci:run-visual\`, \`ci:run-a11y\` or \`ci:run-rtl\` to run the full suite.\n`;
  }
  if (report.components.length === 0) {
    return '### Touched components\n\nNo component changed.\n';
  }
  const lines = [
    '### Touched components',
    '',
    '| Component | Visual | Accessibility | RTL |',
    '| --- | --- | --- | --- |',
    ...report.components.map(
      component =>
        `| ${component.key} | ${component.results.visual} | ${component.results.a11y} | ${component.results.rtl} |`,
    ),
  ];
  if (report.broad) {
    lines.push(
      '',
      'This change reaches shared code the analysis could not scope; only the touched components were audited. Add `ci:run-visual`, `ci:run-a11y` or `ci:run-rtl` to audit everything it reaches.',
    );
  }
  return `${lines.join('\n')}\n`;
}

function arg(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function writeOutputs(entries) {
  const lines = Object.entries(entries).map(
    ([key, value]) => `${key}=${value}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  } else {
    console.log(lines.join('\n'));
  }
}

export function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  const analysis = readJson(arg(argv, 'analysis')) ?? {};
  const baselinePath = arg(argv, 'baseline-manifest');
  const resolved = resolveTouchedScope(analysis);
  const scope =
    baselinePath == null
      ? resolved
      : withVisualBaseline(resolved, readJson(baselinePath)?.shots);
  if (command === 'scope') {
    const filesPath = arg(argv, 'files');
    const files =
      filesPath != null && fs.existsSync(filesPath)
        ? fs.readFileSync(filesPath, 'utf8').split('\n').filter(Boolean)
        : [];
    const decision = decideWideChange(scope, files);
    if (decision.wideChange) {
      const report = wideReport({
        headSha: arg(argv, 'head-sha') ?? null,
        scope,
        decision,
      });
      fs.writeFileSync(
        arg(argv, 'out') ?? 'touched-components.json',
        `${JSON.stringify(report, null, 2)}\n`,
      );
      const summary = summaryMarkdown(report);
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
      }
      console.log(summary);
      const wideVerdict = arg(argv, 'wide-verdict');
      if (wideVerdict != null) {
        fs.mkdirSync(path.dirname(wideVerdict), {recursive: true});
        fs.writeFileSync(
          wideVerdict,
          `${JSON.stringify(wideVisualVerdict(decision), null, 2)}\n`,
        );
      }
    }
    writeOutputs({
      wide_change: String(decision.wideChange),
      component_count: String(decision.componentCount),
      has_components: String(scope.touched.length > 0 && !decision.wideChange),
      visual_components: scope.visualComponents.join(','),
      a11y_owners: scope.a11yOwners.join(','),
      rtl_packages: Object.keys(scope.rtlOwnersByPackage).join(','),
      rtl_owners: scope.touched.join(','),
    });
    return 0;
  }
  if (command === 'report') {
    const rtlDir = arg(argv, 'rtl-dir');
    const rtlReports =
      rtlDir != null && fs.existsSync(rtlDir)
        ? fs
            .readdirSync(rtlDir)
            .filter(file => file.endsWith('.json'))
            .map(file => readJson(path.join(rtlDir, file)))
            .filter(Boolean)
        : [];
    const report = buildTouchedReport({
      headSha: arg(argv, 'head-sha') ?? null,
      scope,
      verdict: readJson(arg(argv, 'visual')),
      visualShots: readJson(arg(argv, 'visual-manifest'))?.shots ?? {},
      visualJobResult: arg(argv, 'visual-job') ?? null,
      a11yReport: readJson(arg(argv, 'a11y')),
      a11yBaseline: readJson(arg(argv, 'a11y-baseline')),
      rtlReports,
    });
    fs.writeFileSync(
      arg(argv, 'out') ?? 'touched-components.json',
      `${JSON.stringify(report, null, 2)}\n`,
    );
    const summary = summaryMarkdown(report);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
    console.log(summary);
    return hasFailure(report) ? 1 : 0;
  }
  console.error(
    'usage: touched-components.mjs scope|report --analysis analysis.json [...]',
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
