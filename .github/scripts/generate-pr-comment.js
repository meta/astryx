#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Generates the PR comment from the run's analysis results
 * @input --analysis <file> --base-stats <file> --package-size <file> --api-changes <file> --a11y <file> --visual <file> --visual-frames <file> --preview <file> --jobs <file> --touched <file> --source-conclusion <conclusion> --run-url <url>
 * @output Formatted markdown comment body to stdout, compact by design: this
 *   head's preview first, the modified components (preview links, size, lines
 *   of code, a mark per browser suite that ran; three rows visible, the rest
 *   collapsed), the changed shots collapsed, one line for package size and
 *   one for suites that did not run. Accessibility violations add one
 *   collapsed section. GitHub shows
 *   the CI checks and CodeBunny posts its own review; neither is repeated.
 */

const fs = require('node:fs');
const {buildA11ySection} = require('./lib/a11y-format');
const {buildCompactReport, notRunLine} = require('./lib/pr-status');
// Report-file strings render as literal inline text, report numbers as
// numbers — the comment's structure comes only from this file's literals.
const {COMMENT_BUDGET, fitToBudget, inline, num} = require('./lib/report-text');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const analysisFile = getArg('analysis') || 'analysis.json';
const baseStatsFile = getArg('base-stats');
const a11yFile = getArg('a11y') || 'a11y-report.json';
const runUrl = getArg('run-url') || '';
const sourceConclusion = getArg('source-conclusion') || '';

// Optional JSON inputs. A missing or unreadable file leaves its part out.
function readOptionalJson(name, file = getArg(name)) {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Warning: Could not read --${name}:`, e.message);
    return null;
  }
}

let analysis = {newComponents: [], modifiedComponents: [], componentStats: {}};
try {
  analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
} catch (e) {
  console.error('Warning: Could not read analysis file:', e.message);
}

// Base measurements of the merge base, when the caller has one for this
// exact head (it has matched the head).
const baseStats = readOptionalJson('base-stats', baseStatsFile);
if (baseStats) {
  analysis.baseComponentStats = baseStats.baseComponentStats || undefined;
  analysis.baseBundlePackages = baseStats.baseBundlePackages || undefined;
  analysis.baseComponentSizes = baseStats.baseComponentSizes || undefined;
}

// This head's preview ({state, url, sha, aliasOrigin}), the source run's
// jobs, the touched-components report, the package-size report, and the
// browser suites' results. The accessibility report is absent when the
// audit did not run; the visual verdict when the visual job did not.
const preview = readOptionalJson('preview');
const jobs = readOptionalJson('jobs');
const touched = readOptionalJson('touched');
const packageSize = readOptionalJson('package-size');
// The visual frames publish-frames.mjs put on this PR's assets branch.
const visualFrames = readOptionalJson('visual-frames');
// The API report step's changes for this head, when it ran.
const apiChanges = readOptionalJson('api-changes');
const visualVerdict = readOptionalJson('visual');
let a11yReport = null;
try {
  a11yReport = JSON.parse(fs.readFileSync(a11yFile, 'utf8'));
} catch (e) {
  console.error('Warning: Could not read a11y report:', e.message);
}

function extLink(text, url) {
  return `<a href="${String(url).replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

const details = (summary, content) =>
  content
    ? `<details>\n<summary>${summary}</summary>\n\n${content}\n</details>\n\n`
    : '';

// The audit's findings, collapsed: the component table carries each verdict.
const violations = Object.values(a11yReport?.components || {}).reduce(
  (sum, component) => sum + (component.violations?.length || 0),
  0,
);
const a11yDetails =
  violations > 0
    ? details(
        `Accessibility: ${num(violations)} violation(s)`,
        buildA11ySection(a11yReport),
      )
    : '';

// Shots the visual job could not capture: one line; changed shots are listed
// in the report's visual section.
const visualFailed =
  visualVerdict?.status === 'failed'
    ? `> **Visual:** ${num(visualVerdict.counts?.failed)} shot(s) could not be captured.\n\n`
    : '';

// A run that did not succeed may have published only part of this report.
const conclusionNote =
  sourceConclusion && sourceConclusion !== 'success'
    ? `> **Current run:** CI concluded ${inline(sourceConclusion)}; parts of this report may be missing.\n\n`
    : '';

// A one-line caveat shown when the analysis fell back to the approximate
// two-dot diff. The file list may include base-only churn and, worse, may
// miss a component the PR actually changed (if that change also exists on
// base), so consumers should not treat the component list as exact.
const diffModeCaveat =
  analysis.diffMode === 'two-dot'
    ? '> ⚠️ **Approximate analysis** - the diff could not be resolved to a merge base, so a two-dot fallback was used. The component list may include base-only changes or miss a component whose change also landed on base.\n\n'
    : '';

const report = buildCompactReport({
  analysis,
  preview,
  jobs,
  touched,
  a11yReport,
  visualVerdict,
  packageSize,
  visualFrames,
  apiChanges,
  withNotRun: false,
});
const notRun = notRunLine({jobs, a11yReport, visualVerdict, touched});
const footerLinksStr = runUrl
  ? ` | ${extLink('View full report', runUrl)}`
  : '';

const header = `## PR Analysis Report
<!-- astryx-pr-analysis -->

`;
const footer = `---

<sub>Generated by PR Enrichment workflow${footerLinksStr}</sub>
`;
// The whole comment stays under GitHub's limit (report-text.js). The header,
// the footer and the short status lines are never cut; the long sections
// are, from their end, so the API rows (last in the report) go first.
const status = `${notRun}${conclusionNote}${diffModeCaveat}${visualFailed}`;
const room = COMMENT_BUDGET - header.length - footer.length - status.length;
const a11yFitted =
  a11yDetails.length > room / 2
    ? fitToBudget(a11yDetails, Math.floor(room / 2))
    : a11yDetails;
const main = fitToBudget(
  report || '_No component or package changed._\n\n',
  room - a11yFitted.length,
);
const body = `${header}${main}${status}${a11yFitted}${footer}`;

console.log(body);
