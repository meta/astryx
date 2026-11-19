// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Combobox.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Current public-safe Selector Combobox binding failures
 * @position AST-021 debt records; operational ownership remains outside public source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const SELECTOR_COMBOBOX_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'combobox.popup.relationship',
    binding: 'Selector.trigger',
    state: 'sheet-open',
    evidenceLayer: 'dom',
    failureEquals:
      'aria-controls does not reference the rendered combobox popup',
    standardsReference:
      'WAI-ARIA 1.2 combobox: aria-controls refers to the displayed popup element; WCAG 2.2 1.3.1 Info and Relationships (Level A)',
    userImpact:
      'On touch screens the trigger announces that it opens a dialog, but its controls relationship points past that dialog to the list inside it, so assistive technology that follows the relationship reaches the list without the sheet that hosts it.',
    reason:
      'The trigger declares the sheet dialog as its popup kind while aria-controls names the inner listbox. Pointing both at one popup changes Selector runtime semantics under AR1, which needs its own decision; this test-only binding records the gap.',
  },
];
