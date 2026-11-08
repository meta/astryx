// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menu-button.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Menu Button pattern's role, state, relationship, and keyboard requirements
 * @output MENU_BUTTON_PATTERN — the reusable contract a control that opens an anchored menu binds to when it adopts Menu Button's required parts, plus the ArrowDown/ArrowUp opening Astryx ships as a named exception
 * @position Pattern contract; bound by the DropdownMenu and MoreMenu anchored triggers under their records' AR4/AR1 (`spec:AST-020/FR15`)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/';
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
const WCAG_2_5_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.2',
  name: 'Pointer Cancellation',
  level: 'A',
  url: `${UNDERSTANDING}/pointer-cancellation.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement: 'The element that opens the menu has role button.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_HASPOPUP: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement:
    'The element with role button has aria-haspopup set to either menu or true.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_EXPANDED: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement:
    'When the menu is displayed, the element with role button has aria-expanded set to true. When the menu is hidden, aria-expanded is set to false.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_CONTROLS: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement:
    'Optionally, the element with role button has a value specified for aria-controls that refers to the element with role menu.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement: 'Enter: opens the menu and places focus on the first menu item.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement: 'Space: Opens the menu and places focus on the first menu item.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_DOWN: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement:
    '(Optional) Down Arrow: opens the menu and moves focus to the first menu item.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_UP: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu-button',
  requirement:
    '(Optional) Up Arrow: opens the menu and moves focus to the last menu item.',
  url: `${APG_URL}#keyboardinteraction`,
};

/**
 * The current Astryx adoption of the pattern's required parts: a control that
 * already plays the menu button role takes its role, name, state and
 * relationship properties, and Enter/Space activation.
 */
const AST_020_FR15: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-020',
  clause: 'FR15',
  url: 'https://github.com/meta/astryx/blob/878fad9d7ac23cd3f4c5def64595abd770bb01a3/docs/specs/AST-020/spec.md#L83-L92',
  requirement:
    "Where a component part already plays an APG pattern's role, Astryx adopts that pattern's required parts for it: the role, the accessible name, the state and relationship properties, and activation by Tab plus Enter or Space.",
};

/**
 * What a binding knows about one menu button. The subject is the control that
 * opens the menu; `menu` is the element with role menu it controls, and
 * `first-item` and `last-item` are that menu's first and last enabled items.
 */
export interface MenuButtonStateFacts {
  /** Whether the menu is meant to be displayed in this state. */
  readonly open: boolean;
  /** Whether the user is meant to be able to open the menu. */
  readonly operable: boolean;
  /** Whether the control is meant to accept keyboard focus. */
  readonly focusable: boolean;
  /** Whether the binding declares the optional aria-controls relationship. */
  readonly controls: boolean;
  /**
   * Whether the binding opens on ArrowDown (first item) and ArrowUp (last
   * item), the APG-optional keys Astryx ships for anchored menus.
   */
  readonly arrowKeysOpen: boolean;
}

const ALWAYS = {
  condition: 'the binding designates a control that opens a menu',
  test: () => true,
};

async function authoredExpanded(subject: Subject): Promise<boolean | null> {
  const value = await subject.attribute('aria-expanded');
  return value === 'true' ? true : value === 'false' ? false : null;
}

async function assertOpen(
  subject: Subject,
  menu: Subject,
  expected: boolean,
  after: string,
): Promise<void> {
  const state = await authoredExpanded(subject);
  if (state !== expected) {
    throw new Error(
      `${after} left aria-expanded ${state == null ? 'absent or invalid' : state} instead of ${expected}`,
    );
  }
  const visible = await menu.isVisible();
  if (visible !== expected) {
    throw new Error(
      `${after} left the control ${expected ? 'expanded' : 'collapsed'} while the menu was ${visible ? 'visible' : 'hidden'}`,
    );
  }
}

async function focusOrFail(subject: Subject, forWhat: string): Promise<void> {
  await subject.focus();
  if (!(await subject.isFocused())) {
    throw new Error(
      `the menu button did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

/**
 * Opens the menu with one key from the focused control, checks where focus
 * landed, then presses the control again so the next expectation starts from
 * the state the binding declared (the pointer round trip proves that press
 * closes the menu). A binding whose menu does not close that way fails here
 * with that reason rather than leaking an open menu into the next check.
 */
async function openWithKey(
  harness: Harness,
  subject: Subject,
  key: 'Enter' | 'Space' | 'ArrowDown' | 'ArrowUp',
  landing: 'first-item' | 'last-item',
): Promise<void> {
  const menu = await harness.related('menu');
  const target = await harness.related(landing);
  await assertOpen(subject, menu, false, 'the starting state');
  await focusOrFail(subject, key);
  await harness.press(key);
  await assertOpen(
    subject,
    menu,
    true,
    `pressing ${key} on the focused control`,
  );
  if (!(await target.isFocused())) {
    throw new Error(
      `pressing ${key} opened the menu without moving focus to its ${landing === 'first-item' ? 'first' : 'last'} enabled item`,
    );
  }
  await harness.click(subject);
  if ((await authoredExpanded(subject)) !== false) {
    throw new Error(
      'pressing the control again did not close the menu, so it cannot be returned to its starting state',
    );
  }
}

export const MENU_BUTTON_PATTERN: PatternContract<MenuButtonStateFacts> =
  definePattern<MenuButtonStateFacts>({
    pattern: 'menu-button',
    url: APG_URL,
    scope:
      "A menu button's role and name, aria-haspopup, expanded state, optional aria-controls to its menu, Enter and Space opening with focus on the first item, and — where a binding ships them — ArrowDown and ArrowUp opening on the first and last items.",
    expectations: [
      {
        id: 'menu-button.control.role-and-name',
        outcome:
          'The browser exposes the control as a named button, so a user hears what the menu is for before opening it.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'button') {
            throw new Error(
              `the browser exposes this control as ${role == null ? 'no role' : `"${role}"`}, not as a button`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this control',
            );
          }
        },
      },
      {
        id: 'menu-button.control.haspopup-menu',
        outcome:
          'The control says it opens a menu, so a user knows a press reveals choices rather than acting at once.',
        sources: [WCAG_4_1_2, APG_HASPOPUP, AST_020_FR15],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const value = await subject.attribute('aria-haspopup');
          if (value !== 'menu' && value !== 'true') {
            throw new Error(
              `aria-haspopup is ${value ?? 'absent'}; a menu button says "menu" or "true"`,
            );
          }
        },
      },
      {
        id: 'menu-button.control.expanded-state',
        outcome:
          'The control reports whether its menu is displayed, in both states.',
        sources: [WCAG_4_1_2, APG_EXPANDED, AST_020_FR15],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expanded = await subject.attribute('aria-expanded');
          if (expanded !== String(facts.open)) {
            throw new Error(
              `the menu is ${facts.open ? 'displayed' : 'hidden'} but aria-expanded is ${expanded ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'menu-button.control.controls-menu',
        outcome:
          'The declared control relationship identifies the menu element.',
        sources: [WCAG_1_3_1, APG_CONTROLS, AST_020_FR15],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding declares the optional aria-controls relationship',
          test: facts => facts.controls,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const menu = await harness.related('menu');
          if (!(await harness.references(subject, 'aria-controls', menu))) {
            throw new Error('aria-controls does not identify the menu');
          }
          if ((await menu.attribute('role')) !== 'menu') {
            throw new Error('the controlled element does not have role menu');
          }
        },
      },
      {
        id: 'menu-button.menu.matches-state',
        outcome:
          'A displayed menu is visible and a hidden menu is not, so the exposed state describes what the user receives.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await assertOpen(
            subject,
            await harness.related('menu'),
            facts.open,
            'the rendered state',
          );
        },
      },
      {
        id: 'menu-button.open.enter-focuses-first-item',
        outcome:
          'With focus on the control, Enter opens the menu and places focus on its first enabled item.',
        sources: [WCAG_2_1_1, APG_ENTER, AST_020_FR15],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the menu starts hidden and the control can be operated and focused',
          test: facts => !facts.open && facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await openWithKey(harness, subject, 'Enter', 'first-item');
        },
      },
      {
        id: 'menu-button.open.space-focuses-first-item',
        outcome:
          'With focus on the control, Space opens the menu and places focus on its first enabled item.',
        sources: [WCAG_2_1_1, APG_SPACE, AST_020_FR15],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the menu starts hidden and the control can be operated and focused',
          test: facts => !facts.open && facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await openWithKey(harness, subject, 'Space', 'first-item');
        },
      },
      {
        id: 'menu-button.open.arrow-down-focuses-first-item',
        outcome:
          'With focus on the control, ArrowDown opens the menu and places focus on its first enabled item.',
        sources: [APG_DOWN],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 by keeping the implemented arrow-key open keyboard-operable; the APG recommends it, so this row is advisory until the binding record adopts it as current.',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding ships arrow-key opening, the menu starts hidden, and the control can be operated and focused',
          test: facts =>
            facts.arrowKeysOpen &&
            !facts.open &&
            facts.operable &&
            facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "ArrowDown and ArrowUp opening are optional in the APG pattern; this becomes required once the binding's component record adopts them as current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          await openWithKey(harness, subject, 'ArrowDown', 'first-item');
        },
      },
      {
        id: 'menu-button.open.arrow-up-focuses-last-item',
        outcome:
          'With focus on the control, ArrowUp opens the menu and places focus on its last enabled item.',
        sources: [APG_UP],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 by keeping the implemented arrow-key open keyboard-operable; the APG recommends it, so this row is advisory until the binding record adopts it as current.',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding ships arrow-key opening, the menu starts hidden, and the control can be operated and focused',
          test: facts =>
            facts.arrowKeysOpen &&
            !facts.open &&
            facts.operable &&
            facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "ArrowDown and ArrowUp opening are optional in the APG pattern; this becomes required once the binding's component record adopts them as current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          await openWithKey(harness, subject, 'ArrowUp', 'last-item');
        },
      },
      {
        id: 'menu-button.open.pointer-round-trip',
        outcome:
          'A pointer press opens the menu and a second press closes it, with the exposed state following both.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the menu starts hidden and the control can be operated',
          test: facts => !facts.open && facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const menu = await harness.related('menu');
          await assertOpen(subject, menu, false, 'the starting state');
          await harness.click(subject);
          await assertOpen(subject, menu, true, 'clicking the control');
          await harness.click(subject);
          await assertOpen(subject, menu, false, 'clicking the control again');
        },
      },
      {
        id: 'menu-button.control.unavailable-stays-closed',
        outcome:
          'An unavailable control that still takes focus keeps its menu closed on every opening key and on a press, so a disabled trigger never surprises the user with choices it says it cannot offer.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the control cannot be operated but can receive focus, and the menu starts hidden',
          test: facts => !facts.operable && facts.focusable && !facts.open,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const menu = await harness.related('menu');
          await assertOpen(subject, menu, false, 'the starting state');
          await focusOrFail(subject, 'the opening keys');
          for (const key of [
            'Enter',
            'Space',
            'ArrowDown',
            'ArrowUp',
          ] as const) {
            await harness.press(key);
            if ((await authoredExpanded(subject)) !== false) {
              throw new Error(
                `an unavailable control opened its menu on ${key}`,
              );
            }
          }
          await harness.click(subject, {ignoreAvailability: true});
          if ((await authoredExpanded(subject)) !== false) {
            throw new Error(
              'an unavailable control opened its menu on a press',
            );
          }
        },
      },
      {
        id: 'menu-button.control.survives-an-aborted-press',
        outcome:
          'A press released away from the control leaves the menu hidden, so an unintended press can be cancelled.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the menu starts hidden and the control can be operated',
          test: facts => !facts.open && facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const menu = await harness.related('menu');
          await assertOpen(subject, menu, false, 'the starting state');
          await harness.abortedPress(subject);
          await assertOpen(
            subject,
            menu,
            false,
            'releasing the press away from the control',
          );
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'The menu button contract owns trigger state and controlled-content behavior. Decorative graphics such as a chevron are binding-specific composition.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the binding's component tests and page-level relationship review",
        reason:
          'This contract encodes the optional trigger-to-content relationship. Other structure and relationships inside or around that content belong to the binding and its composition.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's DOM-order tests and page-level reading-order review",
        reason:
          'The page decides where the trigger and revealed section sit relative to surrounding content.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review for any user-information input inside the disclosed content',
        reason:
          'A menu button trigger does not itself collect information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'Color and any non-color menu button cue are rendered presentation facts, not trigger-state semantics.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Text contrast depends on resolved colors and backdrop in the rendered binding.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the trigger boundary, state cue, and focus indicator',
        reason:
          'Control and menu button-cue contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN focus-navigation expectations plus page-level keyboard-order review',
        reason:
          'This contract encodes the Enter, Space, ArrowDown, and ArrowUp opening transitions. Generic reachability and other page keyboard paths remain with the button and composition owners.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local focus reach/escape tests and page-level keyboard review',
        reason:
          'A menu button adds no focus trap; Tab entry and exit are generic button and composition behavior.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A menu button rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the menu pattern and the composing page',
        verifiedBy:
          "the menu contract's focus-return evidence and page-level focus-order review; this contract proves only where focus lands on open",
        reason:
          "Where focus goes after the menu closes, and the control's place among surrounding controls, belong to the menu contract and the composition.",
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'review of links inside or around the disclosed content',
        reason: 'The adopted menu button trigger is a button, not a link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'the button pattern and caller content',
        verifiedBy:
          'BUTTON_PATTERN naming checks plus content review of the trigger label',
        reason:
          'Whether the trigger label describes its purpose is a caller-content judgement; generic button naming is already owned by BUTTON_PATTERN.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record, binding component, and theme',
        verifiedBy:
          "the component's focus-ring styling and the repository visual gate",
        reason: 'A focus indicator is a paint outcome.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page and overlay system',
        verifiedBy: 'page-level and overlay visibility review',
        reason:
          'Whether another surface covers the focused trigger or revealed content depends on composition.',
      },
      '2.5.3-label-in-name': {
        owner: 'the button pattern and caller content',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local visible-label and accessible-name checks',
        reason:
          'The menu button adds state to a button without changing who owns the button label and name.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the repository axe audit's target-size rule over the trigger and neighbouring targets",
        reason:
          'Target size and spacing exceptions depend on the binding geometry and neighbouring controls.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level language review',
        reason:
          'A menu button rendered in isolation owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the menu pattern and the composing page',
        verifiedBy:
          "the menu contract's focus-return evidence and integration review of any navigation a chosen item causes",
        reason:
          "Opening a menu from its button moves focus into the menu by the pattern's own design, and the menu contract owns focus return on close; what a chosen item then does is caller behavior.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated menu button labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated menu button.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and composing form',
        verifiedBy: 'form-level error-state and text review',
        reason: 'The menu button pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'The menu button trigger does not collect user input that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the button pattern and binding component',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local role, name, and unavailable-state tests',
        reason:
          'This contract encodes the control role and name, aria-haspopup, the expanded state, and their transitions. Other button semantics remain with BUTTON_PATTERN.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken or braille output',
        reason:
          'Showing or hiding ordinary content is not itself a status-message contract, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: 'the button pattern',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local role, name, reachability, and activation tests',
        reason:
          "This contract encodes the menu button's state, relationship, and opening transitions. The menu itself — item roles, arrow navigation inside it, Escape and focus return — is the menu pattern's; the trigger's generic button semantics stay with BUTTON_PATTERN.",
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's forced-colors tests plus rendered Windows High Contrast review",
        reason:
          'Forced-colors output is a paint result owned by the binding and theme.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion source tests and rendered motion review",
        reason:
          'Reveal motion is binding-specific paint over time and is not part of menu button semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels and descriptions',
        reason:
          'The menu button contract introduces no string; trigger and content text come from the binding or caller.',
      },
    },
  });
