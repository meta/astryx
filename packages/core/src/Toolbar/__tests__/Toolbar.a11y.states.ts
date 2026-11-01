// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toolbar.a11y.states.ts
 * @input Toolbar's representative states and the facts TOOLBAR_PATTERN reads
 * @output TOOLBAR_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test and the Chromium spec (Toolbar under spec:AST-020 FR15)
 */

import type {ToolbarStateFacts} from '@astryxdesign/a11y-spec';

export interface ToolbarControl {
  readonly label: string;
  readonly isDisabled?: boolean;
}

export interface ToolbarBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** The Toolbar `label`, which names the toolbar. */
  readonly label: string;
  /** Controls in the start slot, in order. */
  readonly startControls: ReadonlyArray<ToolbarControl>;
  /** Controls in the end slot, in order. */
  readonly endControls: ReadonlyArray<ToolbarControl>;
  /** Relation name → accessible name of the control it designates. */
  readonly controls: Readonly<
    Record<'first-control' | 'second-control' | 'last-control', string>
  >;
  readonly facts: ToolbarStateFacts;
}

const story = (id: string) => `a11y-toolbar--${id}`;

const FORMATTING = [
  {label: 'Bold'},
  {label: 'Italic'},
  {label: 'Underline'},
] as const;

const FORMATTING_CONTROLS = {
  'first-control': 'Bold',
  'second-control': 'Italic',
  'last-control': 'Settings',
} as const;

const HORIZONTAL_LTR: ToolbarStateFacts = {
  orientation: 'horizontal',
  direction: 'ltr',
  wraps: true,
  homeEnd: true,
};

export const TOOLBAR_BINDING_STATES = [
  {
    id: 'horizontal',
    summary:
      'a named horizontal Toolbar with three formatting buttons in the start slot and Settings in the end slot',
    storyId: story('horizontal'),
    label: 'Text formatting',
    startControls: FORMATTING,
    endControls: [{label: 'Settings'}],
    controls: FORMATTING_CONTROLS,
    facts: HORIZONTAL_LTR,
  },
  {
    id: 'horizontal-rtl',
    summary:
      'the same Toolbar inside a right-to-left container, where ArrowLeft moves to the next control',
    storyId: story('horizontal-rtl'),
    label: 'Text formatting',
    startControls: FORMATTING,
    endControls: [{label: 'Settings'}],
    controls: FORMATTING_CONTROLS,
    facts: {...HORIZONTAL_LTR, direction: 'rtl'},
  },
  {
    id: 'vertical',
    summary:
      'a vertical Toolbar of drawing tools, moved through with ArrowDown and ArrowUp',
    storyId: story('vertical'),
    label: 'Drawing tools',
    startControls: [{label: 'Select'}, {label: 'Pen'}, {label: 'Eraser'}],
    endControls: [],
    controls: {
      'first-control': 'Select',
      'second-control': 'Pen',
      'last-control': 'Eraser',
    },
    facts: {...HORIZONTAL_LTR, orientation: 'vertical'},
  },
  {
    id: 'first-control-disabled',
    summary:
      'a Toolbar whose first button is disabled, so Tab enters on the first enabled button and the arrows skip the disabled one',
    storyId: story('first-control-disabled'),
    label: 'Edit actions',
    startControls: [
      {label: 'Undo', isDisabled: true},
      {label: 'Cut'},
      {label: 'Copy'},
    ],
    endControls: [{label: 'Paste'}],
    controls: {
      'first-control': 'Cut',
      'second-control': 'Copy',
      'last-control': 'Paste',
    },
    facts: HORIZONTAL_LTR,
  },
] as const satisfies ReadonlyArray<ToolbarBindingState>;

export const TOOLBAR_EXCLUSIONS = [
  {
    id: 'control-semantics',
    owner:
      'the button, toggle-button and menu-button patterns and their bindings',
    reason:
      'Each control placed in a Toolbar exposes its own role, name, state and activation through its own pattern; this binding renders plain Buttons only so the toolbar container and the movement between controls are what is checked.',
  },
  {
    id: 'caret-guard-and-nested-popovers',
    owner:
      'Toolbar.test.tsx (caret-guard, nested popover and onKeyDown composition suites)',
    reason:
      'Leaving caret keys to a text field mid-line, leaving keys inside an open MoreMenu to that menu, and composing a caller onKeyDown are binding behaviour the APG leaves to the author, so no state here places a text field or popover in the toolbar.',
  },
  {
    id: 'three-lane-layout',
    owner:
      'Toolbar.test.tsx (centerContent and three-slot layout tests) and the repository visual gate',
    reason:
      'Center content switches the row to a three-column grid, but the controls stay in DOM order inside the same toolbar element and the same roving tab stop walks them, so the role, name, Tab stop and arrow order this contract reads do not change; the grid itself is layout paint.',
  },
  {
    id: 'outer-chrome',
    owner: 'component:Section and the repository visual gate',
    reason:
      'Variant, dividers, block padding and edge compensation are Section and layout paint around the toolbar row; they change no role, name, Tab stop or arrow movement, so every state uses the default transparent chrome.',
  },
] as const;
