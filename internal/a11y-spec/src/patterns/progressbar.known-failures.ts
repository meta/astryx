// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file progressbar.known-failures.ts
 * @input Uses KnownFailure from the shared accessibility-spec runner
 * @output VALUE_TEXT_UNEXPOSED_ENGINE and PROGRESSBAR_FIXTURE_KNOWN_FAILURES —
 *   exact public-safe records for the fixtures an engine change fails
 * @position AST-021 FR8–FR10 records for the progressbar contract's own
 *   fixtures
 */

import type {KnownFailure, KnownFailureEngine} from '../check';

/**
 * From this Chromium build the DevTools accessibility domain reports no
 * `aria-valuetext` for a range control. Chromium moved the value text to a
 * new accessibility attribute ("Introduce kAriaValueText attribute for range
 * controls") and that domain does not read it yet.
 */
export const VALUE_TEXT_UNEXPOSED_ENGINE: KnownFailureEngine = {
  harness: 'chromium',
  fromVersion: '151.0.7889.0',
};

const VALUE_TEXT_RECORD = {
  expectation: 'progressbar.value.text-exposed',
  binding: 'fixture',
  evidenceLayer: 'accessibility-tree',
  standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
  userImpact:
    'None for screen-reader users: the platform accessibility API still carries the value text on these builds. Only the DevTools accessibility tree this check reads omits it, so the check cannot confirm the spoken value there.',
  reason:
    'An engine change, not the fixture: the markup carries aria-valuetext, and progressbar.value.text-attribute checks it on every engine. The fix belongs to Chromium.',
  engine: VALUE_TEXT_UNEXPOSED_ENGINE,
} as const;

export const PROGRESSBAR_FIXTURE_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = (
  [
    ['conforming-formatted', '3 GB / 5 GB'],
    ['conforming-complete', '100%'],
    ['conforming-focusable-mark-beside', '50%'],
  ] as const
).map(([state, text]) => ({
  ...VALUE_TEXT_RECORD,
  state,
  failureEquals: `the browser exposes no value text, not the binding’s formatted ${JSON.stringify(text)}`,
}));
