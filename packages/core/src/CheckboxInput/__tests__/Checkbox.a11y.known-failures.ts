// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Checkbox.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output CHECKBOX_KNOWN_FAILURES — exact, runnable existing gaps discovered by
 *   the Checkbox pattern migration.
 * @position Exact public-safe known-failure records under AST-021 FR8–FR10;
 *   operational gap ownership stays outside public source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const CHECKBOX_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'checkbox.readonly.declared',
    binding: 'CheckboxInput',
    state: 'input-handlerless-read-only',
    evidenceLayer: 'dom',
    failureEquals:
      'this state is read-only, but the checkbox does not declare aria-readonly="true"',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact:
      'The browser exposes a controlled handlerless checkbox without a read-only declaration, so accessibility consumers cannot distinguish its static value from an editable setting.',
    reason:
      'CheckboxInput makes both onChange and changeAction optional. With neither handler, the controlled value cannot persist a user change, but the component does not declare the resulting read-only state.',
  },
  {
    expectation: 'checkbox.readonly.declared',
    binding: 'CheckboxListItem',
    state: 'list-item-handlerless-read-only',
    evidenceLayer: 'dom',
    failureEquals:
      'this state is read-only, but the checkbox does not declare aria-readonly="true"',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact:
      'The browser exposes a handlerless inert checkbox without a read-only declaration, so accessibility consumers cannot distinguish it from an editable control.',
    reason:
      'The public standalone API permits an item with isChecked and no onCheck. The row is inert, but CheckboxInput does not receive isReadOnly.',
  },
  {
    expectation: 'checkbox.disabled.exposed',
    binding: 'DropdownMenuCheckboxItem',
    state: 'menu-item-handlerless-inert',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the binding declares this state unavailable, but the browser reports the checkbox as available, so the user is invited to change something that will not change',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact:
      'The menu item looks available to accessibility consumers, but activation cannot change its controlled value because it has no handler.',
    reason:
      'DropdownMenuCheckboxItem makes onChange optional. Without it, the controlled value cannot persist a user change, but the role-bearing item remains exposed as available.',
  },
];
