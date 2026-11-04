// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spinbutton.known-failures.ts
 * @input Uses KnownFailure from the shared accessibility-spec runner
 * @output SPINBUTTON_FIXTURE_KNOWN_FAILURES — exact public-safe fixture debt
 * @position AST-021 FR8–FR10 records for outcomes a real browser still fails.
 */

import type {KnownFailure} from '../check';

export const SPINBUTTON_FIXTURE_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'spinbutton.readonly.exposed',
    binding: 'fixture',
    state: 'conforming-readonly',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the binding declares this spinbutton read-only, but the browser does not expose read-only state',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact:
      'An accessibility consumer encounters a read-only spinbutton without a programmatically exposed read-only state and may expect that its value can still be edited.',
    reason:
      'Chromium 149 omits the read-only accessibility-tree property for a spinbutton that carries both native readonly and aria-readonly. This record preserves the required outcome as visible debt without weakening the contract.',
  },
];
