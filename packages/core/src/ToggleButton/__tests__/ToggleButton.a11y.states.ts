// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToggleButton.a11y.states.ts
 * @input Uses ToggleButtonStateFacts from @astryxdesign/a11y-spec
 * @output The finite ToggleButton state inventory shared by jsdom and Chromium
 * @position Records every state that can change the toggle-button contract.
 */

import type {ToggleButtonStateFacts} from '@astryxdesign/a11y-spec';

export interface ToggleButtonBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly visibleLabel: string | null;
  readonly renderKind:
    | 'standalone'
    | 'icon-only'
    | 'composed-label'
    | 'single-group'
    | 'multiple-group';
  readonly facts: ToggleButtonStateFacts;
  readonly tooltip?: string;
  readonly groupDisabled?: boolean;
  readonly memberDisabled?: boolean;
}

const facts = (
  pressed: boolean,
  overrides: Partial<ToggleButtonStateFacts> = {},
): ToggleButtonStateFacts => ({
  pressed,
  operable: true,
  focusable: true,
  unavailable: false,
  described: false,
  ...overrides,
});

export const TOGGLE_BUTTON_BINDING_STATES = [
  {
    id: 'standalone-unpressed',
    summary: 'a standalone text toggle that starts unpressed',
    storyId: 'a11y-toggle-button-pattern--standalone-unpressed',
    visibleLabel: 'Bold',
    renderKind: 'standalone',
    facts: facts(false),
  },
  {
    id: 'standalone-pressed',
    summary: 'a standalone text toggle that starts pressed',
    storyId: 'a11y-toggle-button-pattern--standalone-pressed',
    visibleLabel: 'Bold',
    renderKind: 'standalone',
    facts: facts(true),
  },
  {
    id: 'icon-only-unpressed',
    summary: 'an icon-only toggle named by its label',
    storyId: 'a11y-toggle-button-pattern--icon-only-unpressed',
    visibleLabel: null,
    renderKind: 'icon-only',
    facts: facts(false),
  },
  {
    id: 'composed-label-pressed',
    summary: 'a pressed toggle whose custom visible content matches its name',
    storyId: 'a11y-toggle-button-pattern--composed-label-pressed',
    visibleLabel: 'Bold formatting',
    renderKind: 'composed-label',
    facts: facts(true),
  },
  {
    id: 'disabled-unpressed',
    summary: 'a natively disabled standalone toggle',
    storyId: 'a11y-toggle-button-pattern--disabled-unpressed',
    visibleLabel: 'Bold',
    renderKind: 'standalone',
    facts: facts(false, {operable: false, focusable: false, unavailable: true}),
  },
  {
    id: 'disabled-with-tooltip-pressed',
    summary:
      'an aria-disabled pressed toggle kept focusable by its explanation',
    storyId: 'a11y-toggle-button-pattern--disabled-with-tooltip-pressed',
    visibleLabel: 'Bold',
    renderKind: 'standalone',
    tooltip: 'Formatting is locked for this document',
    facts: facts(true, {operable: false, unavailable: true, described: true}),
  },
  {
    id: 'single-group-unpressed',
    summary: 'an unselected member of a single-selection ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--single-group-unpressed',
    visibleLabel: 'List',
    renderKind: 'single-group',
    facts: facts(false),
  },
  {
    id: 'single-group-pressed',
    summary: 'the selected member of a single-selection ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--single-group-pressed',
    visibleLabel: 'List',
    renderKind: 'single-group',
    facts: facts(true),
  },
  {
    id: 'single-group-member-disabled',
    summary: 'a disabled member inside an enabled ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--single-group-member-disabled',
    visibleLabel: 'List',
    renderKind: 'single-group',
    memberDisabled: true,
    facts: facts(false, {operable: false, focusable: false, unavailable: true}),
  },
  {
    id: 'single-group-disabled-member-silent',
    summary: 'an otherwise enabled member inside a disabled ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--single-group-disabled-member-silent',
    visibleLabel: 'List',
    renderKind: 'single-group',
    groupDisabled: true,
    facts: facts(false, {operable: false, focusable: false, unavailable: true}),
  },
  {
    id: 'multiple-group-unpressed',
    summary: 'an unselected member of a multiple-selection ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--multiple-group-unpressed',
    visibleLabel: 'Bold',
    renderKind: 'multiple-group',
    facts: facts(false),
  },
  {
    id: 'multiple-group-pressed',
    summary: 'a selected member of a multiple-selection ToggleButtonGroup',
    storyId: 'a11y-toggle-button-pattern--multiple-group-pressed',
    visibleLabel: 'Bold',
    renderKind: 'multiple-group',
    facts: facts(true),
  },
] as const satisfies ReadonlyArray<ToggleButtonBindingState>;

export type ToggleButtonBindingRow =
  (typeof TOGGLE_BUTTON_BINDING_STATES)[number];
export type ToggleButtonStateId = ToggleButtonBindingRow['id'];

export const TOGGLE_BUTTON_PATTERN_EXCLUSIONS = [
  {
    id: 'group-semantics',
    owner: 'ToggleButton.test.tsx',
    reason:
      'The reusable toggle-button contract owns each pressed button. Group naming, single/multiple selection policy, and sibling coordination remain ToggleButtonGroup behavior.',
  },
  {
    id: 'pending-action-semantics',
    owner: 'ToggleButton.test.tsx and family:buttons FR4-FR5',
    reason:
      'Optimistic Action state, callback ordering, cancellation, and pending feedback are component and family behavior; they are not generic toggle-button semantics.',
  },
  {
    id: 'rendered-appearance',
    owner: 'ToggleButton visual, forced-colors, axe, and RTL gates',
    reason:
      'Pressed treatment, contrast, target size, focus paint, icon replacement, dimensions, motion, and direction are rendered evidence outside this semantic contract.',
  },
] as const;
