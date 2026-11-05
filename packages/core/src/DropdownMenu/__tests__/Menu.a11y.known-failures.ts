// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Menu.a11y.known-failures.ts
 * @input The exact menu-contract failures the shipped DropdownMenu produces today
 * @output MENU_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the DropdownMenu menu-surface binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const MENU_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'menu.keys.enter-activates-and-closes',
    binding: 'DropdownMenu.menu',
    state: 'dropdown-selectable-checkbox-row',
    evidenceLayer: 'real-browser',
    failureEquals: 'Enter on an item left the menu displayed',
    standardsReference:
      'APG Menu and Menubar, Enter: "Otherwise, activates the item and closes the menu" (adopted as a required part by spec:AST-020 FR15); WCAG 2.2 2.1.1 Keyboard',
    userImpact:
      'A keyboard user who presses Enter on a checkbox row toggles it but stays in the open menu, where the pattern says Enter chooses and closes; Escape or Tab is needed to get back to the page.',
    reason:
      'DropdownMenuCheckboxItem keeps the menu open by default (hasCloseOnSelect is false), shipped as released behavior under component:DropdownMenu FR16. Whether Enter on a checkbox row closes the menu, or the component record names staying open as an exception, is a behavior decision for the component owner; this test-only binding records it and changes nothing.',
  },
];
