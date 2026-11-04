// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Checkbox.a11y.states.ts
 * @input Uses CheckboxStateFacts from @astryxdesign/a11y-spec
 * @output CHECKBOX_BINDING_STATES — the AST-021 inventory for every current
 *   checkbox-bearing Astryx part and every state that changes the shared pattern
 *   outcome — plus CHECKBOX_CALLEE_EXCLUSIONS for composed/decorative callsites
 *   that reuse an already-bound part without exposing another checkbox control.
 * @position Data-only binding inventory. JSX lives in Checkbox.a11y.renders.tsx
 *   so Playwright can import this file without loading component source.
 */

import type {CheckboxStateFacts} from '@astryxdesign/a11y-spec';

export type CheckboxBinding =
  | 'CheckboxInput'
  | 'CheckboxListItem'
  | 'DropdownMenuCheckboxItem'
  | 'SelectableCard';

export type CheckboxBindingRow = (typeof CHECKBOX_BINDING_STATES)[number];
export type CheckboxStateId = (typeof CHECKBOX_BINDING_STATES)[number]['id'];

export interface CheckboxBindingState {
  readonly id: string;
  readonly binding: CheckboxBinding;
  readonly summary: string;
  readonly facts: CheckboxStateFacts;
  readonly visibleLabel: string | null;
  readonly visibleLabelSelector?: string;
  readonly pointerTargetSelector?: string;
  readonly storyId: string;
  readonly opensMenu?: boolean;
  readonly declaredNotDelivered?: ReadonlyArray<{
    readonly fact:
      'description' | 'disabled' | 'focusable' | 'invalid' | 'readOnly';
    readonly owned: string;
  }>;
}

const DEFAULT_FACTS: CheckboxStateFacts = {
  role: 'checkbox',
  checked: false,
  operable: true,
  focusable: true,
  disabled: false,
  description: null,
  readOnly: false,
  required: false,
  invalid: false,
};

function facts(
  overrides: Partial<CheckboxStateFacts> = {},
): CheckboxStateFacts {
  return {...DEFAULT_FACTS, ...overrides};
}

const menuFacts = (
  overrides: Partial<CheckboxStateFacts> = {},
): CheckboxStateFacts =>
  facts({
    role: 'menuitemcheckbox',
    focusable: false,
    ...overrides,
  });

export const CHECKBOX_CALLEE_EXCLUSIONS = [
  {
    owner: 'Table selection',
    part: 'CheckboxInput',
    reason:
      'Table select-all and row selection compose the already-bound CheckboxInput part; Table owns selection labels and group context, while the shared input states cover hidden labels and mixed state.',
  },
  {
    owner: 'MultiSelector option decoration',
    part: 'CheckboxInput',
    reason:
      'MultiSelector renders its CheckboxInput inside an inert, aria-hidden marker; role="option" remains the only exposed selectable control and the decorative checkbox is outside this pattern inventory.',
  },
] as const;

export const CHECKBOX_BINDING_STATES = [
  {
    id: 'input-unchecked',
    binding: 'CheckboxInput',
    summary: 'the default unchecked checkbox with a visible label',
    facts: facts(),
    visibleLabel: 'Email notifications',
    storyId: 'a11y-checkbox-pattern--input-unchecked',
  },
  {
    id: 'input-checked',
    binding: 'CheckboxInput',
    summary: 'the same checkbox checked',
    facts: facts({checked: true}),
    visibleLabel: 'Email notifications',
    storyId: 'a11y-checkbox-pattern--input-checked',
  },
  {
    id: 'input-mixed',
    binding: 'CheckboxInput',
    summary: 'a tri-state select-all checkbox in its partially checked state',
    facts: facts({checked: 'mixed'}),
    visibleLabel: 'Select all notifications',
    storyId: 'a11y-checkbox-pattern--input-mixed',
  },
  {
    id: 'input-described',
    binding: 'CheckboxInput',
    summary: 'a checkbox with supporting text attached',
    facts: facts({description: 'Help improve the product'}),
    visibleLabel: 'Share usage data',
    storyId: 'a11y-checkbox-pattern--input-described',
  },
  {
    id: 'input-hidden-label',
    binding: 'CheckboxInput',
    summary: 'a checkbox named by a visually hidden associated label',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-checkbox-pattern--input-hidden-label',
  },
  {
    id: 'input-disabled',
    binding: 'CheckboxInput',
    summary: 'a disabled checkbox that keeps its tab stop',
    facts: facts({operable: false, focusable: true, disabled: true}),
    visibleLabel: 'Managed setting',
    storyId: 'a11y-checkbox-pattern--input-disabled',
  },
  {
    id: 'input-disabled-with-message',
    binding: 'CheckboxInput',
    summary:
      'an unavailable checkbox kept focusable so its attached reason remains reachable',
    facts: facts({
      operable: false,
      disabled: true,
      description: 'Managed by your administrator',
    }),
    visibleLabel: 'Managed setting',
    storyId: 'a11y-checkbox-pattern--input-disabled-with-message',
  },
  {
    id: 'input-loading',
    binding: 'CheckboxInput',
    summary: 'a busy checkbox that stays focusable but refuses another change',
    // Loading is inventoried because it changes operability. The public
    // isLoading -> aria-busy mapping remains in CheckboxInput.test.tsx under
    // AST-021 FR5: APG Checkbox adopts no busy state, and no current Astryx
    // record makes it a reusable checkbox-pattern requirement.
    facts: facts({operable: false}),
    visibleLabel: 'Email notifications',
    storyId: 'a11y-checkbox-pattern--input-loading',
  },
  {
    id: 'input-read-only',
    binding: 'CheckboxInput',
    summary: 'a read-only checkbox that stays focusable and cannot change',
    facts: facts({checked: true, operable: false, readOnly: true}),
    visibleLabel: 'Policy acknowledged',
    storyId: 'a11y-checkbox-pattern--input-read-only',
  },
  {
    id: 'input-handlerless-read-only',
    binding: 'CheckboxInput',
    summary:
      'a handlerless controlled checkbox that is inert but does not declare read-only semantics',
    facts: facts({checked: true, operable: false, readOnly: true}),
    visibleLabel: 'Policy acknowledged',
    storyId: 'a11y-checkbox-pattern--input-handlerless-read-only',
    declaredNotDelivered: [
      {fact: 'readOnly', owned: 'checkbox.readonly.declared'},
    ],
  },
  {
    id: 'input-required',
    binding: 'CheckboxInput',
    summary: 'a checkbox declared required',
    facts: facts({required: true, invalid: true}),
    visibleLabel: 'Accept terms',
    storyId: 'a11y-checkbox-pattern--input-required',
  },
  {
    id: 'input-inherited-required-valid',
    binding: 'CheckboxInput',
    summary:
      'an unchecked checkbox inheriting required semantics without native validation',
    facts: facts({required: true}),
    visibleLabel: 'Marketing consent',
    storyId: 'a11y-checkbox-pattern--input-inherited-required-valid',
  },
  {
    id: 'input-invalid',
    binding: 'CheckboxInput',
    summary: 'a checkbox whose current value is in error',
    facts: facts({
      invalid: true,
      description: 'You must accept the terms',
    }),
    visibleLabel: 'Accept terms',
    storyId: 'a11y-checkbox-pattern--input-invalid',
  },
  {
    id: 'input-warning',
    binding: 'CheckboxInput',
    summary: 'a valid checkbox with warning supporting text',
    facts: facts({description: 'This setting affects all workspaces'}),
    visibleLabel: 'Enable sharing',
    storyId: 'a11y-checkbox-pattern--input-warning',
  },
  {
    id: 'input-success',
    binding: 'CheckboxInput',
    summary: 'a valid checkbox with success supporting text',
    facts: facts({checked: true, description: 'Preference saved'}),
    visibleLabel: 'Email notifications',
    storyId: 'a11y-checkbox-pattern--input-success',
  },

  {
    id: 'list-item-unchecked',
    binding: 'CheckboxListItem',
    summary: 'a standalone checkbox list item',
    facts: facts(),
    visibleLabel: 'Email',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-unchecked',
  },
  {
    id: 'list-item-checked',
    binding: 'CheckboxListItem',
    summary: 'a checked item in a controlled CheckboxList collection',
    facts: facts({checked: true}),
    visibleLabel: 'Email',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-checked',
  },
  {
    id: 'list-item-mixed',
    binding: 'CheckboxListItem',
    summary: 'a standalone partially checked list item',
    facts: facts({checked: 'mixed'}),
    visibleLabel: 'Select all',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-mixed',
  },
  {
    id: 'list-item-described',
    binding: 'CheckboxListItem',
    summary: 'a list item with visible supporting text for the choice',
    facts: facts({description: 'Receive notifications by email'}),
    visibleLabel: 'Email',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-described',
  },
  {
    id: 'list-item-rich-label-visible-name',
    binding: 'CheckboxListItem',
    summary: 'a rich-label list item named from its visible text',
    facts: facts(),
    visibleLabel: 'Pro plan',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-rich-label-visible-name',
  },
  {
    id: 'list-item-disabled',
    binding: 'CheckboxListItem',
    summary: 'an individually disabled list item',
    facts: facts({operable: false, focusable: true, disabled: true}),
    visibleLabel: 'SMS',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-disabled',
  },
  {
    id: 'list-item-loading',
    binding: 'CheckboxListItem',
    summary: 'a busy list item that stays focusable but refuses another change',
    // The list row's aria-busy and spinner composition remain component-owned;
    // this pattern row covers the shared checkbox's changed operability.
    facts: facts({operable: false}),
    visibleLabel: 'Push notifications',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-loading',
  },
  {
    id: 'list-item-read-only',
    binding: 'CheckboxListItem',
    summary: 'a read-only list item that stays focusable and cannot change',
    facts: facts({checked: true, operable: false, readOnly: true}),
    visibleLabel: 'Email',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-read-only',
  },
  {
    id: 'list-item-handlerless-read-only',
    binding: 'CheckboxListItem',
    summary:
      'a standalone handlerless item that is inert but does not declare read-only semantics',
    facts: facts({checked: true, operable: false, readOnly: true}),
    visibleLabel: 'Completed task',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-handlerless-read-only',
    declaredNotDelivered: [
      {fact: 'readOnly', owned: 'checkbox.readonly.declared'},
    ],
  },
  {
    id: 'list-item-group-disabled-with-message',
    binding: 'CheckboxListItem',
    summary:
      'an item in an unavailable group, kept focusable and described by the group reason',
    facts: facts({
      checked: true,
      operable: false,
      disabled: true,
      description: 'Managed by your administrator',
    }),
    visibleLabel: 'Email',
    visibleLabelSelector: '[data-a11y-visible-label]',
    storyId: 'a11y-checkbox-pattern--list-item-group-disabled-with-message',
  },

  {
    id: 'menu-item-unchecked',
    binding: 'DropdownMenuCheckboxItem',
    summary:
      'an unchecked menu checkbox item; the menu contract owns composite focus and keys',
    facts: menuFacts(),
    visibleLabel: 'Show archived',
    storyId: 'a11y-checkbox-pattern--menu-item-unchecked',
    opensMenu: true,
  },
  {
    id: 'menu-item-checked',
    binding: 'DropdownMenuCheckboxItem',
    summary: 'a checked menu checkbox item',
    facts: menuFacts({checked: true}),
    visibleLabel: 'Show archived',
    storyId: 'a11y-checkbox-pattern--menu-item-checked',
    opensMenu: true,
  },
  {
    id: 'menu-item-described',
    binding: 'DropdownMenuCheckboxItem',
    summary:
      'a menu checkbox item whose secondary row text participates in its visible name',
    facts: menuFacts(),
    visibleLabel: 'Show archived Include unpublished items',
    storyId: 'a11y-checkbox-pattern--menu-item-described',
    opensMenu: true,
  },
  {
    id: 'menu-item-handlerless-inert',
    binding: 'DropdownMenuCheckboxItem',
    summary:
      'a handlerless menu checkbox that does nothing but is not exposed as unavailable',
    facts: menuFacts({operable: false, disabled: true}),
    visibleLabel: 'Show archived',
    storyId: 'a11y-checkbox-pattern--menu-item-handlerless-inert',
    opensMenu: true,
    declaredNotDelivered: [
      {fact: 'disabled', owned: 'checkbox.disabled.exposed'},
    ],
  },
  {
    id: 'menu-item-disabled',
    binding: 'DropdownMenuCheckboxItem',
    summary: 'an unavailable menu checkbox item',
    facts: menuFacts({operable: false, disabled: true}),
    visibleLabel: 'Show archived',
    storyId: 'a11y-checkbox-pattern--menu-item-disabled',
    opensMenu: true,
  },

  {
    id: 'card-unchecked',
    binding: 'SelectableCard',
    summary: 'an independently selectable card, unchecked',
    facts: facts(),
    visibleLabel: 'Analytics',
    visibleLabelSelector: '[data-a11y-visible-label]',
    pointerTargetSelector: '[data-a11y-pointer-target]',
    storyId: 'a11y-checkbox-pattern--card-unchecked',
  },
  {
    id: 'card-checked',
    binding: 'SelectableCard',
    summary: 'the same selectable card checked',
    facts: facts({checked: true}),
    visibleLabel: 'Analytics',
    visibleLabelSelector: '[data-a11y-visible-label]',
    pointerTargetSelector: '[data-a11y-pointer-target]',
    storyId: 'a11y-checkbox-pattern--card-checked',
  },
  {
    id: 'card-disabled',
    binding: 'SelectableCard',
    summary:
      'an unavailable selectable card whose public prop contract promises continued keyboard reachability',
    facts: facts({operable: false, disabled: true}),
    visibleLabel: 'Analytics',
    visibleLabelSelector: '[data-a11y-visible-label]',
    pointerTargetSelector: '[data-a11y-pointer-target]',
    storyId: 'a11y-checkbox-pattern--card-disabled',
  },
] as const satisfies ReadonlyArray<CheckboxBindingState>;
