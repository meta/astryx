// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menu.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Menu and Menubar pattern's menu role, item roles, states, and keyboard requirements
 * @output MENU_PATTERN — the reusable contract a displayed menu binds to: its role and name, its items' roles, names, checked and disabled states, and the keys that move, activate, and leave it
 * @position Pattern contract; bound by the DropdownMenu pointer menu (`spec:AST-020/FR15`: a menu is one composite control, so it adopts the arrow and Home/End movement it ships; typeahead stays advisory until a current component record names it)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_2_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.2',
  name: 'No Keyboard Trap',
  level: 'A',
  url: `${UNDERSTANDING}/no-keyboard-trap.html`,
};
const WCAG_2_4_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.4.3',
  name: 'Focus Order',
  level: 'A',
  url: `${UNDERSTANDING}/focus-order.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const ROLES = `${APG_URL}#wai-ariaroles,states,andproperties`;
const KEYS = `${APG_URL}#keyboardinteraction`;

const APG_MENU_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'The element serving as the menu has a role of either menu or menubar.',
  url: ROLES,
};
const APG_MENU_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'An element with role menu either has: aria-labelledby set to a value that refers to the menuitem or button that controls its display. A label provided by aria-label.',
  url: ROLES,
};
const APG_ITEM_ROLES: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'The items contained in a menu are child elements of the containing menu or menubar and have any of the following roles: menuitem, menuitemcheckbox, menuitemradio.',
  url: ROLES,
};
const APG_CHECKED: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'When a menuitemcheckbox or menuitemradio is checked, aria-checked is set to true.',
  url: ROLES,
};
const APG_DISABLED: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement: 'When a menu item is disabled, aria-disabled is set to true.',
  url: ROLES,
};
const APG_DOWN: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Down Arrow: When focus is in a menu, moves focus to the next item, optionally wrapping from the last to the first.',
  url: KEYS,
};
const APG_UP: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Up Arrow: When focus is in a menu, moves focus to the previous item, optionally wrapping from the first to the last.',
  url: KEYS,
};
const APG_HOME_END: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Home: If arrow key wrapping is not supported, moves focus to the first item in the current menu or menubar. End: If arrow key wrapping is not supported, moves focus to the last item in the current menu or menubar.',
  url: KEYS,
};
const APG_TYPEAHEAD: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Any key that corresponds to a printable character (Optional): Move focus to the next item in the current menu whose label begins with that printable character.',
  url: KEYS,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Enter: When focus is on a menuitem that has a submenu, opens the submenu and places focus on its first item. Otherwise, activates the item and closes the menu.',
  url: KEYS,
};
const APG_ESCAPE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Escape: Close the menu that contains focus and return focus to the element or context, e.g., menu button or parent menuitem, from which the menu was opened.',
  url: KEYS,
};
const APG_TAB: ApgRequirement = {
  standard: 'apg',
  pattern: 'menubar',
  requirement:
    'Tab and Shift + Tab: When focus is on a menuitem in a menu or menubar, move focus out of the menu or menubar, and close all menus and submenus.',
  url: KEYS,
};

/**
 * The current Astryx adoption rule. A menu already plays the menu role and is
 * one composite control, so it takes the pattern's required parts and the
 * arrow and Home/End movement it ships between its items. Typeahead is an
 * extra the rule does not name, so it is advisory until the owning component
 * record names it (AST-020 FR9).
 */
const AST_020_FR15: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-020',
  clause: 'FR15',
  url: 'https://github.com/meta/astryx/blob/878fad9d7ac23cd3f4c5def64595abd770bb01a3/docs/specs/AST-020/spec.md#L83-L92',
  requirement:
    "Where a component part already plays an APG pattern's role, Astryx adopts that pattern's required parts for it: the role, the accessible name, the state and relationship properties, and activation by Tab plus Enter or Space. The pattern's optional keyboard extras — arrow-key movement between parts, Home and End — are adopted only where the component already acts as one composite control.",
};

/**
 * What a binding knows about one displayed menu. The subject is the element
 * with role menu. Relations: `opener` (the control the menu was opened from),
 * `first-item`, `second-item` and `last-item` (the first, second and last
 * enabled items, in the order the arrow keys visit them), `disabled-item`
 * when `disabledItem`, `typeahead-target` when `typeaheadCharacter`, and one
 * relation per key of `checked`. The binding also supplies `activations`, the
 * number of times an item's action has run.
 */
export interface MenuStateFacts {
  /** The item relation Enter is pressed on: `first-item` or another item relation, such as a checkable row. */
  readonly enterTarget: string;
  /** Whether ArrowDown on the last item wraps to the first, and ArrowUp on the first to the last. */
  readonly wraps: boolean;
  /** Whether Home and End move to the first and last items. */
  readonly homeEnd: boolean;
  /** Whether the menu holds a disabled item, named by the `disabled-item` relation. */
  readonly disabledItem: boolean;
  /** Checkable items by relation name, and whether each is meant to be checked. */
  readonly checked: Readonly<Record<string, boolean>>;
  /**
   * A printable character that, typed with focus on the menu, moves focus to
   * the `typeahead-target` item; null when the binding ships no typeahead.
   */
  readonly typeaheadCharacter: string | null;
}

const ITEM_ROLES: ReadonlySet<string> = new Set([
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
]);

const ALWAYS = {
  condition: 'the binding designates a displayed menu',
  test: () => true,
};

function itemRelations(facts: MenuStateFacts): readonly string[] {
  return [
    'first-item',
    'second-item',
    'last-item',
    ...(facts.disabledItem ? ['disabled-item'] : []),
    ...Object.keys(facts.checked),
  ];
}

async function focusOrFail(item: Subject, name: string): Promise<void> {
  await item.focus();
  if (!(await item.isFocused())) {
    throw new Error(`the ${name} did not take focus`);
  }
}

async function expectFocused(
  item: Subject,
  name: string,
  after: string,
): Promise<void> {
  if (!(await item.isFocused())) {
    throw new Error(`${after} did not move focus to the ${name}`);
  }
}

async function expectStillOpen(menu: Subject, after: string): Promise<void> {
  if (!(await menu.isVisible())) {
    throw new Error(`${after} closed the menu`);
  }
}

/**
 * Presses one key on a focused item and checks the menu closed and focus went
 * back to the control that opened it. `activate` also requires the item's
 * action to have run exactly once.
 */
async function closesAndReturnsFocus(
  harness: Harness,
  menu: Subject,
  key: 'Enter' | 'Escape',
  target: string,
  activations?: () => Promise<number>,
): Promise<void> {
  const opener = await harness.related('opener');
  await focusOrFail(await harness.related(target), target);
  const before = activations == null ? 0 : await activations();
  await harness.press(key);
  if (activations != null && (await activations()) !== before + 1) {
    throw new Error(`${key} on the ${target} did not run its action once`);
  }
  if (await menu.isVisible()) {
    throw new Error(`${key} on an item left the menu displayed`);
  }
  if (!(await opener.isFocused())) {
    throw new Error(
      `${key} closed the menu without returning focus to the control that opened it`,
    );
  }
}

export const MENU_PATTERN: PatternContract<MenuStateFacts> =
  definePattern<MenuStateFacts>({
    pattern: 'menu',
    url: APG_URL,
    scope:
      "A displayed menu's role and name; its items' roles, names, checked and disabled states; ArrowDown/ArrowUp movement (and its wrap) and Home/End where the binding ships them, typeahead as advisory; Enter running the item's action and closing; Escape closing; Tab leaving and closing; focus returning to the opener.",
    expectations: [
      {
        id: 'menu.container.role-and-name',
        outcome:
          'The browser exposes the open surface as a named menu, so a user knows they are choosing from a set of commands and which set it is.',
        sources: [WCAG_4_1_2, APG_MENU_ROLE, APG_MENU_LABEL],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'menu') {
            throw new Error(
              `the browser exposes this surface as ${role == null ? 'no role' : `"${role}"`}, not as a menu`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for the menu',
            );
          }
        },
      },
      {
        id: 'menu.items.roles-and-names',
        outcome:
          'Every item is exposed inside the menu as a named menu item, checkbox item or radio item, so a user hears each choice and its kind.',
        sources: [WCAG_4_1_2, WCAG_1_3_1, APG_ITEM_ROLES],
        covers: [
          '4.1.2-name-role-value',
          '1.3.1-info-and-relationships',
          'apg-interaction',
        ],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          for (const relation of itemRelations(facts)) {
            const item = await harness.related(relation);
            const {role, name} = await item.computed();
            if (role == null || !ITEM_ROLES.has(role)) {
              throw new Error(
                `the ${relation} is exposed as ${role == null ? 'no role' : `"${role}"`}, not as a menu item`,
              );
            }
            if (!name || name.trim() === '') {
              throw new Error(`the ${relation} has no accessible name`);
            }
            if (!(await harness.containsSemantically(subject, item))) {
              throw new Error(`the ${relation} is not exposed inside the menu`);
            }
          }
        },
      },
      {
        id: 'menu.items.checked-state',
        outcome:
          'A checkbox or radio item reports whether it is checked, in both states.',
        sources: [WCAG_4_1_2, APG_CHECKED, AST_020_FR15],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the menu holds checkable items',
          test: facts => Object.keys(facts.checked).length > 0,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, facts}) => {
          for (const [relation, expected] of Object.entries(facts.checked)) {
            const item = await harness.related(relation);
            const value = await item.attribute('aria-checked');
            if (value !== String(expected)) {
              throw new Error(
                `the ${relation} is meant to be ${expected ? 'checked' : 'unchecked'} but aria-checked is ${value ?? 'absent'}`,
              );
            }
          }
        },
      },
      {
        id: 'menu.items.disabled-state',
        outcome:
          'A disabled item says it is unavailable, so a user does not mistake it for a choice they can make.',
        sources: [WCAG_4_1_2, APG_DISABLED, AST_020_FR15],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the menu holds a disabled item',
          test: facts => facts.disabledItem,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness}) => {
          const item = await harness.related('disabled-item');
          const value = await item.attribute('aria-disabled');
          if (value !== 'true') {
            throw new Error(
              `the disabled item's aria-disabled is ${value ?? 'absent'}, not true`,
            );
          }
        },
      },
      {
        id: 'menu.keys.arrow-down-moves-to-next-item',
        outcome:
          'ArrowDown moves focus from one item to the next enabled item and keeps the menu open.',
        sources: [WCAG_2_1_1, APG_DOWN, AST_020_FR15],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await focusOrFail(await harness.related('first-item'), 'first item');
          await harness.press('ArrowDown');
          await expectFocused(
            await harness.related('second-item'),
            'second item',
            'ArrowDown on the first item',
          );
          await expectStillOpen(subject, 'ArrowDown');
        },
      },
      {
        id: 'menu.keys.arrow-up-moves-to-previous-item',
        outcome:
          'ArrowUp moves focus from one item to the previous enabled item and keeps the menu open.',
        sources: [WCAG_2_1_1, APG_UP, AST_020_FR15],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await focusOrFail(
            await harness.related('second-item'),
            'second item',
          );
          await harness.press('ArrowUp');
          await expectFocused(
            await harness.related('first-item'),
            'first item',
            'ArrowUp on the second item',
          );
          await expectStillOpen(subject, 'ArrowUp');
        },
      },
      {
        id: 'menu.keys.arrows-wrap',
        outcome:
          'ArrowDown on the last item moves to the first, and ArrowUp on the first moves to the last.',
        sources: [WCAG_2_1_1, APG_DOWN, APG_UP, AST_020_FR15],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding ships arrow-key wrapping',
          test: facts => facts.wraps,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness}) => {
          const first = await harness.related('first-item');
          const last = await harness.related('last-item');
          await focusOrFail(last, 'last item');
          await harness.press('ArrowDown');
          await expectFocused(
            first,
            'first item',
            'ArrowDown on the last item',
          );
          await harness.press('ArrowUp');
          await expectFocused(last, 'last item', 'ArrowUp on the first item');
        },
      },
      {
        id: 'menu.keys.home-and-end',
        outcome:
          'Home moves focus to the first enabled item and End to the last, keeping the menu open.',
        sources: [WCAG_2_1_1, APG_HOME_END, AST_020_FR15],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding ships Home and End, or does not wrap (the APG then requires them)',
          test: facts => facts.homeEnd || !facts.wraps,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const first = await harness.related('first-item');
          const last = await harness.related('last-item');
          await focusOrFail(
            await harness.related('second-item'),
            'second item',
          );
          await harness.press('End');
          await expectFocused(last, 'last item', 'End');
          await harness.press('Home');
          await expectFocused(first, 'first item', 'Home');
          await expectStillOpen(subject, 'Home or End');
        },
      },
      {
        id: 'menu.keys.typeahead',
        outcome:
          'With focus in the menu, typing a character moves focus to the next item whose label starts with it.',
        sources: [APG_TYPEAHEAD],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 by keeping the shipped typeahead keyboard-operable; arrow keys already reach every item, so this row is advisory until the binding record adopts typeahead as current.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding names a typeahead character and its target',
          test: facts => facts.typeaheadCharacter != null,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "Typeahead is optional in the APG and is not one of the composite-control extras AST-020 FR15 names; it becomes required once the binding's component record names it as an adopted exception and that record is current (AST-020 FR9).",
        run: async ({harness, subject, facts}) => {
          const character = facts.typeaheadCharacter ?? '';
          await harness.typeText(subject, character);
          await expectFocused(
            await harness.related('typeahead-target'),
            'item it names',
            `typing "${character}"`,
          );
          await expectStillOpen(subject, `typing "${character}"`);
        },
      },
      {
        id: 'menu.keys.enter-activates-and-closes',
        outcome:
          'Enter on an item runs its action once, closes the menu, and returns focus to the control that opened it, so the user is not stranded on the page.',
        sources: [WCAG_2_1_1, APG_ENTER, WCAG_2_4_3, AST_020_FR15],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts, activations}) => {
          await closesAndReturnsFocus(
            harness,
            subject,
            'Enter',
            facts.enterTarget,
            activations,
          );
        },
      },
      {
        id: 'menu.keys.escape-closes-and-returns-focus',
        outcome:
          'Escape closes the menu and returns focus to the control that opened it.',
        sources: [WCAG_2_1_1, APG_ESCAPE, WCAG_2_4_3],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await closesAndReturnsFocus(harness, subject, 'Escape', 'first-item');
        },
      },
      {
        id: 'menu.keys.tab-leaves-and-closes',
        outcome:
          'Tab on an item moves focus out of the menu and closes it, so the keyboard never leaves an open menu behind.',
        sources: [WCAG_2_1_2, APG_TAB, AST_020_FR15],
        covers: ['2.1.2-no-keyboard-trap', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await focusOrFail(await harness.related('first-item'), 'first item');
          await harness.press('Tab');
          if (await subject.containsFocus()) {
            throw new Error('Tab on an item left focus inside the menu');
          }
          if (await subject.isVisible()) {
            throw new Error('Tab moved focus out but left the menu displayed');
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'Item icons, check marks and submenu chevrons are binding-specific composition; this contract reads the item names, not their graphics.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's group, heading and separator tests (DropdownMenu.test.tsx group suite)",
        reason:
          'This contract encodes that items are menu items inside the menu. Groups, group names, headings and separators inside the menu are binding structure.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's DOM-order tests; this contract's arrow rows prove the keyboard order the binding declares",
        reason:
          'The reading order of the items is the order the binding renders them in.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review of any user-information input beside the menu',
        reason: 'A menu collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'How focus, checked and disabled items look is rendered presentation, not menu semantics.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Item text contrast depends on the resolved colors of the rendered binding.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the focus indicator and check marks',
        reason:
          'The focus highlight and check-mark contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's submenu, PageUp/PageDown and Space activation tests (DropdownMenu.test.tsx and DropdownMenuSubMenu.test.tsx keyboard suites)",
        reason:
          'This contract encodes ArrowDown/ArrowUp, Home/End, Enter, Escape and Tab, and reports typeahead as advisory. Submenu opening and closing, PageUp/PageDown, and Space (optional in the APG) remain with the binding until a submenu contract adopts them.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          'This contract proves Tab leaves and closes the menu. Where focus goes next is the composition.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A menu rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the menu-button pattern and the composing page',
        verifiedBy:
          'MENU_BUTTON_PATTERN, which proves focus lands on the first or last item when the menu opens, plus page-level focus-order review',
        reason:
          'This contract proves movement inside the menu and the return to the opener. Where focus lands on open is the opening control; the opener among surrounding controls is the composition.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy:
          "the binding's link-row tests (component:DropdownMenu FR10) and content review of row labels",
        reason:
          'A row that navigates is a link the caller labels; this contract reads it as a menu item.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy: 'content review of menu and item labels',
        reason:
          'Whether a label describes its command is a caller-content judgement; this contract checks that a name exists.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record, binding component, and theme',
        verifiedBy:
          "the component's focus-ring styling and the repository visual gate",
        reason: 'The focused-item highlight is a paint outcome.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the binding component and overlay system',
        verifiedBy:
          "the binding's scroll-into-view tests and overlay visibility review",
        reason:
          'Whether a focused item stays in view in a scrolling menu depends on the rendered geometry.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's press-model browser spec (DropdownMenu MenuPress.a11y.chromium.spec.ts)",
        reason:
          'How a pointer press on an item is completed or taken back is the binding press model, outside the menu semantics this contract reads.',
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the binding's item-name tests and content review of visible labels",
        reason:
          'An item names itself from its visible label; extra description text is binding composition.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over the item rows",
        reason: 'Row height and spacing are binding geometry.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level language review',
        reason: 'A menu rendered in isolation owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller',
        verifiedBy: 'integration review of what each item does when chosen',
        reason:
          'Choosing an item is an explicit activation, not a change of setting; what the command then does is caller behavior.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated item labels',
        reason:
          'Consistency is a property of the set of repeated commands, not one menu.',
      },
      '3.3.1-error-identification': {
        owner: 'the composing form',
        verifiedBy: 'form-level error-state review',
        reason: 'The menu pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason: 'A menu collects no input that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's submenu parent-item tests (aria-haspopup and aria-expanded on a parent item, DropdownMenuSubMenu.test.tsx)",
        reason:
          'This contract encodes the menu and item roles and names and the checked and disabled states. A parent item’s submenu state stays with the binding until a submenu contract adopts it.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken output',
        reason:
          'Opening, moving through or closing a menu is not a status message, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: 'the binding component and the menu-button pattern',
        verifiedBy:
          "MENU_BUTTON_PATTERN for the opening control, plus the binding's submenu tests (DropdownMenuSubMenu.test.tsx)",
        reason:
          'This contract encodes the menu surface. The control that opens it is the menu-button pattern; submenus (Right/Left Arrow, a parent item’s state) stay with the binding until a submenu contract adopts them; menubar movement has no Astryx adopter; the APG note that disabled items stay focusable is not one of the required parts AST-020 FR15 adopts, so the binding’s own focus order decides it.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's forced-colors tests plus rendered Windows High Contrast review",
        reason: 'Forced-colors output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion source tests and rendered motion review",
        reason: 'Menu entry motion is binding paint over time.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          'The menu contract introduces no string; the menu and item names come from the binding or caller.',
      },
    },
  });
