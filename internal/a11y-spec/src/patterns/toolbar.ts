// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toolbar.ts
 * @input WCAG 2.2 A/AA success criteria, the APG Toolbar pattern's role, label, orientation, and keyboard requirements, and design:bidirectionality DR6 for the mirrored arrows
 * @output TOOLBAR_PATTERN — the reusable contract a toolbar binds to: its role and name, its orientation, its controls inside it, one Tab stop entering on the first enabled control, and the arrow (with wrap) and Home/End movement between controls
 * @position Pattern contract; bound by Toolbar (`spec:AST-020/FR15`: a roving-tabindex toolbar is one composite control, so it adopts the arrow and Home/End movement it ships)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Key, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/';
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

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'The element that serves as the toolbar container has role toolbar.',
  url: ROLES,
};
const APG_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'If the toolbar has a visible label, it is referenced by aria-labelledby on the toolbar element. Otherwise, the toolbar element has a label provided by aria-label.',
  url: ROLES,
};
const APG_GROUPING: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'A toolbar is a container for grouping a set of controls, such as buttons, menubuttons, or checkboxes.',
  url: APG_URL,
};
const APG_ORIENTATION: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'If the controls are arranged vertically, the toolbar element has aria-orientation set to vertical. The default orientation is horizontal.',
  url: ROLES,
};
const APG_TAB: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'Tab and Shift + Tab: Move focus into and out of the toolbar. When focus moves into a toolbar: If focus is moving into the toolbar for the first time, focus is set on the first control that is not disabled.',
  url: KEYS,
};
const APG_ARROWS: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'For a horizontal toolbar (the default): Left Arrow: Moves focus to the previous control. Right Arrow: Moves focus to the next control. If the items in a toolbar are arranged vertically: Down Arrow performs as Right Arrow is described above. Up Arrow performs as Left Arrow is described above.',
  url: KEYS,
};
const APG_WRAP: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'Left Arrow: Optionally, focus movement may wrap from the first element to the last element. Right Arrow: Optionally, focus movement may wrap from the last element to the first element.',
  url: KEYS,
};
const APG_HOME_END: ApgRequirement = {
  standard: 'apg',
  pattern: 'toolbar',
  requirement:
    'Home (Optional): Moves focus to first element. End (Optional): Moves focus to last element.',
  url: KEYS,
};

/**
 * The current Astryx adoption rule. A roving-tabindex toolbar already plays
 * the toolbar role and is one composite control, so it takes the pattern's
 * required parts and the arrow and Home/End movement it ships between its
 * controls.
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
 * The current Astryx bidirectionality rule: horizontal keyboard movement
 * follows the RTL visual state, so under right-to-left the arrow pointing the
 * way the controls read (ArrowLeft) is "next". The APG names only Right as
 * next, so the mirrored arm rests on this record.
 */
const DESIGN_BIDI_DR6: AstryxRecord = {
  standard: 'astryx',
  id: 'design:bidirectionality',
  clause: 'DR6',
  url: 'https://github.com/meta/astryx/blob/22c592a7a5a911945c0c53204e4daa09a349843d/docs/design/bidirectionality.md#L79-L81',
  requirement:
    'Horizontal keyboard movement, drag/resize math, carousel or scroll progression, range navigation, and side placement MUST produce the action indicated by the RTL visual state.',
};

/**
 * What a binding knows about one toolbar. The subject is the element with role
 * toolbar. Relations: `before` and `after` (focusable controls outside the
 * toolbar on either side of it in the page Tab order), and `first-control`,
 * `second-control` and `last-control` (the first, second and last enabled
 * controls, in the order the arrow keys visit them).
 */
export interface ToolbarStateFacts {
  /** The axis the controls are arranged on, and so which arrows move between them. */
  readonly orientation: 'horizontal' | 'vertical';
  /** The toolbar's resolved writing direction; a horizontal toolbar's arrows follow it. */
  readonly direction: 'ltr' | 'rtl';
  /** Whether the forward arrow on the last control wraps to the first, and the backward arrow on the first to the last. */
  readonly wraps: boolean;
  /** Whether Home and End move to the first and last controls. */
  readonly homeEnd: boolean;
}

const ALWAYS = {
  condition: 'the binding designates a toolbar',
  test: () => true,
};

const CONTROL_RELATIONS = [
  'first-control',
  'second-control',
  'last-control',
] as const;

/**
 * The arrows that move to the next and previous control. A vertical toolbar
 * uses Down and Up; a horizontal one uses the arrow that points the way its
 * controls read, so under right-to-left ArrowLeft is next.
 */
function arrowKeys(facts: ToolbarStateFacts): {
  readonly next: Key;
  readonly previous: Key;
} {
  if (facts.orientation === 'vertical') {
    return {next: 'ArrowDown', previous: 'ArrowUp'};
  }
  return facts.direction === 'rtl'
    ? {next: 'ArrowLeft', previous: 'ArrowRight'}
    : {next: 'ArrowRight', previous: 'ArrowLeft'};
}

async function focusOrFail(control: Subject, name: string): Promise<void> {
  await control.focus();
  if (!(await control.isFocused())) {
    throw new Error(`the ${name} did not take focus`);
  }
}

async function expectFocused(
  control: Subject,
  name: string,
  after: string,
): Promise<void> {
  if (!(await control.isFocused())) {
    throw new Error(`${after} did not move focus to the ${name}`);
  }
}

export const TOOLBAR_PATTERN: PatternContract<ToolbarStateFacts> =
  definePattern<ToolbarStateFacts>({
    pattern: 'toolbar',
    url: APG_URL,
    scope:
      "A toolbar's role and name, its orientation, its controls exposed inside it, one Tab stop that enters on the first enabled control, and the next/previous arrows (mirrored under right-to-left, Down/Up when vertical), their wrap, and Home/End where the binding ships them.",
    expectations: [
      {
        id: 'toolbar.container.role-and-name',
        outcome:
          'The browser exposes the group as a named toolbar, so a user knows they have reached a set of related controls and which set it is.',
        sources: [WCAG_4_1_2, APG_ROLE, APG_LABEL],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'toolbar') {
            throw new Error(
              `the browser exposes this group as ${role == null ? 'no role' : `"${role}"`}, not as a toolbar`,
            );
          }
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for the toolbar',
            );
          }
        },
      },
      {
        id: 'toolbar.container.orientation',
        outcome:
          'A vertical toolbar says it is vertical and a horizontal one does not, so a screen-reader user knows which arrows move between its controls.',
        sources: [WCAG_4_1_2, APG_ORIENTATION, AST_020_FR15],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const value = await subject.attribute('aria-orientation');
          if (facts.orientation === 'vertical' && value !== 'vertical') {
            throw new Error(
              `the vertical toolbar's aria-orientation is ${value ?? 'absent'}, not vertical`,
            );
          }
          if (
            facts.orientation === 'horizontal' &&
            value != null &&
            value !== 'horizontal'
          ) {
            throw new Error(
              `the horizontal toolbar's aria-orientation is ${value}, not horizontal or absent`,
            );
          }
        },
      },
      {
        id: 'toolbar.controls.inside-toolbar',
        outcome:
          'Every control is exposed inside the toolbar, so a user hears it as one of the toolbar’s set rather than a loose control beside it.',
        sources: [WCAG_1_3_1, APG_GROUPING],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          for (const relation of CONTROL_RELATIONS) {
            const control = await harness.related(relation);
            if (!(await harness.containsSemantically(subject, control))) {
              throw new Error(
                `the ${relation} is not exposed inside the toolbar`,
              );
            }
          }
        },
      },
      {
        id: 'toolbar.focus.single-tab-stop',
        outcome:
          'The whole toolbar is one Tab stop: Tab from before it lands on its first enabled control, and Tab again leaves the toolbar.',
        sources: [WCAG_2_4_3, WCAG_2_1_2, APG_TAB, AST_020_FR15],
        covers: [
          '2.1.1-keyboard',
          '2.1.2-no-keyboard-trap',
          '2.4.3-focus-order',
          'apg-interaction',
        ],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = await harness.related('before');
          const after = await harness.related('after');
          await focusOrFail(before, 'control before the toolbar');
          await harness.press('Tab');
          await expectFocused(
            await harness.related('first-control'),
            'first enabled control',
            'Tab from before the toolbar',
          );
          await harness.press('Tab');
          if (await subject.containsFocus()) {
            throw new Error(
              'Tab from the first control left focus inside the toolbar; a toolbar is one Tab stop',
            );
          }
          await expectFocused(
            after,
            'control after the toolbar',
            'Tab from the toolbar',
          );
        },
      },
      {
        id: 'toolbar.keys.next-arrow',
        outcome:
          'The next arrow (Right, Left under right-to-left, Down when vertical) moves focus from one control to the next enabled control.',
        sources: [WCAG_2_1_1, APG_ARROWS, AST_020_FR15, DESIGN_BIDI_DR6],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const {next} = arrowKeys(facts);
          await focusOrFail(
            await harness.related('first-control'),
            'first control',
          );
          await harness.press(next);
          await expectFocused(
            await harness.related('second-control'),
            'second control',
            `${next} on the first control`,
          );
        },
      },
      {
        id: 'toolbar.keys.previous-arrow',
        outcome:
          'The previous arrow (Left, Right under right-to-left, Up when vertical) moves focus from one control to the previous enabled control.',
        sources: [WCAG_2_1_1, APG_ARROWS, AST_020_FR15, DESIGN_BIDI_DR6],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const {previous} = arrowKeys(facts);
          await focusOrFail(
            await harness.related('second-control'),
            'second control',
          );
          await harness.press(previous);
          await expectFocused(
            await harness.related('first-control'),
            'first control',
            `${previous} on the second control`,
          );
        },
      },
      {
        id: 'toolbar.keys.arrows-wrap',
        outcome:
          'The next arrow on the last control moves to the first, and the previous arrow on the first moves to the last.',
        sources: [WCAG_2_1_1, APG_WRAP, AST_020_FR15, DESIGN_BIDI_DR6],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding ships arrow-key wrapping',
          test: facts => facts.wraps,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const {next, previous} = arrowKeys(facts);
          const first = await harness.related('first-control');
          const last = await harness.related('last-control');
          await focusOrFail(last, 'last control');
          await harness.press(next);
          await expectFocused(
            first,
            'first control',
            `${next} on the last control`,
          );
          await harness.press(previous);
          await expectFocused(
            last,
            'last control',
            `${previous} on the first control`,
          );
        },
      },
      {
        id: 'toolbar.keys.home-and-end',
        outcome:
          'Home moves focus to the first enabled control and End to the last.',
        sources: [WCAG_2_1_1, APG_HOME_END, AST_020_FR15],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding ships Home and End',
          test: facts => facts.homeEnd,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness}) => {
          const first = await harness.related('first-control');
          const last = await harness.related('last-control');
          await focusOrFail(
            await harness.related('second-control'),
            'second control',
          );
          await harness.press('End');
          await expectFocused(last, 'last control', 'End');
          await harness.press('Home');
          await expectFocused(first, 'first control', 'Home');
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the controls placed in the toolbar and caller content',
        verifiedBy:
          "each control's own pattern contract (button, toggle-button, menu-button) and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'A toolbar paints no graphic of its own; icon-only controls name themselves through their own pattern.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the binding's slot-layout tests (Toolbar.test.tsx) and content review of any visible toolbar heading",
        reason:
          'This contract encodes that the controls are exposed inside the toolbar. Whether a visible heading labels it, and how slots group controls visually, are binding and caller structure.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component',
        verifiedBy:
          "the binding's DOM-order tests; this contract's arrow rows prove the keyboard order the binding declares",
        reason:
          'The reading order of the controls is the order the caller places them in the slots.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the controls placed in the toolbar and the composing form',
        verifiedBy:
          'the text-input contract and form integration review of any user-information input in a toolbar',
        reason: 'A toolbar collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the controls placed in the toolbar and the theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'Pressed, selected and focused controls are painted by the controls, not by the toolbar container.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the controls placed in the toolbar and the theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Text contrast depends on the resolved colors of the rendered controls.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the controls placed in the toolbar, Section, and the theme',
        verifiedBy:
          'the repository axe audit plus rendered review of focus indicators and dividers',
        reason:
          'Focus rings, control boundaries and the Section divider are paint outcomes owned by the controls, Section and the theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component and the controls placed in it',
        verifiedBy:
          "the binding's caret-guard, nested-popover and onKeyDown-composition tests (Toolbar.test.tsx) and each control's own pattern contract for activation",
        reason:
          'This contract encodes the Tab stop, the next and previous arrows, their wrap, and Home/End. Activating a control is that control’s own pattern; leaving caret keys to a text field and leaving keys inside an open popover to that popover are binding behaviour the APG leaves to the author.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          'This contract proves Tab leaves the toolbar. Where focus goes beyond it is the composition.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A toolbar rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the binding component and the composing page',
        verifiedBy:
          "the binding's tab-stop-repair tests (Toolbar.test.tsx: outside dismissal of a MoreMenu keeps the tab stop) plus page-level focus-order review",
        reason:
          'This contract proves entry on the first enabled control and arrow order inside the toolbar. Returning to the control that last had focus is optional in the APG, so it stays binding behaviour; the toolbar among surrounding controls is the composition.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'LINK_PATTERN and content review of link text',
        reason:
          'A link in a toolbar is a link the caller labels; the toolbar only groups it.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy: 'content review of toolbar labels',
        reason:
          'Whether a label describes the set of controls is a caller-content judgement; this contract checks that a name exists.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record, the controls placed in the toolbar, and the theme',
        verifiedBy:
          "each control's focus-ring styling and the repository visual gate",
        reason: 'The focus ring belongs to the focused control.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page and overlay system',
        verifiedBy: 'page-level review of sticky headers and overlays',
        reason:
          'Whether a sticky surface hides the focused control depends on the page geometry around the toolbar.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the controls placed in the toolbar',
        verifiedBy:
          "each control's own pattern contract (button, toggle-button, menu-button)",
        reason: 'A toolbar has no pointer action of its own.',
      },
      '2.5.3-label-in-name': {
        owner: 'the controls placed in the toolbar and caller content',
        verifiedBy:
          "each control's own pattern contract and content review of visible labels",
        reason:
          'The toolbar label is not rendered as visible text by the binding; each control names itself from its own visible label.',
      },
      '2.5.8-target-size': {
        owner: 'the controls placed in the toolbar and the theme',
        verifiedBy:
          "the repository axe audit's target-size rule and the size cascade tests (Toolbar.test.tsx)",
        reason: 'Control size and spacing are binding and control geometry.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level language review',
        reason: 'A toolbar rendered in isolation owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the controls placed in the toolbar and the caller',
        verifiedBy: 'integration review of what each control does when changed',
        reason:
          'Moving focus between controls changes no setting; what a control does when changed is that control and its caller.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated toolbar labels',
        reason:
          'Consistency is a property of the set of repeated toolbars, not one toolbar.',
      },
      '3.3.1-error-identification': {
        owner: 'the composing form',
        verifiedBy: 'form-level error-state review',
        reason: 'The toolbar pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the controls placed in the toolbar and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'A toolbar collects no input of its own that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the controls placed in the toolbar',
        verifiedBy:
          "each control's own pattern contract (button, toggle-button, menu-button, checkbox)",
        reason:
          'This contract encodes the toolbar role, name and orientation. Each control’s own role, name and state are its own pattern.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken output',
        reason:
          'Moving through a toolbar is not a status message, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: 'the binding component and the controls placed in it',
        verifiedBy:
          "the binding's nested-popover and caret-guard tests (Toolbar.test.tsx) and each control's own pattern contract",
        reason:
          'This contract encodes the toolbar container and movement between its controls. Returning to the last-focused control and focusable disabled controls are optional in the APG; the shortcut key into a toolbar is a recommendation for the application; multi-row toolbars have no Astryx adopter.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the controls placed in the toolbar, Section, and the theme',
        verifiedBy:
          "each control's forced-colors tests plus rendered Windows High Contrast review",
        reason: 'Forced-colors output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the controls placed in the toolbar and the theme',
        verifiedBy:
          "each control's reduced-motion source tests and rendered motion review",
        reason: 'A toolbar container has no entry or exit motion.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          'The toolbar contract introduces no string; the toolbar label comes from the caller.',
      },
    },
  });
