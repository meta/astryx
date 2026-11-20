// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-baseline.js
 * @input An a11y report (the JSON written by accessibility-audit.js) and a
 *   checked-in baseline file (.github/a11y-baseline.json)
 * @output Pure diff logic for the accessibility CI gate: which violations are
 *   NEW (not in the baseline, fail the build), which baseline entries are
 *   RESOLVED (can be removed), plus baseline (re)generation and a readable
 *   failure summary.
 * @position Shared by accessibility-audit.js (--baseline / --fail-on-new /
 *   --update-baseline). Kept free of Playwright/axe so it can be unit-tested
 *   without a browser (see a11y-baseline.test.mjs).
 *
 * Key design: `package/Component::story-id::rule-id` for current reports,
 * with safe matching and migration of legacy `Component::Story::rule-id` keys.
 *   - Component + story + axe rule id is stable across unrelated DOM churn:
 *     axe rule ids are versioned and stable, and story names only change when
 *     someone renames a story (an intentional act).
 *   - Node target selectors / HTML snippets are deliberately EXCLUDED from the
 *     key — they change whenever markup shifts for unrelated reasons, which
 *     would make baseline entries silently stop matching and re-fail the
 *     build on cosmetic refactors.
 *   - Tradeoff: if a story already violates a rule (baselined) and a change
 *     adds MORE nodes violating the same rule in the same story, the gate
 *     will not catch it. That is acceptable — the goal is to stop new rule
 *     regressions while keeping the gate churn-proof.
 */

const BASELINE_VERSION = 1;

/** Build the stable prefix for one audited component story. */
function storyKey(component, story) {
  return `${component}::${story}`;
}

/** Build the stable baseline key for one violation occurrence. */
function violationKey(component, story, ruleId) {
  return `${storyKey(component, story)}::${ruleId}`;
}

function violationIdentities(report, component, story, storyId) {
  const legacyStoryKey = storyKey(component, story);
  const auditedStories = Array.isArray(report?.auditedStories)
    ? report.auditedStories
    : [];
  const owners = storyId
    ? auditedStories.filter(entry => entry.storyId === storyId)
    : [];
  if (owners.length === 0) {
    return [
      {
        keyPrefix: legacyStoryKey,
        legacyKeyPrefix: legacyStoryKey,
        component,
        story,
      },
    ];
  }
  return owners.map(entry => ({
    keyPrefix: storyKey(entry.owner, entry.storyId),
    legacyKeyPrefix: entry.legacyStoryKey || legacyStoryKey,
    component: entry.owner,
    story: entry.storyId,
  }));
}

/**
 * Flatten an a11y report into one entry per (component, story, rule)
 * occurrence, deduped by key.
 *
 * Prefers the per-story `storyDetails` shape (raw axe violations per story);
 * falls back to the aggregated `violations` shape (which carries a `stories`
 * list per rule) for older reports.
 *
 * @param {object} report - report object with `.components`
 * @returns {Array<{key: string, component: string, story: string,
 *   ruleId: string, impact: string, help: string, helpUrl: string,
 *   nodes: number}>}
 */
function collectViolations(report) {
  const occurrences = [];
  const components = (report && report.components) || {};

  for (const [component, result] of Object.entries(components)) {
    const storyDetails = Array.isArray(result.storyDetails)
      ? result.storyDetails
      : [];

    if (storyDetails.length > 0) {
      for (const storyResult of storyDetails) {
        for (const violation of storyResult.violations || []) {
          for (const identity of violationIdentities(
            report,
            component,
            storyResult.story,
            storyResult.storyId,
          )) {
            occurrences.push({
              key: `${identity.keyPrefix}::${violation.id}`,
              legacyKey: `${identity.legacyKeyPrefix}::${violation.id}`,
              component: identity.component,
              story: identity.story,
              ruleId: violation.id,
              impact: violation.impact || 'unknown',
              help: violation.help || violation.description || '',
              helpUrl: violation.helpUrl || '',
              nodes: (violation.nodes || []).length,
            });
          }
        }
      }
    } else {
      // Aggregated-only shape: one occurrence per (rule, story) pair.
      for (const violation of result.violations || []) {
        const stories =
          Array.isArray(violation.stories) && violation.stories.length > 0
            ? violation.stories
            : ['*'];
        for (const story of stories) {
          const key = violationKey(component, story, violation.id);
          occurrences.push({
            key,
            legacyKey: key,
            component,
            story,
            ruleId: violation.id,
            impact: violation.impact || 'unknown',
            help: violation.help || violation.description || '',
            helpUrl: violation.helpUrl || '',
            nodes: violation.totalNodes || 0,
          });
        }
      }
    }
  }

  // Dedupe by key (a story name should be unique within a component, but be
  // defensive), merging node counts.
  const byKey = new Map();
  for (const occurrence of occurrences) {
    const existing = byKey.get(occurrence.key);
    if (existing) {
      existing.nodes += occurrence.nodes;
    } else {
      byKey.set(occurrence.key, {...occurrence});
    }
  }
  return Array.from(byKey.values());
}

/** Normalize baseline entries (objects or bare key strings) to a key Set. */
function baselineKeySet(baseline) {
  const entries = (baseline && baseline.entries) || [];
  return new Set(
    entries
      .map(entry => (typeof entry === 'string' ? entry : entry && entry.key))
      .filter(Boolean),
  );
}

function canonicalPackage(canonicalStoryKey) {
  const owner = canonicalStoryKey.split('::')[0];
  return owner.includes('/') ? owner.split('/')[0] : null;
}

function hasOnePackage(owners) {
  const packages = new Set(owners.map(canonicalPackage).filter(Boolean));
  return packages.size === 1;
}

function auditedScope(report) {
  if (Array.isArray(report?.auditedStories)) {
    const canonicalStoryKeys = new Set(
      report.auditedStories.map(entry => storyKey(entry.owner, entry.storyId)),
    );
    const exactLegacyStoryKeys = Object.entries(report.legacyStoryOwners || {})
      .filter(
        ([, owners]) =>
          Array.isArray(owners) &&
          owners.length === 1 &&
          canonicalStoryKeys.has(owners[0]),
      )
      .map(([legacyStory]) => legacyStory);
    const migratedLegacyStoryKeys = Object.entries(
      report.legacyBaselineAliases || {},
    )
      .filter(
        ([, owners]) =>
          Array.isArray(owners) &&
          owners.length > 0 &&
          hasOnePackage(owners) &&
          owners.every(ownerStory => canonicalStoryKeys.has(ownerStory)),
      )
      .map(([legacyStory]) => legacyStory);
    return {
      canonicalStoryKeys,
      legacyStoryKeys: new Set([
        ...exactLegacyStoryKeys,
        ...migratedLegacyStoryKeys,
      ]),
      components: null,
    };
  }
  if (Array.isArray(report?.auditedStoryKeys)) {
    return {
      canonicalStoryKeys: new Set(),
      legacyStoryKeys: new Set(report.auditedStoryKeys),
      components: null,
    };
  }
  return {
    canonicalStoryKeys: null,
    legacyStoryKeys: null,
    components: new Set(Object.keys(report?.components || {})),
  };
}

function baselineKeyWasAudited(key, scope) {
  if (scope.canonicalStoryKeys != null) {
    const keyParts = key.split('::');
    const auditedStories = keyParts[0].includes('/')
      ? scope.canonicalStoryKeys
      : scope.legacyStoryKeys;
    return auditedStories.has(keyParts.slice(0, 2).join('::'));
  }
  return scope.components.has(key.split('::')[0]);
}

function safeLegacyAliases(occurrence, report) {
  const aliases = new Set();
  if (!occurrence.legacyKey) return aliases;
  if (occurrence.legacyKey === occurrence.key) {
    aliases.add(occurrence.legacyKey);
    return aliases;
  }

  const legacyStory = occurrence.legacyKey.split('::').slice(0, 2).join('::');
  const canonicalStory = occurrence.key.split('::').slice(0, 2).join('::');
  const exactOwners = report?.legacyStoryOwners?.[legacyStory];
  if (
    Array.isArray(exactOwners) &&
    exactOwners.length === 1 &&
    exactOwners[0] === canonicalStory
  ) {
    aliases.add(occurrence.legacyKey);
  }

  for (const [migratedLegacyStory, owners] of Object.entries(
    report?.legacyBaselineAliases || {},
  )) {
    if (
      Array.isArray(owners) &&
      owners.includes(canonicalStory) &&
      hasOnePackage(owners) &&
      canonicalPackage(canonicalStory) === canonicalPackage(owners[0])
    ) {
      aliases.add(`${migratedLegacyStory}::${occurrence.ruleId}`);
    }
  }
  return aliases;
}

/**
 * Build a baseline object from a report (for --update-baseline).
 *
 * The audit is often scoped with --components, so the report only covers a
 * subset of the library. Entries in `existing` whose exact component/story was
 * not audited in this report are preserved; entries for audited stories are
 * replaced by the report's current violations.
 *
 * @param {object} report
 * @param {{existing?: object|null, now?: Date}} [options]
 */
function buildBaseline(report, {existing = null, now = new Date()} = {}) {
  const scope = auditedScope(report);
  const preserved = ((existing && existing.entries) || [])
    .map(entry => (typeof entry === 'string' ? {key: entry} : entry))
    .filter(
      entry => entry && entry.key && !baselineKeyWasAudited(entry.key, scope),
    );
  const fresh = collectViolations(report).map(v => ({
    key: v.key,
    impact: v.impact,
    helpUrl: v.helpUrl,
  }));

  return {
    $comment:
      'Known axe violations tolerated by the pr-a11y CI gate. Entries are ' +
      'keyed package/component::story-id::rule-id; legacy ' +
      'Component::Story::rule-id entries are preserved until their exact ' +
      'story can be migrated. Regenerate with `pnpm a11y:baseline` ' +
      '(requires a built Storybook + Playwright chromium). Remove entries ' +
      'as violations are fixed.',
    version: BASELINE_VERSION,
    generatedAt: now.toISOString(),
    entries: [...preserved, ...fresh].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    ),
  };
}

/**
 * Diff a report against a baseline.
 *
 * Anything in the report but missing from the baseline is NEW (a missing or
 * empty baseline means every violation is new). Baseline entries with no
 * matching violation are RESOLVED and can be deleted from the baseline — but
 * only for exact component/story keys actually audited in this run. Entries
 * outside the audited story set are `unchecked`, not resolved.
 *
 * @param {object} report
 * @param {object|null|undefined} baseline
 * @returns {{newViolations: Array<object>, resolved: string[],
 *   unchecked: string[], matched: number}}
 */
function diffAgainstBaseline(report, baseline) {
  const current = collectViolations(report);
  const known = baselineKeySet(baseline);
  const currentKeys = new Set();
  const newViolations = [];
  for (const occurrence of current) {
    currentKeys.add(occurrence.key);
    const legacyAliases = safeLegacyAliases(occurrence, report);
    for (const alias of legacyAliases) currentKeys.add(alias);
    if (
      !known.has(occurrence.key) &&
      ![...legacyAliases].some(alias => known.has(alias))
    ) {
      newViolations.push(occurrence);
    }
  }
  const scope = auditedScope(report);

  const resolved = [];
  const unchecked = [];
  for (const key of Array.from(known).sort()) {
    if (currentKeys.has(key)) continue;
    if (baselineKeyWasAudited(key, scope)) {
      resolved.push(key);
    } else {
      unchecked.push(key);
    }
  }

  return {
    newViolations,
    resolved,
    unchecked,
    matched: current.length - newViolations.length,
  };
}

/**
 * Render a human-readable gate summary for CI logs.
 *
 * @param {{newViolations: Array<object>, resolved: string[],
 *   unchecked?: string[], matched: number}} diff
 * @param {{baselinePath?: string}} [options]
 * @returns {string}
 */
function formatDiffSummary(
  diff,
  {baselinePath = '.github/a11y-baseline.json'} = {},
) {
  const lines = [];
  lines.push('');
  lines.push('=== Accessibility baseline gate ===');
  const unchecked = diff.unchecked || [];
  lines.push(
    `${diff.newViolations.length} new, ${diff.matched} baselined, ` +
      `${diff.resolved.length} resolved` +
      (unchecked.length > 0
        ? `, ${unchecked.length} baselined for stories outside this run`
        : ''),
  );

  if (diff.newViolations.length > 0) {
    lines.push('');
    lines.push('NEW violations (not in baseline — these fail the build):');
    for (const v of diff.newViolations) {
      lines.push(
        `  ✗ [${v.impact}] ${v.ruleId} — ${v.component} / ${v.story}` +
          (v.nodes ? ` (${v.nodes} node${v.nodes === 1 ? '' : 's'})` : ''),
      );
      if (v.help) lines.push(`      ${v.help}`);
      if (v.helpUrl) lines.push(`      ${v.helpUrl}`);
    }
    lines.push('');
    lines.push('To reproduce locally:');
    lines.push('  pnpm storybook:build && npx playwright install chromium');
    lines.push('  pnpm a11y:audit -- --components <Component>');
    lines.push('');
    lines.push('Fix the violation if at all possible. If it is a known,');
    lines.push('intentional exception, add it to the baseline:');
    lines.push('  pnpm a11y:baseline -- --components <Component>');
    lines.push(
      `  (or hand-add the key to ${baselinePath} with a reviewer's blessing)`,
    );
  }

  if (diff.resolved.length > 0) {
    lines.push('');
    lines.push(
      'Resolved — these baseline entries no longer occur and can be removed ' +
        `from ${baselinePath}:`,
    );
    for (const key of diff.resolved) {
      lines.push(`  ✓ ${key}`);
    }
  }

  if (diff.newViolations.length === 0) {
    lines.push('');
    lines.push('No new accessibility violations. Gate passed.');
  }

  return lines.join('\n');
}

/**
 * Render a GitHub Actions warning when baseline entries no longer occur, so a
 * stale entry shows on the run's summary page and is not only in the log. A
 * stale entry can mask a returning violation of the same kind. It never fails
 * the gate.
 *
 * @param {{resolved: string[]}} diff
 * @param {{baselinePath?: string}} [options]
 * @returns {string} The workflow command, or '' when nothing resolved.
 */
function formatResolvedWarning(
  diff,
  {baselinePath = '.github/a11y-baseline.json'} = {},
) {
  const count = diff.resolved.length;
  if (count === 0) return '';
  const what =
    count === 1
      ? '1 baseline entry no longer occurs; remove it'
      : `${count} baseline entries no longer occur; remove them`;
  return (
    `::warning title=Resolved accessibility baseline entries::${what} ` +
    `from ${baselinePath}. The keys are in this step's log.`
  );
}

module.exports = {
  BASELINE_VERSION,
  storyKey,
  violationKey,
  collectViolations,
  baselineKeySet,
  buildBaseline,
  diffAgainstBaseline,
  formatDiffSummary,
  formatResolvedWarning,
};
