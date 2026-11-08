// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Menu.a11y.states.ts
 * @input The DropdownMenu pointer menu's representative open states and the facts MENU_PATTERN reads
 * @output MENU_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test and the Chromium spec (component:DropdownMenu menu surface under spec:AST-020 FR15)
 */

import type {MenuStateFacts} from '@astryxdesign/a11y-spec';

export interface MenuBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** Which menu content the state renders. */
  readonly content: 'actions' | 'selectable';
  /** The trigger's accessible name; the menu is named by it. */
  readonly label: string;
  /** Relation name → [role, accessible name] of the item it designates. */
  readonly items: Readonly<Record<string, readonly [string, string]>>;
  readonly facts: MenuStateFacts;
}

export const MENU_ACTION_ITEMS = [
  {label: 'Rename'},
  {label: 'Duplicate'},
  {label: 'Archive', isDisabled: true},
  {label: 'Delete'},
] as const;

const story = (id: string) => `a11y-menu--${id}`;

export const MENU_BINDING_STATES = [
  {
    id: 'dropdown-actions',
    summary:
      'a DropdownMenu of four actions, one disabled, opened from its Button trigger',
    storyId: story('dropdown-actions'),
    content: 'actions',
    label: 'Actions',
    items: {
      'first-item': ['menuitem', 'Rename'],
      'second-item': ['menuitem', 'Duplicate'],
      'last-item': ['menuitem', 'Delete'],
      'disabled-item': ['menuitem', 'Archive'],
      'typeahead-target': ['menuitem', 'Duplicate'],
    },
    facts: {
      enterTarget: 'first-item',
      wraps: true,
      homeEnd: true,
      disabledItem: true,
      checked: {},
      typeaheadCharacter: 'd',
    },
  },
  {
    id: 'dropdown-selectable',
    summary:
      'a DropdownMenu holding an action, a checked checkbox row and a titled radio group',
    storyId: story('dropdown-selectable'),
    content: 'selectable',
    label: 'View',
    items: {
      'first-item': ['menuitem', 'Edit'],
      'second-item': ['menuitemcheckbox', 'Show archived'],
      'last-item': ['menuitemradio', 'Oldest'],
      'checkbox-item': ['menuitemcheckbox', 'Show archived'],
      'radio-item': ['menuitemradio', 'Newest'],
      'unchecked-radio-item': ['menuitemradio', 'Oldest'],
      'typeahead-target': ['menuitemradio', 'Oldest'],
    },
    facts: {
      enterTarget: 'first-item',
      wraps: true,
      homeEnd: true,
      disabledItem: false,
      checked: {
        'checkbox-item': true,
        'radio-item': true,
        'unchecked-radio-item': false,
      },
      typeaheadCharacter: 'o',
    },
  },
  {
    id: 'dropdown-selectable-checkbox-row',
    summary:
      'the same selectable menu with Enter pressed on its checkbox row, which keeps the menu open (DropdownMenuCheckboxItem hasCloseOnSelect defaults to false)',
    storyId: story('dropdown-selectable-checkbox-row'),
    content: 'selectable',
    label: 'View',
    items: {
      'first-item': ['menuitem', 'Edit'],
      'second-item': ['menuitemcheckbox', 'Show archived'],
      'last-item': ['menuitemradio', 'Oldest'],
      'checkbox-item': ['menuitemcheckbox', 'Show archived'],
      'radio-item': ['menuitemradio', 'Newest'],
      'unchecked-radio-item': ['menuitemradio', 'Oldest'],
      'typeahead-target': ['menuitemradio', 'Oldest'],
    },
    facts: {
      enterTarget: 'checkbox-item',
      wraps: true,
      homeEnd: true,
      disabledItem: false,
      checked: {
        'checkbox-item': true,
        'radio-item': true,
        'unchecked-radio-item': false,
      },
      typeaheadCharacter: 'o',
    },
  },
] as const satisfies ReadonlyArray<MenuBindingState>;

export const MENU_EXCLUSIONS = [
  {
    id: 'opening-control',
    owner: 'the menu-button pattern (MENU_BUTTON_PATTERN, MenuButton.a11y.*)',
    reason:
      'How the trigger exposes itself and where focus lands when it opens the menu are the Menu Button contract. This binding opens the menu from the trigger with Enter only to reach the open state it checks.',
  },
  {
    id: 'submenus',
    owner:
      'DropdownMenuSubMenu.test.tsx and DropdownMenuDrillIn.a11y.chromium.spec.ts',
    reason:
      'Right and Left Arrow opening and closing a flyout, a parent row’s haspopup and expanded state, and the compact-touch drill-in are not yet in a shared contract; the menu pattern exempts them to the binding, so none of these states renders a sub-menu.',
  },
  {
    id: 'bottom-sheet-and-header-footer',
    owner: 'component:DropdownMenu AR4/AR5 and the modal-dialog pattern',
    reason:
      'On a compact touch display the menu is a bottom sheet, and with a header or footer the popover is a modal dialog in which Tab cycles instead of closing; both are dialogs, so every state here uses the plain pointer popover.',
  },
] as const;
