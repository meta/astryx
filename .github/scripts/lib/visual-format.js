// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared visual-gate formatting for PR enrichment.
 * Used by generate-pr-comment.js and test-pr-enrichment.js.
 */

const {inline, num, safeUrl} = require('./report-text');

/**
 * Build the visual-regression section of the PR comment.
 *
 * The section has to survive four states, and the awkward one is `skipped`:
 * a check that quietly vanishes on the PRs most likely to break something
 * visually is worse than no check, so a skip states its reason explicitly.
 *
 * @param {object|null} verdict - the gate's verdict.json, or null when the job did not run
 * @param {string} [reportUrl] - immutable published report for this run
 * @param {string} [imageUrl] - immutable raw-image base for inline evidence
 * @returns {string} markdown
 */
function buildVisualSection(verdict, reportUrl, imageUrl) {
  const section = buildVisualSectionBody(verdict, reportUrl, imageUrl);
  // pr-visual's default check compares only the touched components (spec:
  // AST-030 FR12); say so, and name the label for the full suite.
  if (
    section &&
    verdict?.context?.scope === 'touched' &&
    verdict.status !== 'skipped'
  ) {
    return `${section}Only the touched components were checked; add \`ci:run-visual\` to run the full suite.\n\n`;
  }
  return section;
}

function buildVisualSectionBody(verdict, reportUrl, imageUrl) {
  if (!verdict) return '';

  // Verdict fields are report data: render them as literal inline text (and
  // counts as numbers), never as markup — see report-text.js.
  const safeReportUrl = reportUrl ? safeUrl(reportUrl) : null;
  const link = safeReportUrl
    ? ` <a href="${safeReportUrl}" target="_blank" rel="noopener noreferrer">View the report</a>`
    : '';
  const reportBase = safeReportUrl
    ? `${safeReportUrl.replace(/\/+$/, '')}/`
    : null;
  // Inline images use raw branch URLs so a delayed Pages deployment cannot
  // break evidence that is already present on gh-pages.
  const imageBase = safeUrl(imageUrl)
    ? `${safeUrl(imageUrl).replace(/\/+$/, '')}/`
    : reportBase;

  if (verdict.status === 'skipped') {
    return `### Visual Regression\n\n**Status:** Skipped — ${inline(verdict.reason)}${link}\n\n`;
  }
  if (verdict.status === 'failed') {
    return `### Visual Regression\n\n**Status:** ${num(verdict.counts?.failed)} shot(s) could not be captured.${link}\n\n`;
  }
  const added = verdict.added ?? [];
  const removed = verdict.removed ?? [];
  if (!verdict.changes || verdict.changes.length === 0) {
    if (added.length > 0 || removed.length > 0) {
      const frames = imageBase
        ? [
            ...added.map(key => ({key, kind: 'after'})),
            ...removed.map(key => ({key, kind: 'before'})),
          ]
            .slice(0, 3)
            .map(({key, kind}) => {
              const safeKey = encodeURIComponent(String(key));
              const label =
                kind === 'after' ? 'Added — After' : 'Removed — Before';
              return `<p><b>${label}</b><br><img src="${imageBase}${kind}/${safeKey}.png" width="300" alt="${label} visual regression frame"></p>`;
            })
            .join('\n')
        : '';
      return `### Visual Regression\n\n**${added.length} added · ${removed.length} removed.**${link}\n\n${frames}\n\n`;
    }
    const compared = num(verdict.counts?.total);
    return `### Visual Regression\n\n**Status:** No visual change across ${compared} compared shot(s).\n\n`;
  }

  const rows = verdict.changes
    .slice(0, 20)
    .map(
      change =>
        `| ${inline(change.component || change.title)} | ${inline(change.name)} | ${inline(change.theme)} | ${inline(change.mode)} | ${num(change.diffPixels).toLocaleString()} |`,
    )
    .join('\n');

  // Put the evidence where the decision is made. A link to an artifact ZIP is
  // not a visual review: it makes the reviewer download, unzip, and match file
  // names before they can answer whether the after is correct. The static
  // report is published beside the PR preview, and its first three deltas
  // render directly in the comment; the full report carries the rest + wipe UI.
  const evidence = imageBase
    ? verdict.changes
        .slice(0, 3)
        .map(change => {
          const key = encodeURIComponent(String(change.key ?? ''));
          if (!key) return '';
          const label = `${inline(change.component || change.title)} — ${inline(change.name)} — ${inline(change.theme)} ${inline(change.mode)}`;
          return `
<details open>
<summary>${label}</summary>
<table>
<tr><th>Before</th><th>After</th><th>Diff</th></tr>
<tr>
<td><img src="${imageBase}before/${key}.png" width="300" alt="Before visual regression frame"></td>
<td><img src="${imageBase}after/${key}.png" width="300" alt="After visual regression frame"></td>
<td><img src="${imageBase}diff/${key}.png" width="300" alt="Pixel difference frame"></td>
</tr>
</table>
</details>`;
        })
        .filter(Boolean)
        .join('\n')
    : '';
  const more =
    verdict.changes.length > 20
      ? `\n\n_and ${verdict.changes.length - 20} more._`
      : '';

  return `### Visual Regression

**${verdict.changes.length} of ${num(verdict.counts?.total)} shot(s) changed.**${link}

A change here is a question, not a failure: check whether the *after* is the
picture you intended. Record that review on the PR. Baseline maintenance is an
explicit dispatch of CI; this report never rewrites the baseline or adds a release gate.

| component | story | theme | mode | pixels |
|---|---|---|---|---|
${rows}${more}

${evidence}

`;
}

module.exports = {buildVisualSection};
