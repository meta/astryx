// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NumberInput.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output NUMBER_INPUT_KNOWN_FAILURES — exact public-safe NumberInput debt
 * @position AST-021 FR8–FR10 records; operational ownership stays outside public source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const NUMBER_INPUT_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'spinbutton.readonly.exposed',
    binding: 'NumberInput',
    state: 'read-only',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the binding declares this spinbutton read-only, but the browser does not expose read-only state',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact:
      'An accessibility consumer encounters a read-only NumberInput without a programmatically exposed read-only state and may expect that its value can still be edited.',
    reason:
      'Chromium 149 omits the read-only accessibility-tree property for the native read-only text input promoted to spinbutton semantics. Adding aria-readonly produces the same tree, so this test-contract change records the existing behavior without changing the component.',
  },
];
