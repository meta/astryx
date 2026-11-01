// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menu.fixtures.ts
 * @input Plain HTML menus opened from a button, conforming and deliberately violating
 * @output MENU_FIXTURES, their subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for menu.jsdom.test.ts and menu.chromium.spec.ts
 */

import type {MenuStateFacts} from './menu';

export const SUBJECT_SELECTOR = '#menu';
export const OPENER_SELECTOR = '#opener';

/**
 * How the fixture menu behaves. One script reads these from the menu's data
 * attributes, so a violating fixture changes exactly one behavior.
 */
interface Behavior {
  /** Items ArrowDown advances by. */
  readonly downStep?: 1 | 2;
  readonly up?: boolean;
  readonly wrap?: boolean;
  readonly homeEnd?: boolean;
  readonly typeahead?: boolean;
  /** Enter: close and return focus, stay open, or close and drop focus. */
  readonly enter?: 'return' | 'stay' | 'drop';
  /** Whether Enter runs the item's action (counted on `window.__menuActivations`). */
  readonly activate?: boolean;
  /** Escape: close and return focus, do nothing, or close and drop focus. */
  readonly escape?: 'return' | 'ignore' | 'drop';
  /** Tab: close (focus moves on from the opener) or leave the menu open. */
  readonly tab?: 'close' | 'keep';
}

/**
 * The smallest menu behavior: roving focus over enabled items, optional wrap,
 * Home/End and typeahead, Enter running the item's action (counted on
 * `window.__menuActivations`) and closing back to the opener, Escape closing
 * back to the opener, Tab closing and letting the browser move focus on from
 * the opener. jsdom does not run it; the jsdom lane reads DOM attributes only.
 */
const SCRIPT = `<script>(() => {
  const menu = document.getElementById('menu');
  const opener = document.getElementById('opener');
  const d = menu.dataset;
  const enabled = () => [...menu.querySelectorAll('[data-item]')].filter(
    item => item.getAttribute('aria-disabled') !== 'true' && !item.hasAttribute('data-disabled'));
  const close = returnFocus => {
    if (!returnFocus && menu.contains(document.activeElement)) document.activeElement.blur();
    menu.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    if (returnFocus) opener.focus();
  };
  menu.addEventListener('keydown', event => {
    const list = enabled();
    const n = list.length;
    const i = list.indexOf(document.activeElement);
    const go = k => { event.preventDefault(); list[k].focus(); };
    switch (event.key) {
      case 'ArrowDown': {
        const k = i + Number(d.downStep);
        return go(k < n ? k : d.wrap === 'true' ? 0 : n - 1);
      }
      case 'ArrowUp':
        if (d.up !== 'true') return;
        return go(i > 0 ? i - 1 : d.wrap === 'true' ? n - 1 : 0);
      case 'Home':
        if (d.homeEnd === 'true') go(0);
        return;
      case 'End':
        if (d.homeEnd === 'true') go(n - 1);
        return;
      case 'Enter':
        event.preventDefault();
        if (d.activate === 'true') window.__menuActivations = (window.__menuActivations || 0) + 1;
        if (d.enter !== 'stay') close(d.enter === 'return');
        return;
      case 'Escape':
        if (d.escape === 'ignore') return;
        event.preventDefault();
        close(d.escape === 'return');
        return;
      case 'Tab':
        if (d.tab === 'close') { opener.focus(); menu.hidden = true; opener.setAttribute('aria-expanded', 'false'); }
        return;
    }
    if (d.typeahead === 'true' && event.key.length === 1) {
      const c = event.key.toLowerCase();
      for (let j = 1; j <= n; j++) {
        const item = list[(i + j + n) % n];
        if (item.textContent.trim().toLowerCase().startsWith(c)) { go((i + j + n) % n); return; }
      }
    }
  });
})();</script>`;

interface Item {
  readonly id: string;
  readonly label: string;
  readonly role?: string | null;
  readonly checked?: boolean | null;
  /** Disabled and exposed as aria-disabled. */
  readonly disabled?: boolean;
  /** Disabled for the keyboard script but not exposed. */
  readonly hiddenDisabled?: boolean;
}

function itemHtml(item: Item): string {
  const role = item.role === undefined ? 'menuitem' : item.role;
  return `<div id="${item.id}" data-item tabindex="-1"${role == null ? '' : ` role="${role}"`}${item.checked == null ? '' : ` aria-checked="${item.checked}"`}${item.disabled ? ' aria-disabled="true"' : ''}${item.hiddenDisabled ? ' data-disabled' : ''}>${item.label}</div>`;
}

function menuHtml({
  items,
  behavior = {},
  role = 'menu',
  label = 'Actions',
}: {
  items: readonly (Item | {group: string; items: readonly Item[]})[];
  behavior?: Behavior;
  role?: string;
  label?: string | null;
}): string {
  const b: Required<Behavior> = {
    downStep: 1,
    up: true,
    wrap: true,
    homeEnd: true,
    typeahead: true,
    enter: 'return',
    activate: true,
    escape: 'return',
    tab: 'close',
    ...behavior,
  };
  const data = `data-down-step="${b.downStep}" data-up="${b.up}" data-wrap="${b.wrap}" data-home-end="${b.homeEnd}" data-typeahead="${b.typeahead}" data-enter="${b.enter}" data-activate="${b.activate}" data-escape="${b.escape}" data-tab="${b.tab}"`;
  const body = items
    .map(entry =>
      'group' in entry
        ? `<div role="group" aria-label="${entry.group}">${entry.items.map(itemHtml).join('')}</div>`
        : itemHtml(entry),
    )
    .join('');
  const opener = `<button type="button" id="opener" aria-haspopup="menu" aria-expanded="true" aria-controls="menu">Actions</button>`;
  return `${opener}<div id="menu" role="${role}"${label == null ? '' : ` aria-label="${label}"`} tabindex="-1" ${data}>${body}</div>${SCRIPT}`;
}

export interface MenuFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: MenuStateFacts;
  /** Relation name → selector inside the fixture. */
  readonly relations: Readonly<Record<string, string>>;
  readonly html: string;
}

const ACTIONS: readonly Item[] = [
  {id: 'rename', label: 'Rename'},
  {id: 'duplicate', label: 'Duplicate'},
  {id: 'archive', label: 'Archive', disabled: true},
  {id: 'delete', label: 'Delete'},
];

const ACTION_RELATIONS = {
  opener: OPENER_SELECTOR,
  'first-item': '#rename',
  'second-item': '#duplicate',
  'last-item': '#delete',
  'disabled-item': '#archive',
  'typeahead-target': '#duplicate',
} as const;

const actionFacts = (
  overrides: Partial<MenuStateFacts> = {},
): MenuStateFacts => ({
  enterTarget: 'first-item',
  wraps: true,
  homeEnd: true,
  disabledItem: true,
  checked: {},
  typeaheadCharacter: 'd',
  ...overrides,
});

function actions(
  id: string,
  summary: string,
  {
    items = ACTIONS,
    behavior,
    facts = actionFacts(),
    role,
    label,
  }: {
    items?: readonly Item[];
    behavior?: Behavior;
    facts?: MenuStateFacts;
    role?: string;
    label?: string | null;
  } = {},
): MenuFixture {
  return {
    id,
    summary,
    facts,
    relations: ACTION_RELATIONS,
    html: menuHtml({items, behavior, role, label}),
  };
}

function withItem(id: string, change: Partial<Item>): readonly Item[] {
  return ACTIONS.map(item => (item.id === id ? {...item, ...change} : item));
}

const SELECTABLE = menuHtml({
  label: 'View',
  items: [
    {id: 'edit', label: 'Edit'},
    {
      id: 'archived',
      label: 'Show archived',
      role: 'menuitemcheckbox',
      checked: true,
    },
    {
      group: 'Sort by',
      items: [
        {id: 'newest', label: 'Newest', role: 'menuitemradio', checked: true},
        {id: 'oldest', label: 'Oldest', role: 'menuitemradio', checked: false},
      ],
    },
  ],
});

const SELECTABLE_RELATIONS = {
  opener: OPENER_SELECTOR,
  'first-item': '#edit',
  'second-item': '#archived',
  'last-item': '#oldest',
  'checkbox-item': '#archived',
  'radio-item': '#newest',
  'unchecked-radio-item': '#oldest',
  'typeahead-target': '#oldest',
} as const;

const selectableFacts: MenuStateFacts = {
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
};

export const MENU_FIXTURES: readonly MenuFixture[] = [
  actions(
    'conforming-actions',
    'a named menu of four actions, one disabled, with wrapping arrows, Home/End and typeahead',
  ),
  {
    id: 'conforming-selectable',
    summary:
      'a menu holding an action, a checked checkbox item and a radio group',
    facts: selectableFacts,
    relations: SELECTABLE_RELATIONS,
    html: SELECTABLE,
  },
  actions(
    'conforming-no-wrap-with-home-end',
    'a menu whose arrows stop at either end and which ships Home and End, as the APG then requires',
    {
      behavior: {wrap: false},
      facts: actionFacts({wraps: false}),
    },
  ),
  actions(
    'conforming-no-typeahead',
    'a menu that ships no typeahead and does not claim it',
    {
      behavior: {typeahead: false},
      facts: actionFacts({typeaheadCharacter: null}),
    },
  ),
  actions('violating-menu-unnamed', 'a menu with no accessible name', {
    label: null,
  }),
  actions(
    'violating-menu-as-list',
    'the surface exposed as a list instead of a menu',
    {role: 'list'},
  ),
  actions(
    'violating-item-without-role',
    'the last item rendered as a plain focusable div',
    {items: withItem('delete', {role: null})},
  ),
  actions('violating-item-unnamed', 'the second item has no text', {
    items: withItem('duplicate', {label: ''}),
    facts: actionFacts({typeaheadCharacter: null}),
  }),
  {
    id: 'violating-checkbox-without-checked',
    summary: 'a checked checkbox item that carries no aria-checked',
    facts: selectableFacts,
    relations: SELECTABLE_RELATIONS,
    html: SELECTABLE.replace(
      'role="menuitemcheckbox" aria-checked="true"',
      'role="menuitemcheckbox"',
    ),
  },
  {
    id: 'violating-radio-reports-unchecked',
    summary: 'the chosen radio item reports unchecked',
    facts: selectableFacts,
    relations: SELECTABLE_RELATIONS,
    html: SELECTABLE.replace(
      'role="menuitemradio" aria-checked="true"',
      'role="menuitemradio" aria-checked="false"',
    ),
  },
  actions(
    'violating-disabled-not-exposed',
    'a disabled item the keyboard skips but that does not say it is unavailable',
    {items: withItem('archive', {disabled: false, hiddenDisabled: true})},
  ),
  actions(
    'violating-arrow-down-skips',
    'ArrowDown jumps two items instead of one',
    {behavior: {downStep: 2}},
  ),
  actions('violating-arrow-up-ignored', 'ArrowUp does nothing', {
    behavior: {up: false},
  }),
  actions(
    'violating-claims-wrap',
    'a menu that claims wrapping but stops at either end',
    {behavior: {wrap: false}},
  ),
  actions(
    'violating-home-end-ignored',
    'a menu that claims Home and End but ignores them',
    {behavior: {homeEnd: false}},
  ),
  actions(
    'violating-no-wrap-no-home-end',
    'a menu that neither wraps nor ships Home and End',
    {
      behavior: {wrap: false, homeEnd: false},
      facts: actionFacts({wraps: false, homeEnd: false}),
    },
  ),
  actions(
    'violating-typeahead-ignored',
    'a menu that claims typeahead but ignores typed characters',
    {behavior: {typeahead: false}},
  ),
  actions(
    'violating-enter-keeps-menu-open',
    'Enter on an item leaves the menu displayed',
    {behavior: {enter: 'stay'}},
  ),
  actions(
    'violating-enter-closes-without-activating',
    "Enter closes the menu and returns focus but never runs the item's action",
    {behavior: {activate: false}},
  ),
  actions(
    'violating-enter-drops-focus',
    'Enter closes the menu and leaves focus on the page body',
    {behavior: {enter: 'drop'}},
  ),
  actions('violating-escape-ignored', 'Escape does nothing', {
    behavior: {escape: 'ignore'},
  }),
  actions(
    'violating-escape-drops-focus',
    'Escape closes the menu and leaves focus on the page body',
    {behavior: {escape: 'drop'}},
  ),
  actions(
    'violating-tab-keeps-menu-open',
    'Tab moves focus on but leaves the menu displayed',
    {behavior: {tab: 'keep'}},
  ),
];

export function fixture(id: string): MenuFixture {
  const found = MENU_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown menu fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = MENU_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const MENU_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'menu.container.role-and-name': [
    'violating-menu-unnamed',
    'violating-menu-as-list',
  ],
  'menu.items.roles-and-names': [
    'violating-item-without-role',
    'violating-item-unnamed',
  ],
  'menu.items.checked-state': [
    'violating-checkbox-without-checked',
    'violating-radio-reports-unchecked',
  ],
  'menu.items.disabled-state': ['violating-disabled-not-exposed'],
  'menu.keys.arrow-down-moves-to-next-item': ['violating-arrow-down-skips'],
  'menu.keys.arrow-up-moves-to-previous-item': ['violating-arrow-up-ignored'],
  'menu.keys.arrows-wrap': ['violating-claims-wrap'],
  'menu.keys.home-and-end': [
    'violating-home-end-ignored',
    'violating-no-wrap-no-home-end',
  ],
  'menu.keys.typeahead': ['violating-typeahead-ignored'],
  'menu.keys.enter-activates-and-closes': [
    'violating-enter-keeps-menu-open',
    'violating-enter-closes-without-activating',
    'violating-enter-drops-focus',
  ],
  'menu.keys.escape-closes-and-returns-focus': [
    'violating-escape-ignored',
    'violating-escape-drops-focus',
  ],
  'menu.keys.tab-leaves-and-closes': ['violating-tab-keeps-menu-open'],
};
