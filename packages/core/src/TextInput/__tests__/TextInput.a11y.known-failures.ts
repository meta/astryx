// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInput.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output TEXT_INPUT_KNOWN_FAILURES — exact public-safe historical failures
 * @position Runnable migration debt under AST-021 FR8–FR10.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

const FALLBACK_NOT_VISIBLE =
  'the binding identifies the error as "Invalid value", but no visibly rendered aria-errormessage or aria-describedby target contains that text';

// An error without a message links a hidden translated fallback, so
// assistive technology hears the error; sighted users still see no text
// (component:TextInput AR4 gap, component:TextArea FR8 gap).
export const TEXT_INPUT_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'text-input.error.related-text-visible',
    binding: 'TextInput',
    state: 'input-error-without-message',
    evidenceLayer: 'real-browser',
    failureEquals: FALLBACK_NOT_VISIBLE,
    standardsReference: 'WCAG 2.2 3.3.1 Error Identification (Level A)',
    userImpact:
      'A sighted person sees an invalid field marked only by colour and an icon; no visible text says what is wrong. Assistive technology hears the fallback text.',
    reason:
      'TextInput permits an error status without a message. Visible default error text is pending the input-fields FR16 proposal.',
  },
  {
    expectation: 'text-input.error.related-text-visible',
    binding: 'TextArea',
    state: 'textarea-error-without-message',
    evidenceLayer: 'real-browser',
    failureEquals: FALLBACK_NOT_VISIBLE,
    standardsReference: 'WCAG 2.2 3.3.1 Error Identification (Level A)',
    userImpact:
      'A sighted person sees an invalid field marked only by colour and an icon; no visible text says what is wrong. Assistive technology hears the fallback text.',
    reason:
      'TextArea permits an error status without a message. Visible default error text is pending the input-fields FR16 proposal.',
  },
];
