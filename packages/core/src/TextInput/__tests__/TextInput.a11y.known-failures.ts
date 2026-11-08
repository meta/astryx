// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInput.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output TEXT_INPUT_KNOWN_FAILURES — exact public-safe historical failures
 * @position Runnable migration debt under AST-021 FR8–FR10.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

const ERROR_WITHOUT_TEXT =
  'the binding declares this text control invalid but supplies no textual error description';

export const TEXT_INPUT_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'text-input.error.identified-in-text',
    binding: 'TextInput',
    state: 'input-error-without-message',
    evidenceLayer: 'dom',
    failureEquals: ERROR_WITHOUT_TEXT,
    standardsReference: 'WCAG 2.2 3.3.1 Error Identification (Level A)',
    userImpact:
      'A person receives an invalid field state with only visual styling and an icon; no text identifies what is wrong.',
    reason:
      'TextInput permits an error status without a message. This migration records the existing failure without changing component behavior.',
  },
  {
    expectation: 'text-input.error.identified-in-text',
    binding: 'TextArea',
    state: 'textarea-error-without-message',
    evidenceLayer: 'dom',
    failureEquals: ERROR_WITHOUT_TEXT,
    standardsReference: 'WCAG 2.2 3.3.1 Error Identification (Level A)',
    userImpact:
      'A person receives an invalid field state with only visual styling and an icon; no text identifies what is wrong.',
    reason:
      'TextArea permits an error status without a message. This migration records the existing failure without changing component behavior.',
  },
];
