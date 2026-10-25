#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Generates and posts PR comment with analysis results
 * @input --analysis <file> --base-stats <file> --a11y <file> --visual <file> --storybook-url <url> --sandbox-url <url> --preview-state <state> --source-conclusion <conclusion> --run-url <url>
 * @output Formatted markdown comment body to stdout
 */

const fs = require('node:fs');
const {buildA11ySection} = require('./lib/a11y-format');
const {buildVisualSection} = require('./lib/visual-format');
// Report-file strings render as literal inline text, report numbers as
// numbers — the comment's structure comes only from this file's literals.
const {inline, num} = require('./lib/report-text');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const analysisFile = getArg('analysis') || 'analysis.json';
const baseStatsFile = getArg('base-stats');
const a11yFile = getArg('a11y') || 'a11y-report.json';
const visualFile = getArg('visual');
const runUrl = getArg('run-url') || '';
const prNumber = getArg('pr-number') || '';
const storybookUrl = getArg('storybook-url') || '';
const sandboxUrl = getArg('sandbox-url') || '';
const previewState = getArg('preview-state') || '';
const sourceConclusion = getArg('source-conclusion') || '';

// Read analysis results
let analysis = {
  newComponents: [],
  modifiedComponents: [],
  componentStats: {},
  totalBundle: {},
};
let a11yReport = {components: {}};
try {
  analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
} catch (e) {
  console.error('Warning: Could not read analysis file:', e.message);
}

// Base measurements from a built checkout of the merge base, written by
// `analyze-pr.js --base-only`. The caller has already matched their head.
if (baseStatsFile) {
  try {
    const base = JSON.parse(fs.readFileSync(baseStatsFile, 'utf8'));
    analysis.baseComponentStats = base.baseComponentStats || undefined;
    analysis.baseBundlePackages = base.baseBundlePackages || undefined;
    analysis.baseComponentSizes = base.baseComponentSizes || undefined;
  } catch (e) {
    console.error('Warning: Could not read base stats:', e.message);
  }
}

try {
  a11yReport = JSON.parse(fs.readFileSync(a11yFile, 'utf8'));
} catch (e) {
  console.error('Warning: Could not read a11y report:', e.message);
}

// Build a Storybook deep link URL for a component
// Story titles like "Core/XDSButton" become path "/docs/core-xdsbutton--docs"
function getStorybookLink(storybookBaseUrl, storyTitle) {
  if (!storybookBaseUrl || !storyTitle) return null;
  // storyTitle may be a single string or an array when multiple story files match
  const title = Array.isArray(storyTitle) ? storyTitle[0] : storyTitle;
  if (!title) return null;
  // Storybook converts "Core/XDSButton" to "core-xdsbutton" as the story ID
  // prefix. Story ids only ever contain [a-z0-9_-]; the title came from a
  // report file, so drop anything outside that alphabet before it lands in
  // the href.
  const storyPath = title
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return `${storybookBaseUrl}?path=/docs/${storyPath}--docs`;
}

// Build an external link that opens in a new tab
function extLink(text, url) {
  return `<a href="${String(url).replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

// Difference of two measured byte counts, or null when either side was not
// measured. A missing size is never treated as 0.
function bytesDelta(after, before) {
  return typeof after === 'number' &&
    Number.isFinite(after) &&
    typeof before === 'number' &&
    Number.isFinite(before)
    ? after - before
    : null;
}

// A measured byte count as text, or N/A. Only numbers reach the output.
function sizeText(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'N/A';
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function signedSizeText(delta) {
  if (delta === null) return 'N/A';
  return delta > 0 ? `+${sizeText(delta)}` : sizeText(delta);
}

// Touch-only budget per component (architecture:component-style-authoring
// INV6, spec:AST-080 FR8): 2 KB gzip JavaScript, 1 KB gzip CSS. The report
// cannot tell whether growth runs only on a coarse pointer, so it flags any
// growth over budget and asks the author.
const JS_BUDGET_BYTES = 2 * 1024;
const CSS_BUDGET_BYTES = 1024;
const budgetFlags = [];

// Build component stats section
let componentSection = '';
if (analysis.newComponents && analysis.newComponents.length > 0) {
  componentSection += `### New Components\n\n`;
  for (const comp of analysis.newComponents) {
    const stats = analysis.componentStats[comp] || {};
    const sbLink = getStorybookLink(storybookUrl, stats.storyTitle);
    const sbBadge = sbLink ? ` · ${extLink('View in Storybook', sbLink)}` : '';
    const pkgBadge = stats.package
      ? ` <sub>(${inline(stats.package)})</sub>`
      : '';
    componentSection += `<details>\n<summary><strong>${inline(comp)}</strong>${pkgBadge}${sbBadge}</summary>\n\n`;
    componentSection += `| Metric | Value |\n|--------|-------|\n`;
    componentSection += `| Entry File (ESM) | ${inline(stats.esmSize) || 'N/A'} |\n`;
    if (stats.cjsSize)
      componentSection += `| Entry File (CJS) | ${inline(stats.cjsSize)} |\n`;
    componentSection += `| Lines of Code | ${inline(stats.linesOfCode) || 'N/A'} |\n`;
    componentSection += `| Source Files | ${inline(stats.fileCount) || 'N/A'} |\n`;
    componentSection += `| Complexity | ${inline(stats.complexityRating) || 'N/A'} (${num(stats.complexity)}) |\n`;
    componentSection += `| Exports | ${stats.exports?.map(inline).join(', ') || 'N/A'} |\n`;
    componentSection += `| Props Count | ${inline(stats.propsCount) || 'N/A'} |\n`;
    componentSection += `| Has Tests | ${stats.hasTests ? 'Yes' : 'No'} |\n`;
    componentSection += `| Has Stories | ${stats.hasStories ? 'Yes' : 'No'} |\n`;
    componentSection += `\n</details>\n\n`;
  }
}

if (analysis.modifiedComponents && analysis.modifiedComponents.length > 0) {
  componentSection += `### Modified Components\n\n`;
  for (const comp of analysis.modifiedComponents) {
    const stats = analysis.componentStats[comp] || {};
    const baseStats = analysis.baseComponentStats?.[comp] || {};
    const sbLink = getStorybookLink(storybookUrl, stats.storyTitle);
    const sbBadge = sbLink ? ` · ${extLink('View in Storybook', sbLink)}` : '';

    // Check if this modified directory has new exports
    const newExports = analysis.newExports || [];
    const compExports = stats.exports || [];
    const newInComp = compExports.filter(e => newExports.includes(e));
    const newBadge =
      newInComp.length > 0 ? ` · 🆕 ${newInComp.map(inline).join(', ')}` : '';
    const pkgBadge = stats.package
      ? ` <sub>(${inline(stats.package)})</sub>`
      : '';

    componentSection += `<details>\n<summary><strong>${inline(comp)}</strong>${pkgBadge}${sbBadge}${newBadge}</summary>\n\n`;
    componentSection += `| Metric | Before | After | Delta |\n|--------|--------|-------|-------|\n`;

    const esmDelta = bytesDelta(stats.esmBytes, baseStats.esmBytes);
    const esmDeltaStr =
      esmDelta !== null
        ? esmDelta > 0
          ? `+${esmDelta}B`
          : `${esmDelta}B`
        : 'N/A';

    componentSection += `| Entry File (ESM) | ${inline(baseStats.esmSize) || 'N/A'} | ${inline(stats.esmSize) || 'N/A'} | ${esmDeltaStr} |\n`;
    componentSection += `| Lines of Code | ${inline(baseStats.linesOfCode) || 'N/A'} | ${inline(stats.linesOfCode) || 'N/A'} | - |\n`;
    componentSection += `| Complexity | ${inline(baseStats.complexityRating) || 'N/A'} | ${inline(stats.complexityRating) || 'N/A'} (${num(stats.complexity)}) | - |\n`;
    componentSection += `\n</details>\n\n`;
  }
}

// Import and CSS size of every public component whose implementation changed,
// family folders included, before and after.
let sizeSection = '';
const componentSizes = analysis.componentSizes || {};
const baseComponentSizes = analysis.baseComponentSizes || {};
const sizeKeys = [
  ...new Set([
    ...Object.keys(componentSizes),
    ...Object.keys(baseComponentSizes),
  ]),
].sort();
if (sizeKeys.length > 0) {
  sizeSection += '### Component Size\n\n';
  sizeSection +=
    '| Component | Import before | Import after | Delta | CSS before | CSS after | Delta |\n';
  sizeSection +=
    '|-----------|---------------|--------------|-------|------------|-----------|-------|\n';
  for (const key of sizeKeys) {
    const head = componentSizes[key] || {};
    const base = baseComponentSizes[key] || {};
    const importDelta = bytesDelta(head.importGzipBytes, base.importGzipBytes);
    const cssDelta = bytesDelta(head.cssGzipBytes, base.cssGzipBytes);
    const jsOver = importDelta !== null && importDelta > JS_BUDGET_BYTES;
    const cssOver = cssDelta !== null && cssDelta > CSS_BUDGET_BYTES;
    if (jsOver || cssOver)
      budgetFlags.push({comp: key, importDelta, cssDelta, jsOver, cssOver});
    sizeSection += `| ${inline(key)} | ${sizeText(base.importGzipBytes)} | ${sizeText(head.importGzipBytes)} | ${signedSizeText(importDelta)}${jsOver ? ' ⚠️' : ''} | ${sizeText(base.cssGzipBytes)} | ${sizeText(head.cssGzipBytes)} | ${signedSizeText(cssDelta)}${cssOver ? ' ⚠️' : ''} |\n`;
  }
  sizeSection +=
    '\nSizes are gzip. Import counts the JavaScript the import loads eagerly; CSS counts the package stylesheet rules referenced by the modules it can load from its own package, lazily loaded ones included.\n\n';
}

// Components whose growth passes the touch-only budget.
let budgetSection = '';
if (budgetFlags.length > 0) {
  budgetSection += '### ⚠️ Touch-only size budget\n\n';
  budgetSection +=
    'These components grew past the touch-only budget (2 KB gzip JavaScript or 1 KB gzip CSS per component). If the growth runs only on a coarse pointer, load its JavaScript lazily so the import does not carry it, or justify the cost in the pull request description; CSS stays in the package stylesheet, so justify it.\n\n';
  budgetSection +=
    '| Component | JavaScript | CSS |\n|-----------|------------|-----|\n';
  for (const flag of budgetFlags) {
    budgetSection += `| ${inline(flag.comp)} | ${signedSizeText(flag.importDelta)}${flag.jsOver ? ' ⚠️' : ''} | ${signedSizeText(flag.cssDelta)}${flag.cssOver ? ' ⚠️' : ''} |\n`;
  }
  budgetSection += '\n';
}

// Build accessibility section using shared module
const a11ySection = buildA11ySection(a11yReport);

// Visual regression is optional: the pr-visual job is skipped when no
// components changed, and absent entirely on older runs.
let visualVerdict = null;
if (visualFile) {
  try {
    visualVerdict = JSON.parse(fs.readFileSync(visualFile, 'utf8'));
  } catch {
    visualVerdict = null;
  }
}
const visualSection = buildVisualSection(
  visualVerdict,
  getArg('visual-report-url'),
  getArg('visual-image-url'),
);

// Build bundle size section — one row per package the PR actually touched.
let bundleSection = '### Bundle Size Summary\n\n';
// Prefer the multi-package list; fall back to the legacy single-core shape so
// an older analysis.json still renders.
const bundlePackages =
  analysis.bundlePackages && analysis.bundlePackages.length > 0
    ? analysis.bundlePackages
    : analysis.totalBundle
      ? [{package: '@astryxdesign/core', ...analysis.totalBundle}]
      : [];

const baseBundles = analysis.baseBundlePackages;
const signedBytes = delta =>
  delta === null ? 'N/A' : delta > 0 ? `+${delta}B` : `${delta}B`;
if (bundlePackages.length > 0 && Array.isArray(baseBundles)) {
  bundleSection += `Gzip figures measure each package's entry file, not the code an import pulls in.\n\n`;
  bundleSection += `| Package | Entry (ESM) | Entry gzip before | Entry gzip after | Delta |\n`;
  bundleSection += `|---------|-------------|-------------------|------------------|-------|\n`;
  for (const b of bundlePackages) {
    const base = baseBundles.find(entry => entry.package === b.package) || {};
    const delta = bytesDelta(b.gzipBytes, base.gzipBytes);
    bundleSection += `| ${inline(b.package)} | ${inline(b.esmSize) || 'N/A'} | ${inline(base.gzipSize) || 'N/A'} | ${inline(b.gzipSize) || 'N/A'} | ${signedBytes(delta)} |\n`;
  }
  bundleSection += `\n`;
  const sheets = bundlePackages.filter(
    b => typeof b.stylesheetGzipBytes === 'number',
  );
  if (sheets.length > 0) {
    bundleSection += `| Package stylesheet | Gzip before | Gzip after | Delta |\n`;
    bundleSection += `|--------------------|-------------|------------|-------|\n`;
    for (const b of sheets) {
      const base = baseBundles.find(entry => entry.package === b.package) || {};
      const delta = bytesDelta(b.stylesheetGzipBytes, base.stylesheetGzipBytes);
      bundleSection += `| ${inline(b.package)} | ${sizeText(base.stylesheetGzipBytes)} | ${sizeText(b.stylesheetGzipBytes)} | ${signedSizeText(delta)} |\n`;
    }
    bundleSection += `\n`;
  }
} else if (bundlePackages.length > 0) {
  bundleSection += `| Package | Size (ESM) | Size (CJS) | Gzipped |\n`;
  bundleSection += `|---------|------------|------------|----------|\n`;
  for (const b of bundlePackages) {
    bundleSection += `| ${inline(b.package)} | ${inline(b.esmSize) || 'N/A'} | ${inline(b.cjsSize) || 'N/A'} | ${inline(b.gzipSize) || 'N/A'} |\n`;
  }
  bundleSection += `\n`;
} else {
  bundleSection += '_No component packages changed._\n\n';
}

if (analysis.bundleDelta) {
  const delta = num(analysis.bundleDelta);
  const direction =
    delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged';
  bundleSection += `**Bundle size ${direction}:** ${delta > 0 ? '+' : ''}${delta} bytes\n\n`;
}

// Build storybook link section
let storybookSection = '';
if (storybookUrl) {
  storybookSection = `### 📚 Storybook Preview

**${extLink('View Storybook for this PR', storybookUrl)}**

`;
}

// Build sandbox link section
let sandboxSection = '';
if (sandboxUrl) {
  sandboxSection = `### 🧪 Sandbox Preview

**${extLink('View Sandbox for this PR', sandboxUrl)}**

`;
}

// Both previews share the exact-head Vercel deployment, never a Pages, canary,
// production, or earlier-head fallback.
let previewAvailabilitySection = '';
if (previewState) {
  if (!storybookUrl || !sandboxUrl)
    previewAvailabilitySection = `> **Preview availability:** Storybook and Sandbox are not both ready on the exact-head Vercel preview.${sourceConclusion && sourceConclusion !== 'success' ? ` CI concluded ${sourceConclusion}.` : ''}\n\n`;
}

// Build footer with links
let footerLinks = [];
if (storybookUrl) footerLinks.push(extLink('Storybook', storybookUrl));
if (sandboxUrl) footerLinks.push(extLink('Sandbox', sandboxUrl));
if (runUrl) footerLinks.push(extLink('View full report', runUrl));
const footerLinksStr =
  footerLinks.length > 0 ? ` | ${footerLinks.join(' | ')}` : '';

// A one-line caveat shown when the analysis fell back to the approximate
// two-dot diff. The file list may include base-only churn and, worse, may
// miss a component the PR actually changed (if that change also exists on
// base), so consumers should not treat the component list as exact.
const diffModeCaveat =
  analysis.diffMode === 'two-dot'
    ? '> ⚠️ **Approximate analysis** - the diff could not be resolved to a merge base, so a two-dot fallback was used. The component list may include base-only changes or miss a component whose change also landed on base.\n\n'
    : '';

// Build the full comment
const body = `## PR Analysis Report
<!-- astryx-pr-analysis -->

${diffModeCaveat}${previewAvailabilitySection}${storybookSection}${sandboxSection}${componentSection || (sizeSection ? '' : '_No new or modified components detected._\n\n')}
${sizeSection}${budgetSection}${bundleSection}
${a11ySection}
${visualSection}---

<sub>Generated by PR Enrichment workflow${footerLinksStr}</sub>
`;

// Output to stdout
console.log(body);
