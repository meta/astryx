// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuButton.a11y.states.ts
 * @input The anchored DropdownMenu and MoreMenu triggers' representative states and the facts MENU_BUTTON_PATTERN reads
 * @output MENU_BUTTON_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test and the Chromium spec (component:DropdownMenu AR4, component:MoreMenu AR1)
 */

import type {MenuButtonStateFacts} from '@astryxdesign/a11y-spec';

export interface MenuButtonBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** Which component renders the trigger. */
  readonly component:
    'DropdownMenu' | 'DropdownMenu.renderTrigger' | 'MoreMenu';
  /** The trigger's accessible name. */
  readonly label: string;
  /** Labels of the menu's first and last enabled items. */
  readonly firstItem: string;
  readonly lastItem: string;
  readonly facts: MenuButtonStateFacts;
  /** Whether the menu is mounted open (controlled `isMenuOpen`). */
  readonly open?: boolean;
  /** Whether the trigger is disabled. */
  readonly disabled?: boolean;
}

export const MENU_BUTTON_ITEMS = [
  {label: 'Rename'},
  {label: 'Duplicate'},
  {label: 'Archive', isDisabled: true},
  {label: 'Delete'},
] as const;

function facts(
  overrides: Partial<MenuButtonStateFacts> = {},
): MenuButtonStateFacts {
  return {
    open: false,
    operable: true,
    focusable: true,
    controls: true,
    arrowKeysOpen: true,
    ...overrides,
  };
}

const story = (id: string) => `a11y-menubutton--${id}`;

export const MENU_BUTTON_BINDING_STATES = [
  {
    id: 'dropdown-button-closed',
    summary: 'the default DropdownMenu Button trigger with its menu hidden',
    storyId: story('dropdown-button-closed'),
    component: 'DropdownMenu',
    label: 'Actions',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts(),
  },
  {
    id: 'dropdown-button-open',
    summary: 'the default DropdownMenu Button trigger with its menu displayed',
    storyId: story('dropdown-button-open'),
    component: 'DropdownMenu',
    label: 'Actions',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts({open: true}),
    open: true,
  },
  {
    id: 'dropdown-render-trigger-closed',
    summary:
      'a caller-rendered trigger that spreads the DropdownMenu trigger props onto its own button',
    storyId: story('dropdown-render-trigger-closed'),
    component: 'DropdownMenu.renderTrigger',
    label: 'Row actions',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts(),
  },
  {
    id: 'dropdown-button-disabled',
    summary: 'a disabled DropdownMenu trigger that keeps its menu hidden',
    storyId: story('dropdown-button-disabled'),
    component: 'DropdownMenu',
    label: 'Actions',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts({operable: false, focusable: false}),
    disabled: true,
  },
  {
    id: 'more-menu-closed',
    summary: 'the MoreMenu icon-only trigger with its menu hidden',
    storyId: story('more-menu-closed'),
    component: 'MoreMenu',
    label: 'More options',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts(),
  },
  {
    id: 'more-menu-disabled',
    summary:
      'a disabled MoreMenu trigger that stays focusable for its tooltip and must keep its menu closed',
    storyId: story('more-menu-disabled'),
    component: 'MoreMenu',
    label: 'More options',
    firstItem: 'Rename',
    lastItem: 'Delete',
    facts: facts({operable: false, focusable: true}),
    disabled: true,
  },
] as const satisfies ReadonlyArray<MenuButtonBindingState>;

export const MENU_BUTTON_EXCLUSIONS = [
  {
    id: 'menu-surface-semantics',
    owner: 'the menu pattern (queued) and DropdownMenu.test.tsx',
    reason:
      'Item roles, arrow navigation inside the open menu, typeahead, Escape, selection, and focus return on close are the menu surface contract. This binding proves only how the trigger exposes itself and where focus lands when it opens the menu.',
  },
  {
    id: 'bottom-sheet-presentation',
    owner: 'component:DropdownMenu AR4 and the modal-dialog pattern',
    reason:
      'On a compact touch display the trigger opens a bottom sheet and says aria-haspopup="dialog"; that presentation is a dialog, not a menu button, and AR4 places it outside this pattern (MoreMenu AR1 follows DropdownMenu).',
  },
  {
    id: 'header-footer-popover',
    owner:
      'component:DropdownMenu AR4 and AR5 (the popover adopts the modal-dialog pattern)',
    reason:
      'A pointer menu with a header or footer opens a popover that holds the menu beside caller regions, so its trigger says aria-haspopup="dialog" and controls the popover; AR4 places it outside this pattern and AR5 gives it the dialog pattern, so none of these menu-button states renders one.',
  },
] as const;
