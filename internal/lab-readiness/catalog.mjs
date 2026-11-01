// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file catalog.mjs
 * @description The lab graduation rubric: the five lifecycle stages and the 30
 *   checks a lab component must pass before it can be promoted into
 *   `@astryxdesign/core`. This is the schema the Storybook readiness panel and
 *   `apps/storybook/.lab-readiness/latest.json` are built against.
 * @input none — static data
 * @output STAGE_DEFINITIONS, CHECK_CATALOG, SCHEMA_VERSION, REPORT_KIND, and
 *   lookup helpers
 * @position Shared vocabulary for the readiness tooling. `automated.mjs`
 *   derives the checks it can prove from the repo; `manifest.mjs` declares the
 *   rest; `audit.mjs` merges and scores them against this catalog.
 *
 * A check belongs to exactly one stage and one section. Sections exist so the
 * hardening stage can separate what a machine proved (`automatedAudit`) from
 * what a person had to fix by hand (`objectiveFixes`) and from what only a
 * person can sign off (`humanReview`).
 *
 * SYNC: When adding or renaming a check, bump SCHEMA_VERSION and update the
 * Storybook readiness panel that reads the emitted report.
 */

export const SCHEMA_VERSION = 1;
export const REPORT_KIND = 'astryx-lab-readiness-report';

const SPEC_PROTOCOL =
  'https://github.com/meta/astryx/wiki/Component-Specification-Protocol';
const BUILD_PROTOCOL =
  'https://github.com/meta/astryx/wiki/Component-Build-Protocol';
const HARDEN_PROTOCOL =
  'https://github.com/meta/astryx/wiki/Component-Hardening-Protocol';

/** @typedef {'not_started' | 'in_progress' | 'passed' | 'blocked'} CheckState */

export const STAGE_DEFINITIONS = [
  {key: 'research', label: 'Research'},
  {key: 'spec', label: 'Spec'},
  {key: 'build', label: 'Build'},
  {key: 'hardenChecks', label: 'Harden checks'},
  {key: 'hardenReview', label: 'Harden review'},
];

/**
 * Terse per-stage metadata so a check entry only has to name its stage and
 * section rather than repeat the labels and protocol URL.
 */
const STAGE_META = {
  research: {
    label: 'Research',
    protocolUrl: SPEC_PROTOCOL,
    sections: {research: 'Research'},
  },
  spec: {
    label: 'Spec',
    protocolUrl: SPEC_PROTOCOL,
    sections: {spec: 'Specification'},
  },
  build: {
    label: 'Build',
    protocolUrl: BUILD_PROTOCOL,
    sections: {build: 'Build'},
  },
  hardenChecks: {
    label: 'Harden checks',
    protocolUrl: HARDEN_PROTOCOL,
    sections: {
      automatedAudit: 'Automated audit',
      objectiveFixes: 'Objective fixes',
    },
  },
  hardenReview: {
    label: 'Harden review',
    protocolUrl: HARDEN_PROTOCOL,
    sections: {humanReview: 'Human review'},
  },
};

/**
 * `[stageKey, sectionKey, key, label, description]`. Order is the order the
 * readiness panel renders them in, and it is also lifecycle order.
 */
const CHECKS = [
  ['research', 'research', 'triage', 'Triage',
    'A named owner has confirmed the problem and scope.'],
  ['research', 'research', 'internalResearch', 'Internal research',
    'Existing Astryx and internal patterns have been audited.'],
  ['research', 'research', 'externalResearch', 'External research',
    'Relevant design-system and web precedents have been compared.'],
  ['research', 'research', 'useCases', 'Use cases',
    'Primary use cases, non-goals, and constraints are documented.'],

  ['spec', 'spec', 'draftSpec', 'Draft spec',
    'An RFC describes the component contract and intended behavior.'],
  ['spec', 'spec', 'surfaceAudit', 'Surface audit',
    'Composition, naming, variants, states, and tokens are enumerated.'],
  ['spec', 'spec', 'specReview', 'Spec review',
    'Design and engineering reviewers have resolved blocking feedback.'],
  ['spec', 'spec', 'apiArbitration', 'API arbitration',
    'Competing APIs were evaluated when the choice was non-obvious.'],
  ['spec', 'spec', 'finalizedSpec', 'Finalized spec',
    'The accepted contract is recorded as the build baseline.'],

  ['build', 'build', 'implementation', 'Implementation',
    'The component implements the agreed public contract.'],
  ['build', 'build', 'systemIntegration', 'System integration',
    'Tokens, themes, composition, and shared primitives are integrated.'],
  ['build', 'build', 'stories', 'Stories',
    'Storybook demonstrates representative states and composition.'],
  ['build', 'build', 'tests', 'Tests',
    'Focused behavioral and contract tests cover the implementation.'],
  ['build', 'build', 'documentation', 'Documentation',
    'The public API, usage, and important constraints are documented.'],
  ['build', 'build', 'reviewAndCI', 'Review and CI',
    'Code review and required automated checks are complete.'],
  ['build', 'build', 'mergedPR', 'Merged PR',
    'The build is merged into the lab package.'],

  ['hardenChecks', 'automatedAudit', 'tokensTheming', 'Tokens and theming',
    'Token usage and theme integration pass the automated audit.'],
  ['hardenChecks', 'automatedAudit', 'reuseNaming', 'Reuse and naming',
    'Existing primitives are reused and public names follow conventions.'],
  ['hardenChecks', 'automatedAudit', 'structureTypes', 'Structure and types',
    'File structure, exports, and TypeScript contracts pass inspection.'],
  ['hardenChecks', 'automatedAudit', 'accessibilityContracts',
    'Accessibility contracts',
    'Static and automated accessibility requirements pass.'],
  ['hardenChecks', 'automatedAudit', 'exportsAuditCI', 'Exports and CI',
    'Public exports, builds, tests, and required CI checks are green.'],

  ['hardenChecks', 'objectiveFixes', 'stateCoverage', 'State coverage',
    'All supported interaction and semantic states are covered.'],
  ['hardenChecks', 'objectiveFixes', 'visualThemes', 'Visual themes',
    'Light, dark, and nested-theme rendering is verified.'],
  ['hardenChecks', 'objectiveFixes', 'keyboardAccessibility',
    'Keyboard and accessibility',
    'Keyboard, focus, semantics, naming, and contrast are verified.'],
  ['hardenChecks', 'objectiveFixes', 'edgeCases', 'Edge cases',
    'Empty, overflow, loading, disabled, and stress cases are resolved.'],
  ['hardenChecks', 'objectiveFixes', 'storyCompleteness', 'Story completeness',
    'Stories make the completed state and edge-case matrix reviewable.'],

  ['hardenReview', 'humanReview', 'visualQuality', 'Visual quality',
    'A human reviewer has approved polish and visual consistency.'],
  ['hardenReview', 'humanReview', 'compositionQuality', 'Composition quality',
    'Real compositions confirm the API works beyond isolated demos.'],
  ['hardenReview', 'humanReview', 'scopeBoundary', 'Scope boundary',
    'The component\u2019s responsibilities and non-goals remain coherent.'],
  ['hardenReview', 'humanReview', 'archivedReview', 'Archived review',
    'The final checklist, decision, and follow-ups are linked.'],
];

export const CHECK_CATALOG = CHECKS.map(
  ([stageKey, sectionKey, key, label, description]) => {
    const stage = STAGE_META[stageKey];
    return {
      key,
      label,
      description,
      stageKey,
      stageLabel: stage.label,
      sectionKey,
      sectionLabel: stage.sections[sectionKey],
      protocolUrl: stage.protocolUrl,
      humanReview: stageKey === 'hardenReview',
    };
  },
);

const BY_KEY = new Map(CHECK_CATALOG.map(check => [check.key, check]));

/** Every check key, in lifecycle order. */
export const CHECK_KEYS = CHECK_CATALOG.map(check => check.key);

/** Check keys a human must sign off — no automation may propose these. */
export const HUMAN_REVIEW_KEYS = CHECK_CATALOG.filter(c => c.humanReview).map(
  c => c.key,
);

/** @param {string} key */
export function getCheck(key) {
  const check = BY_KEY.get(key);
  if (!check) throw new Error(`Unknown readiness check: ${key}`);
  return check;
}

/** A check counts toward a passing grade only in the `passed` state. */
export const PASSING_STATE = 'passed';

/** @type {readonly CheckState[]} */
export const CHECK_STATES = ['not_started', 'in_progress', 'passed', 'blocked'];
