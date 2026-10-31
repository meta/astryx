// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared a11y formatting utilities for PR enrichment.
 * Used by generate-pr-comment.js and test-pr-enrichment.js.
 */

const {inline, num, safeUrl} = require('./report-text');

// Impact emoji badges
const impactEmoji = {
  critical: '🔴',
  serious: '🟠',
  moderate: '🟡',
  minor: '⚪',
};

/**
 * Extract WCAG success criteria from axe tags (e.g., 'wcag412' → '4.1.2', 'wcag1411' → '1.4.11')
 * WCAG criteria follow X.Y.Z format where Z can be multi-digit.
 */
function formatWcagTags(tags) {
  if (!tags || !Array.isArray(tags)) return '';
  const wcagCriteria = tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => {
      const nums = t.replace('wcag', '');
      return `${nums[0]}.${nums[1]}.${nums.slice(2)}`;
    });
  const level = tags.find((t) => ['wcag2a', 'wcag2aa', 'wcag2aaa'].includes(t));
  const levelStr = level
    ? ` (Level ${level.replace('wcag2', '').toUpperCase()})`
    : '';
  return wcagCriteria.length > 0
    ? `WCAG: ${wcagCriteria.join(', ')}${levelStr}`
    : '';
}

/**
 * Build the full accessibility section markdown from an a11y report.
 * @param {object} a11yReport - The a11y report object with .components
 * @param {object} [storiesAuditedByComponent] - Optional map of component name → storiesAudited count
 * @returns {string} Markdown string for the a11y section
 */
function buildA11ySection(a11yReport, storiesAuditedByComponent) {
  let a11ySection = '### Accessibility Audit\n\n';
  // No report: the audit did not run (pull requests run it only with the
  // `ci:heavy-lanes` label, spec:AST-030 FR12). Never claim a clean result.
  if (!a11yReport) {
    return a11ySection + '**Status:** The accessibility audit did not run on this pull request. It runs after merges to `main` and before each release; pull requests that touch components run it with the `ci:heavy-lanes` label.\n\n';
  }
  const totalViolations = Object.values(a11yReport.components || {})
    .reduce((sum, comp) => sum + (comp.violations?.length || 0), 0);

  if (totalViolations === 0) {
    a11ySection += '**Status:** No accessibility violations detected.\n\n';
    return a11ySection;
  }

  // Build impact breakdown for summary line
  const impactCounts = {};
  for (const compReport of Object.values(a11yReport.components || {})) {
    for (const v of compReport.violations || []) {
      if (v.impact) {
        impactCounts[v.impact] = (impactCounts[v.impact] || 0) + 1;
      }
    }
  }
  const impactBreakdown = ['critical', 'serious', 'moderate', 'minor']
    .filter((level) => impactCounts[level])
    .map((level) => `${impactCounts[level]} ${level}`)
    .join(', ');
  const breakdownStr = impactBreakdown ? ` — ${impactBreakdown}` : '';

  a11ySection += `**Status:** ${totalViolations} accessibility violation(s) found${breakdownStr}.\n\n`;

  for (const [compName, compReport] of Object.entries(a11yReport.components || {})) {
    if (compReport.violations?.length > 0) {
      // Report fields are display data — render them as literal inline text
      // (rule ids down to their own alphabet, counts as numbers, the help URL
      // only when it is a plain https URL). See report-text.js.
      a11ySection += `<details>\n<summary><strong>${inline(compName)}</strong> - ${compReport.violations.length} issue(s)</summary>\n\n`;
      for (const violation of compReport.violations) {
        const emoji = impactEmoji[violation.impact] || '';
        const prefix = emoji ? `${emoji} ` : '';
        a11ySection += `- ${prefix}**${inline(violation.impact)}**: ${inline(violation.description)}\n`;

        // Build detail line: Rule · story count · learn more. Axe rule ids
        // are lowercase-alphanumeric-with-dashes; anything else has no
        // business inside the code span.
        const ruleId = String(violation.id ?? '').replace(/[^\w-]/g, '');
        const detailParts = [`Rule: \`${ruleId}\``];

        if (violation.storyCount != null && compReport.storiesAudited) {
          detailParts.push(
            `Affects ${num(violation.storyCount)}/${num(compReport.storiesAudited)} stories`
          );
        }

        const helpUrl = safeUrl(violation.helpUrl);
        if (helpUrl) {
          detailParts.push(
            `[Learn more](${helpUrl})`
          );
        }

        a11ySection += `  - ${detailParts.join(' · ')}\n`;

        // Show WCAG tags if available
        const wcagStr = formatWcagTags(violation.tags);
        if (wcagStr) {
          a11ySection += `  - ${wcagStr}\n`;
        }
      }
      a11ySection += `\n</details>\n\n`;
    }
  }

  return a11ySection;
}

module.exports = { impactEmoji, formatWcagTags, buildA11ySection };
