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

const require = createRequire(import.meta.url);
const {diffAgainstBaseline} = require('./lib/a11y-baseline.js');

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
 * Whether the default check runs: at most MAX_TOUCHED_COMPONENTS touched and
 * no foundation changed. A wide change skips it; nothing starts a full suite
 * on its own.
 */
export function decideWideChange(scope, files) {
  const foundations = foundationChanges(files);
  return {
    componentCount: scope.touched.length,
    foundations,
    wideChange:
      scope.touched.length > MAX_TOUCHED_COMPONENTS || foundations.length > 0,
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
 * What each suite audits for this pull request: the touched owners only.
 * Reverse dependents stay with the opted-in owners (FR13): the analysis
 * reports every component whose bundle reaches a change, which for a shared
 * primitive is most of Core, so they would not fit this check's 15-minute limit.
 * Nothing here selects a full suite either: a change the analysis cannot
 * scope audits its touched owners, and the comment points to the labels for
 * the rest.
 */
export function resolveTouchedScope(analysis) {
  const touched = [
    ...new Set([
      ...strings(analysis.newComponentOwners),
      ...strings(analysis.modifiedComponentOwners),
    ]),
  ].filter(owner => owner.includes('/'));
  const packages = [
    ...new Set(touched.map(owner => ownerIdentity(owner).shortPackage)),
  ].sort();
  return {
    touched,
    visualComponents: [
      ...new Set(
        touched
          .map(ownerIdentity)
          .filter(identity => identity.shortPackage === 'core')
          .map(identity => identity.name),
      ),
    ].sort(),
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
 * The visual result for one owner, from the gate's verdict. Added and removed
 * shots are listed by key; the run's manifest names their components.
 */
export function visualResult(identity, verdict, scope, shots = {}) {
  if (verdict == null) return {result: 'not-run'};
  if (identity.shortPackage !== 'core') {
    return {result: 'not-run', detail: 'no stable visual stories outside Core'};
  }
  if (
    !scope.visualComponents.includes(identity.name) ||
    verdict.status === 'skipped'
  ) {
    return {result: 'not-run'};
  }
  const mine = entry =>
    namesOwner(
      typeof entry === 'string' ? shots[entry]?.component : entry?.component,
      identity,
    );
  if ((verdict.failures ?? []).some(mine)) return {result: 'fail'};
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

/** The RTL result for one owner, across every package report. */
export function rtlResult(identity, reports) {
  const results = reports.flatMap(report =>
    RTL_SECTIONS.flatMap(section => report?.[section]?.results ?? []),
  );
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
    const visual = visualResult(identity, verdict, scope, visualShots);
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
    componentCount: scope.touched.length,
    broad: scope.broad,
    components: scope.touched.map(row),
  };
}

export function hasFailure(report) {
  return report.components.some(component =>
    SUITES.some(suite => component.results[suite] === 'fail'),
  );
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
  const scope = resolveTouchedScope(analysis);
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
