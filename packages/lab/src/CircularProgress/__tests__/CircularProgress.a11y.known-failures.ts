// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircularProgress.a11y.known-failures.ts
 * @input The exact progressbar-contract failures the shipped CircularProgress produces today
 * @output CIRCULAR_PROGRESS_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the CircularProgress binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

/**
 * From Chromium 151.0.7889.0 the DevTools accessibility domain reports no
 * `aria-valuetext` for a range control: Chromium moved the value text to a
 * new accessibility attribute that the domain does not read yet. CircularProgress
 * still renders the value text, and `progressbar.value.text-attribute`
 * checks it on every engine.
 */
const VALUE_TEXT_RECORD = {
  expectation: 'progressbar.value.text-exposed',
  binding: 'CircularProgress',
  evidenceLayer: 'accessibility-tree',
  standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
  userImpact:
    'None for screen-reader users: the platform accessibility API still carries the value text on these builds. Only the DevTools accessibility tree this check reads omits it, so the check cannot confirm the spoken value there.',
  reason:
    'An engine change, not CircularProgress: the component renders aria-valuetext, and progressbar.value.text-attribute checks it on every engine. The fix belongs to Chromium.',
  engine: {harness: 'chromium', fromVersion: '151.0.7889.0'},
} as const;

export const CIRCULAR_PROGRESS_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = (
  [
    ['determinate', '40%'],
    ['formatted', '3 of 10'],
    ['label-visible', '40%'],
    ['center-content', '75%'],
  ] as const
).map(([state, text]) => ({
  ...VALUE_TEXT_RECORD,
  state,
  failureEquals: `the browser exposes no value text, not the binding’s formatted ${JSON.stringify(text)}`,
}));
