// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pr-status.js
 * @input The analysis (changed components, their import sizes and source
 *   stats at head and at the merge base), this head's Vercel preview state,
 *   the package-size report, the accessibility report, the visual verdict,
 *   and the source CI run's jobs
 * @output The PR report's compact body: this head's preview first; one table
 *   of modified components (preview links, JS and CSS size and lines of code
 *   against main, and a fixed-position mark per browser suite when any ran),
 *   three rows visible and the rest collapsed; the changed shots, collapsed,
 *   when any changed; one line for package size; one line for suites that
 *   did not run
 * @position Used by generate-pr-comment.js. Everything here reads data the CI
 *   run and the comment job already have; nothing starts a job. GitHub shows
 *   the CI checks and CodeBunny posts its own review, so neither is repeated.
 */

const {inline, num, sizeText} = require('./report-text');

/**
 * The heavy suites a pull request runs only with its `ci:run-<suite>` label,
 * and the job display names (any parenthesized suffix removed) of each.
 */
const SUITES = [
  {
    id: 'visual',
    label: 'Visual',
    short: 'Visual',
    jobs: /^(Stable visual|visual-scout|pr-visual)/i,
  },
  {
    id: 'a11y',
    label: 'Accessibility',
    short: 'A11y',
    jobs: /^(pr-a11y|Accessibility spec-test)/i,
  },
  {id: 'rtl', label: 'RTL', short: 'RTL', jobs: /^pr-rtl/i},
  {id: 'perf', label: 'Perf', short: 'Perf', jobs: /^(perf|pr-perf)/i},
];

/** Rows shown before the rest of a table is collapsed. */
const VISIBLE_ROWS = 3;
/** Changed shots listed in the visual section, largest change first. */
const VISUAL_FRAME_LIMIT = 12;

/** Touch-only budget per component (architecture:component-style-authoring INV6). */
const JS_BUDGET_BYTES = 2 * 1024;
const CSS_BUDGET_BYTES = 1024;

/**
 * A job's name without its parenthesized suffix: a matrix leg's `(1/3)`, a
 * variant's `(browser specs)`, or a skipped matrix's unexpanded expression,
 * which can hold parentheses of its own.
 */
function baseJobName(name) {
  return String(name ?? '').replace(/\s*\(.*\)\s*$/, '');
}

/**
 * Whether a suite ran on this run: `ran`, or `not-run` when every one of its
 * jobs was skipped by its run condition (the label was absent). A suite with
 * no jobs in the run is unknown (null).
 */
function suiteRunState(suite, jobs) {
  const own = (jobs || []).filter(job =>
    suite.jobs.test(baseJobName(job.name)),
  );
  if (own.length === 0) return null;
  return own.every(job => job.conclusion === 'skipped') ? 'not-run' : 'ran';
}

function isMeasured(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function signedSize(value) {
  return `${value > 0 ? '+' : '−'}${sizeText(Math.abs(value))}`;
}

/**
 * A change against main; growth in bold, so it stands out. Without a number,
 * the component is new when main was measured, and unmeasured when it was
 * not (no record of the merge base).
 */
function delta(value, format, baseMeasured = true) {
  if (value === null) return baseMeasured ? 'new' : 'not measured';
  if (value === 0) return '0';
  const text = format(value);
  return value > 0 ? `**${text}**` : text;
}

function change(after, before) {
  return isMeasured(after) && isMeasured(before) ? after - before : null;
}

/** JS and CSS growth, and whether either passes the touch-only budget. */
function sizeChange(head = {}, base = {}) {
  const js = change(head.importGzipBytes, base.importGzipBytes);
  const css = change(head.cssGzipBytes, base.cssGzipBytes);
  return {
    js,
    css,
    total: js === null && css === null ? null : (js ?? 0) + (css ?? 0),
    overBudget:
      (js !== null && js > JS_BUDGET_BYTES) ||
      (css !== null && css > CSS_BUDGET_BYTES),
  };
}

/**
 * JS and CSS import cost (gzip), each with its change against main, and a 🔴
 * when the growth passes the touch-only budget (advisory).
 */
function sizeCell(head = {}, base = {}, baseMeasured = true) {
  const js = head.importGzipBytes;
  const css = head.cssGzipBytes;
  if (!isMeasured(js) && !isMeasured(css)) return '—';
  const growth = sizeChange(head, base);
  const part = (after, changed, label) =>
    isMeasured(after)
      ? `${sizeText(after)}${label} (${delta(changed, signedSize, baseMeasured)})`
      : null;
  return `${growth.overBudget ? '🔴 ' : ''}${[
    part(js, growth.js, ''),
    part(css, growth.css, ' CSS'),
  ]
    .filter(Boolean)
    .join(' · ')}`;
}

/** Source lines of code with their change against main. */
function locCell(head, base, baseMeasured = true) {
  if (!isMeasured(head)) return '—';
  const count = value => Math.abs(value).toLocaleString('en-US');
  return `${count(num(head))} (${delta(
    change(head, base),
    value => `${value > 0 ? '+' : '−'}${count(value)}`,
    baseMeasured,
  )})`;
}

/**
 * One mark per browser suite, always in the order Visual · A11y · RTL: ✓
 * passed, ✗ failed or changed (its shots are in the visual section), — did
 * not run for this component.
 */
const CHECK_SUITES = ['visual', 'a11y', 'rtl'];
const MARK = {pass: '✓', fail: '✗', changed: '✗'};

function checksCell(results) {
  return CHECK_SUITES.map(id => MARK[results[id]] ?? '—').join(' · ');
}

/** A Storybook docs link from a story title (`Core/Button` → `core-button`). */
function storybookLink(origin, storyTitle) {
  const title = Array.isArray(storyTitle) ? storyTitle[0] : storyTitle;
  if (!origin || !title) return null;
  const id = String(title)
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return `${origin}/storybook/?path=/docs/${id}--docs`;
}

/**
 * One row per modified component: every component this change sized (its
 * folder changed or its bundle reaches a changed module) and every new or
 * modified component folder. Results come from the accessibility report and
 * the visual verdict.
 */
function componentRows({analysis, a11yReport, visualVerdict}) {
  const head = analysis.componentSizes || {};
  const base = analysis.baseComponentSizes || {};
  const stats = analysis.componentStats || {};
  const baseStats = analysis.baseComponentStats || {};
  const keys = new Set(Object.keys(head));
  for (const name of [
    ...(analysis.newComponents || []),
    ...(analysis.modifiedComponents || []),
  ]) {
    const pkg = String(stats[name]?.package || '@astryxdesign/core').replace(
      /^@astryxdesign\//,
      '',
    );
    keys.add(`${pkg}/${name}`);
  }
  const visualChanges = visualVerdict?.changes || [];
  // Main's sizes of the merge base were read (a base record or build).
  const baseMeasured =
    Boolean(analysis.baseSha) ||
    Object.keys(base).length > 0 ||
    Object.keys(baseStats).length > 0;
  return [...keys].map(key => {
    const name = key.slice(key.indexOf('/') + 1);
    // A component the audit did not cover has no accessibility result.
    const audited = a11yReport?.components?.[name];
    const a11y = audited
      ? (audited.violations?.length ?? 0) > 0
        ? 'fail'
        : 'pass'
      : null;
    const visual =
      visualVerdict && visualVerdict.status !== 'skipped'
        ? // A run that failed compared nothing: never a pass.
          visualVerdict.status === 'failed'
          ? 'fail'
          : visualChanges.some(entry => entry.component === name)
            ? 'changed'
            : 'pass'
        : null;
    return {
      key,
      name,
      storyTitle: stats[name]?.storyTitle,
      head: head[key],
      base: base[key],
      growth: sizeChange(head[key], base[key]),
      loc: [stats[name]?.linesOfCode, baseStats[name]?.linesOfCode],
      results: {visual, a11y, rtl: null},
      baseMeasured,
    };
  });
}

/** Failed or changed results first, then budget overruns, then the biggest growth. */
function importance(row) {
  const attention = Object.values(row.results).some(
    value => value === 'fail' || value === 'changed',
  );
  return [
    attention ? 0 : 1,
    row.growth.overBudget ? 0 : 1,
    -(row.growth.total ?? -Infinity),
  ];
}

function compareRows(a, b) {
  const [x, y] = [importance(a), importance(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return a.key.localeCompare(b.key);
}

function buildComponentTable({analysis, origin, a11yReport, visualVerdict}) {
  const rows = componentRows({analysis, a11yReport, visualVerdict}).sort(
    compareRows,
  );
  if (rows.length === 0) return '';
  // The checks column appears only when a browser suite has a result here.
  const checks = rows.some(row =>
    CHECK_SUITES.some(id => row.results[id] != null),
  );
  const columns = [
    'Component',
    'Size',
    'LoC',
    ...(checks ? ['Visual · A11y · RTL'] : []),
  ];
  const header = `| ${columns.join(' | ')} |\n|${columns.map(() => '---').join('|')}|\n`;
  // The name links its docs page in this head's preview; Storybook follows.
  const line = row => {
    // Core components go by name; another package's carry its prefix.
    const label = inline(row.key.startsWith('core/') ? row.name : row.key);
    const name = origin
      ? `[${label}](${origin}/components/${encodeURIComponent(row.name)})`
      : label;
    const stories = storybookLink(origin, row.storyTitle);
    const cells = [
      stories ? `${name} · [Storybook](${stories})` : name,
      sizeCell(row.head, row.base, row.baseMeasured),
      locCell(...row.loc, row.baseMeasured),
      ...(checks ? [checksCell(row.results)] : []),
    ];
    return `| ${cells.join(' | ')} |`;
  };
  const visible = rows.slice(0, VISIBLE_ROWS);
  const rest = rows.slice(VISIBLE_ROWS);
  let out = `### Modified components\n\n${header}${visible.map(line).join('\n')}\n\n`;
  if (rest.length > 0)
    out += `<details>\n<summary>${rest.length} more component${rest.length === 1 ? '' : 's'}</summary>\n\n${header}${rest.map(line).join('\n')}\n\n</details>\n\n`;
  return out;
}

/**
 * The changed shots, largest change first: up to VISUAL_FRAME_LIMIT rows,
 * inside one disclosure whose summary carries the counts. With `frames`
 * (publish-frames.mjs's `imageBase` and the `<kind>/<key>.png` it published),
 * each row shows its before/after/diff thumbnails, and only published frames;
 * without it, each row names its change.
 */
/**
 * The changed shots in report order: changed by pixels changed, largest first,
 * then added, then removed. The report lists the first VISUAL_FRAME_LIMIT,
 * and publish-frames.mjs publishes frames for the same ones, so thumbnails
 * and rows cannot drift apart.
 */
function visualShots(verdict) {
  if (!verdict || verdict.status === 'skipped' || verdict.status === 'failed')
    return [];
  return [
    ...[...(verdict.changes || [])]
      .sort((a, b) => Number(b.diffPixels ?? 0) - Number(a.diffPixels ?? 0))
      .map(change => ({...change, kinds: ['before', 'after', 'diff']})),
    ...(verdict.added || []).map(key => ({key, name: key, kinds: ['after']})),
    ...(verdict.removed || []).map(key => ({
      key,
      name: key,
      kinds: ['before'],
    })),
  ];
}

function buildVisualDeltas({verdict, frames = null}) {
  const all = visualShots(verdict);
  if (all.length === 0) return '';
  const rows = all.slice(0, VISUAL_FRAME_LIMIT);
  const unshown = all.length - rows.length;
  const changeText = row =>
    row.kinds.length === 3
      ? `changed (${num(row.diffPixels ?? 0).toLocaleString('en-US')} px)`
      : row.kinds[0] === 'after'
        ? 'added'
        : 'removed';
  const label = row => {
    const story = [row.component || row.title, row.name]
      .filter(Boolean)
      .map(inline)
      .join(' · ');
    const variant = [row.theme, row.mode]
      .filter(Boolean)
      .map(inline)
      .join(', ');
    return variant ? `${story} (${variant})` : story;
  };
  const published = new Set(frames?.published || []);
  const base =
    frames?.imageBase && published.size > 0
      ? `${String(frames.imageBase).replace(/\/+$/, '')}/`
      : null;
  const frame = (row, kind) => {
    if (!row.kinds.includes(kind)) return '—';
    const file = `${kind}/${row.key}.png`;
    if (!published.has(file)) return 'not published';
    return `<img src="${base}${kind}/${encodeURIComponent(String(row.key))}.png" height="120" alt="${kind} frame">`;
  };
  const header = base
    ? '| Component · story | Before | After | Diff |\n|---|---|---|---|\n'
    : '| Component · story | Change |\n|---|---|\n';
  const line = row =>
    base
      ? `| ${label(row)} | ${frame(row, 'before')} | ${frame(row, 'after')} | ${frame(row, 'diff')} |`
      : `| ${label(row)} | ${changeText(row)} |`;
  // A shot key is `<package>-<component>--<story>__<theme>-<mode>`.
  const componentOf = row =>
    String(
      row.component ??
        String(row.key)
          .split('--')[0]
          .replace(/^[a-z]+-/, ''),
    )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const components = new Set(all.map(componentOf));
  return `<details>\n<summary>Visual changes: ${num(all.length)} snapshot${all.length === 1 ? '' : 's'} in ${components.size} component${components.size === 1 ? '' : 's'}</summary>\n\nA change is a question for the reviewer, not a failure.\n\n${header}${rows.map(line).join('\n')}\n\n${unshown > 0 ? `${num(unshown)} more are in the run's visual report.\n\n` : ''}</details>\n\n`;
}

function previewLine(preview) {
  if (!preview || preview.state === 'none') return '';
  const sha = `\`${inline(String(preview.sha ?? '').slice(0, 7))}\``;
  const links = origin =>
    `**[Storybook](${origin}/storybook/) · [Sandbox](${origin}/sandbox/)**`;
  let text;
  if (preview.state === 'unknown')
    text =
      "This branch's preview address cannot be known in advance; open it from Vercel's comment.";
  else if (preview.state === 'ready')
    text = `${links(preview.url)} · built from this PR's head`;
  else if (preview.state === 'failed')
    text = "❌ The preview failed to build; see Vercel's comment.";
  else
    text = `⏳ Building…${preview.aliasOrigin ? ` Until it's ready, ${links(preview.aliasOrigin)} open the branch's previous preview.` : ''}`;
  return `### 🔎 Preview · ${sha}\n\n${text}\n\n`;
}

/**
 * Package size: each published package whose download changed, one line each
 * (the first three, then the rest collapsed), with any new runtime dependency.
 */
function packagesLine(report) {
  if (!report || !Array.isArray(report.packages)) return '';
  if (report.verdict === 'no-base')
    return '**Package size:** measured; main has no measurement of the merge base to compare yet.\n\n';
  const added = report.addedDependencies || [];
  const changed = report.packages.filter(
    entry =>
      (isMeasured(entry.base?.packedBytes) &&
        isMeasured(entry.head?.packedBytes) &&
        entry.base.packedBytes !== entry.head.packedBytes) ||
      added.some(dep => dep.package === entry.name),
  );
  if (changed.length === 0)
    return '**Package size:** no published package changed; no new dependencies.\n\n';
  const packed = sizeText;
  const describe = entry => {
    const value = change(entry.head?.packedBytes, entry.base?.packedBytes);
    const deps = added.filter(dep => dep.package === entry.name);
    const size = isMeasured(entry.head?.packedBytes)
      ? `${packed(entry.head.packedBytes)} packed (${delta(value, signedSize)})${entry.overBudget ? ' 🔴' : ''}`
      : 'new package';
    return `${inline(entry.name)} ${size}; ${
      deps.length > 0
        ? `new dependenc${deps.length === 1 ? 'y' : 'ies'}: ${deps.map(dep => inline(dep.name)).join(', ')}`
        : 'no new dependencies'
    }`;
  };
  if (changed.length === 1)
    return `**Package size:** ${describe(changed[0])}.\n\n`;
  const lines = changed.map(entry => `- ${describe(entry)}`);
  const rest = lines.slice(VISIBLE_ROWS);
  return `**Package size:**\n\n${lines.slice(0, VISIBLE_ROWS).join('\n')}\n\n${
    rest.length > 0
      ? `<details>\n<summary>${rest.length} more package${rest.length === 1 ? '' : 's'}</summary>\n\n${rest.join('\n')}\n\n</details>\n\n`
      : ''
  }`;
}

/**
 * One line for the browser suites that did not run, with the labels that run
 * them. A failed or cancelled Storybook build skips them for another reason
 * (GitHub shows that check), so the line is left out.
 */
function notRunLine({jobs, a11yReport, visualVerdict}) {
  const build = (jobs || []).find(
    job => baseJobName(job.name) === 'build-storybook',
  );
  if (build && ['failure', 'cancelled'].includes(build.conclusion)) return '';
  const notRun = SUITES.filter(suite => {
    const state = suiteRunState(suite, jobs);
    if (state !== null) return state === 'not-run';
    if (jobs) return false;
    if (suite.id === 'visual') return !visualVerdict;
    if (suite.id === 'a11y') return !a11yReport;
    return false;
  });
  if (notRun.length === 0) return '';
  const labels = notRun.map(suite => `\`ci:run-${suite.id}\``);
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
  return `Not run on this PR: add ${list} to run ${labels.length === 1 ? 'it' : 'them'}.\n\n`;
}

/** The compact report body, between the heading and the footer. */
function buildCompactReport({
  analysis,
  preview = null,
  jobs = null,
  a11yReport = null,
  visualVerdict = null,
  packageSize = null,
  visualFrames = null,
}) {
  const origin =
    preview?.state === 'ready' ? preview.url : preview?.aliasOrigin || '';
  return `${previewLine(preview)}${buildComponentTable({
    analysis,
    origin,
    a11yReport,
    visualVerdict,
  })}${buildVisualDeltas({verdict: visualVerdict, frames: visualFrames})}${packagesLine(packageSize)}${notRunLine({jobs, a11yReport, visualVerdict})}`;
}

module.exports = {
  visualShots,
  SUITES,
  VISUAL_FRAME_LIMIT,
  baseJobName,
  suiteRunState,
  sizeCell,
  locCell,
  componentRows,
  buildComponentTable,
  buildVisualDeltas,
  checksCell,
  previewLine,
  packagesLine,
  notRunLine,
  buildCompactReport,
  storybookLink,
};
