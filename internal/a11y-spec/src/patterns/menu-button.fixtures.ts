// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menu-button.fixtures.ts
 * @input Plain HTML menu buttons with a three-item menu, conforming and deliberately violating
 * @output MENU_BUTTON_FIXTURES, the subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for menu-button.jsdom.test.ts and menu-button.chromium.spec.ts
 */

import type {MenuButtonStateFacts} from './menu-button';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const MENU_SELECTOR = '#menu';
export const FIRST_ITEM_SELECTOR = '#item-1';
export const LAST_ITEM_SELECTOR = '#item-3';

export interface MenuButtonFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: MenuButtonStateFacts;
  readonly html: string;
}

/**
 * The inline handlers are the smallest menu-button behavior: toggle on click,
 * open on Enter/Space/ArrowDown to the first item and ArrowUp to the last,
 * close on Escape. Fixtures mutate pieces of this to remove one outcome.
 */
const OPEN = `const m = document.getElementById('menu'); m.hidden = false; this.setAttribute('aria-expanded', 'true');`;
const CLOSE = `const m = document.getElementById('menu'); m.hidden = true; this.setAttribute('aria-expanded', 'false');`;
const TOGGLE = `if (this.getAttribute('aria-expanded') === 'true') { ${CLOSE} } else { ${OPEN} }`;
const FOCUS_FIRST = `document.getElementById('item-1').focus();`;
const FOCUS_LAST = `document.getElementById('item-3').focus();`;
const KEYS = `if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} } else if (event.key === 'ArrowUp') { event.preventDefault(); ${OPEN} ${FOCUS_LAST} }`;
const KEYS_ENTER_NO_FOCUS = KEYS.replace(
  `if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
  `if (event.key === 'Enter') { event.preventDefault(); ${OPEN} } else if (event.key === ' ' || event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
);
const KEYS_SPACE_BLOCKED = `if (event.key === ' ') { event.preventDefault(); return; } ${KEYS}`;
const KEYS_DOWN_LAST = KEYS.replace(
  `if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
  `if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} } else if (event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_LAST} }`,
);
const KEYS_UP_FIRST = KEYS.replace(
  `else if (event.key === 'ArrowUp') { event.preventDefault(); ${OPEN} ${FOCUS_LAST} }`,
  `else if (event.key === 'ArrowUp') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
);
const MENU_KEYS = `if (event.key === 'Escape') { event.preventDefault(); const b = document.querySelector('[${SUBJECT_ATTRIBUTE}]'); document.getElementById('menu').hidden = true; b.setAttribute('aria-expanded', 'false'); b.focus(); }`;

function menuButton({
  open = false,
  tag = 'button',
  haspopup = 'menu',
  controls = 'menu',
  expanded = String(open),
  onclick = TOGGLE,
  onkeydown = KEYS,
  onpointerdown = '',
  menuHidden = !open,
  menuRole = 'menu',
  disabled = false,
  focusableDisabled = false,
}: {
  open?: boolean;
  tag?: string;
  haspopup?: string | null;
  controls?: string | null;
  expanded?: string | null;
  onclick?: string;
  onkeydown?: string;
  onpointerdown?: string;
  menuHidden?: boolean;
  menuRole?: string;
  disabled?: boolean;
  focusableDisabled?: boolean;
} = {}): string {
  const typeAttr = tag === 'button' ? ' type="button"' : '';
  const button = `<${tag}${typeAttr} ${SUBJECT_ATTRIBUTE} id="trigger"${haspopup == null ? '' : ` aria-haspopup="${haspopup}"`}${expanded == null ? '' : ` aria-expanded="${expanded}"`}${controls == null ? '' : ` aria-controls="${controls}"`}${disabled ? ' aria-disabled="true" tabindex="-1"' : focusableDisabled ? ' aria-disabled="true"' : ''}${onclick === '' ? '' : ` onclick="${onclick}"`}${onkeydown === '' ? '' : ` onkeydown="${onkeydown}"`}${onpointerdown === '' ? '' : ` onpointerdown="${onpointerdown}"`}>Actions</${tag}>`;
  const items = [1, 2, 3]
    .map(
      index =>
        `<div id="item-${index}" role="menuitem" tabindex="-1">Item ${index}</div>`,
    )
    .join('');
  const menu = `<div id="menu" role="${menuRole}" aria-label="Actions"${menuHidden ? ' hidden' : ''} onkeydown="${MENU_KEYS}">${items}</div>`;
  return `${button}${menu}<div id="other" role="menu" aria-label="Other" hidden></div>`;
}

const facts = (
  overrides: Partial<MenuButtonStateFacts> = {},
): MenuButtonStateFacts => ({
  open: false,
  operable: true,
  focusable: true,
  controls: true,
  arrowKeysOpen: true,
  ...overrides,
});

export const MENU_BUTTON_FIXTURES: readonly MenuButtonFixture[] = [
  {
    id: 'conforming-closed',
    summary:
      'a closed menu button that opens on pointer, Enter, Space, and the arrows',
    facts: facts(),
    html: menuButton(),
  },
  {
    id: 'conforming-open',
    summary: 'a menu button whose menu is already displayed',
    facts: facts({open: true}),
    html: menuButton({open: true}),
  },
  {
    id: 'conforming-haspopup-true',
    summary:
      'a menu button using aria-haspopup="true", the other APG-permitted value',
    facts: facts(),
    html: menuButton({haspopup: 'true'}),
  },
  {
    id: 'conforming-no-controls',
    summary: 'a menu button using the APG-optional form without aria-controls',
    facts: facts({controls: false}),
    html: menuButton({controls: null}),
  },
  {
    id: 'conforming-no-arrow-keys',
    summary:
      'a menu button that opens on Enter and Space only, not claiming the optional arrow keys',
    facts: facts({arrowKeysOpen: false}),
    html: menuButton({
      onkeydown: `if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
    }),
  },
  {
    id: 'conforming-disabled-closed',
    summary: 'an unavailable menu button that keeps its menu hidden',
    facts: facts({operable: false, focusable: false}),
    html: menuButton({onclick: '', onkeydown: '', disabled: true}),
  },
  {
    id: 'conforming-disabled-focusable',
    summary:
      'an unavailable menu button that stays in the Tab order (for its tooltip) and keeps its menu closed on every key and press',
    facts: facts({operable: false, focusable: true}),
    html: menuButton({onclick: '', onkeydown: '', focusableDisabled: true}),
  },
  {
    id: 'violating-not-a-button',
    summary: 'a control rendered as a div with no role',
    facts: facts(),
    html: menuButton({tag: 'div'}).replace(
      `${SUBJECT_ATTRIBUTE} id="trigger"`,
      `${SUBJECT_ATTRIBUTE} id="trigger" tabindex="0"`,
    ),
  },
  {
    id: 'violating-haspopup-missing',
    summary: 'a control with no aria-haspopup',
    facts: facts(),
    html: menuButton({haspopup: null}),
  },
  {
    id: 'violating-haspopup-listbox',
    summary: 'a control that claims a listbox popup',
    facts: facts(),
    html: menuButton({haspopup: 'listbox'}),
  },
  {
    id: 'violating-expanded-missing',
    summary: 'a control with no aria-expanded',
    facts: facts(),
    html: menuButton({expanded: null}),
  },
  {
    id: 'violating-expanded-opposite',
    summary: 'a displayed menu whose control reports collapsed',
    facts: facts({open: true}),
    html: menuButton({open: true, expanded: 'false'}),
  },
  {
    id: 'violating-controls-unrelated',
    summary: 'an aria-controls that points at a different menu',
    facts: facts(),
    html: menuButton({controls: 'other'}),
  },
  {
    id: 'violating-controls-not-menu',
    summary: 'an aria-controls that points at an element without role menu',
    facts: facts(),
    html: menuButton({menuRole: 'group'}),
  },
  {
    id: 'violating-menu-visible-while-collapsed',
    summary: 'a collapsed control whose menu stays visible',
    facts: facts(),
    html: menuButton({menuHidden: false}),
  },
  {
    id: 'violating-enter-opens-without-focus',
    summary: 'Enter opens the menu but leaves focus on the control',
    facts: facts(),
    html: menuButton({onkeydown: KEYS_ENTER_NO_FOCUS}),
  },
  {
    id: 'violating-space-blocked',
    summary: 'a control that blocks Space',
    facts: facts(),
    html: menuButton({onkeydown: KEYS_SPACE_BLOCKED}),
  },
  {
    id: 'violating-arrow-down-focuses-last',
    summary: 'ArrowDown opens the menu on its last item',
    facts: facts(),
    html: menuButton({onkeydown: KEYS_DOWN_LAST}),
  },
  {
    id: 'violating-arrow-up-focuses-first',
    summary: 'ArrowUp opens the menu on its first item',
    facts: facts(),
    html: menuButton({onkeydown: KEYS_UP_FIRST}),
  },
  {
    id: 'violating-disabled-opens-on-arrow',
    summary:
      'an unavailable, focusable menu button that still opens on ArrowDown',
    facts: facts({operable: false, focusable: true}),
    html: menuButton({
      onclick: '',
      onkeydown: `if (event.key === 'ArrowDown') { event.preventDefault(); ${OPEN} ${FOCUS_FIRST} }`,
      focusableDisabled: true,
    }),
  },
  {
    id: 'violating-pointer-one-way',
    summary: 'a pointer opens the menu but cannot close it again',
    facts: facts(),
    html: menuButton({onclick: OPEN}),
  },
  {
    id: 'violating-down-event-activation',
    summary:
      'a control that opens on pointer-down before the user can cancel the press',
    facts: facts(),
    html: menuButton({onclick: '', onpointerdown: TOGGLE}),
  },
];

export function fixture(id: string): MenuButtonFixture {
  const found = MENU_BUTTON_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown menu-button fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  MENU_BUTTON_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const MENU_BUTTON_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'menu-button.control.role-and-name': ['violating-not-a-button'],
  'menu-button.control.haspopup-menu': [
    'violating-haspopup-missing',
    'violating-haspopup-listbox',
  ],
  'menu-button.control.expanded-state': [
    'violating-expanded-missing',
    'violating-expanded-opposite',
  ],
  'menu-button.control.controls-menu': [
    'violating-controls-unrelated',
    'violating-controls-not-menu',
  ],
  'menu-button.menu.matches-state': [
    'violating-menu-visible-while-collapsed',
    'violating-expanded-opposite',
  ],
  'menu-button.open.enter-focuses-first-item': [
    'violating-enter-opens-without-focus',
  ],
  'menu-button.open.space-focuses-first-item': ['violating-space-blocked'],
  'menu-button.open.arrow-down-focuses-first-item': [
    'violating-arrow-down-focuses-last',
  ],
  'menu-button.open.arrow-up-focuses-last-item': [
    'violating-arrow-up-focuses-first',
  ],
  'menu-button.control.unavailable-stays-closed': [
    'violating-disabled-opens-on-arrow',
  ],
  'menu-button.open.pointer-round-trip': ['violating-pointer-one-way'],
  'menu-button.control.survives-an-aborted-press': [
    'violating-down-event-activation',
  ],
};
