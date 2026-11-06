// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toggle-button.ts
 * @input Uses the shared accessibility-contract vocabulary
 * @output TOGGLE_BUTTON_PATTERN and ToggleButtonStateFacts
 * @position The reusable contract for buttons with a persistent pressed state.
 *   Ordinary command buttons remain owned by BUTTON_PATTERN.
 *
 * Adopted pattern: https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /internal/a11y-spec/src/patterns/toggle-button.fixtures.ts
 * - /packages/core/src/ToggleButton/__tests__/ToggleButton.a11y.states.ts
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Subject} from '../harness';
import {saysInOrder, spokenWords} from '../spoken';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/button/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';
const FAMILY_BUTTONS =
  'https://github.com/meta/astryx/blob/e86aa19ecb7e8204c8b5b430bb61a971b813d137/docs/families/buttons.md';

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
const WCAG_2_5_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.2',
  name: 'Pointer Cancellation',
  level: 'A',
  url: `${UNDERSTANDING}/pointer-cancellation.html`,
};
const WCAG_2_5_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.3',
  name: 'Label in Name',
  level: 'A',
  url: `${UNDERSTANDING}/label-in-name.html`,
};
const WCAG_3_2_2: WcagCriterion = {
  standard: 'wcag',
  id: '3.2.2',
  name: 'On Input',
  level: 'A',
  url: `${UNDERSTANDING}/on-input.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const FAMILY_BUTTONS_FR1: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR1',
  requirement:
    'A Button-family control MUST receive a non-empty accessible `label`.',
  url: `${FAMILY_BUTTONS}#L108-L111`,
};
const FAMILY_BUTTONS_FR2: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR2',
  requirement:
    'A momentary or persistent action renders an operable button with keyboard activation, focus-visible feedback, and `type="button"` unless the component\'s documented form mode says otherwise.',
  url: `${FAMILY_BUTTONS}#L112-L116`,
};
const FAMILY_BUTTONS_FR3: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR3',
  requirement: 'A disabled member MUST NOT invoke its callback or Action.',
  url: `${FAMILY_BUTTONS}#L117-L120`,
};
const FAMILY_BUTTONS_FR6: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR6',
  requirement:
    'A ToggleButton MUST expose its effective state with `aria-pressed` and request the next controlled value on activation.',
  url: `${FAMILY_BUTTONS}#L135-L138`,
};

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'The button has role of button.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    'The button has an accessible label. By default, the accessible name is computed from any text content inside the button element. However, it can also be provided with aria-labelledby or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIPTION: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    "If a description of the button's function is present, the button element has aria-describedby set to the ID of the element containing the description.",
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_UNAVAILABLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    'When the action associated with a button is unavailable, the button has aria-disabled set to true.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_PRESSED: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    'If the button is a toggle button, it has an aria-pressed state. When the button is toggled on, the value of this state is true, and when toggled off, the state is false.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_STABLE_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'The label on a toggle does not change when its state changes.',
  url: `${APG_URL}#aboutthispattern`,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'Enter: Activates the button.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'Space: Activates the button.',
  url: `${APG_URL}#keyboardinteraction`,
};

export interface ToggleButtonStateFacts {
  readonly pressed: boolean;
  readonly operable: boolean;
  readonly focusable: boolean;
  readonly unavailable: boolean;
  readonly described: boolean;
}

const ALWAYS = {
  condition: 'the binding renders the toggle button',
  test: () => true,
};
const READS_TREE = ['accessibility-tree'] as const;
const TAB_BUDGET = 10;

function pressedWord(value: 'true' | 'false' | 'mixed' | null): string {
  return value === 'true'
    ? 'pressed'
    : value === 'false'
      ? 'not pressed'
      : value === 'mixed'
        ? 'partly pressed'
        : 'without a pressed state';
}

async function roundTrip(
  subject: Subject,
  start: boolean,
  activate: () => Promise<void>,
  how: string,
): Promise<void> {
  const from = start ? 'true' : 'false';
  const to = start ? 'false' : 'true';
  const before = (await subject.computed()).pressed;
  if (before !== from) {
    throw new Error(
      `the binding declares ${pressedWord(from)}, but the browser starts ${pressedWord(before)}`,
    );
  }
  await activate();
  const after = (await subject.computed()).pressed;
  if (after !== to) {
    throw new Error(
      `${how} left the toggle button ${pressedWord(after)}: it did not become ${pressedWord(to)}`,
    );
  }
  await activate();
  const back = (await subject.computed()).pressed;
  if (back !== from) {
    throw new Error(
      `${how} changed the toggle button to ${pressedWord(after)}, but doing it again left it ${pressedWord(back)} instead of returning it to ${pressedWord(from)}`,
    );
  }
}

export const TOGGLE_BUTTON_PATTERN: PatternContract<ToggleButtonStateFacts> =
  definePattern<ToggleButtonStateFacts>({
    pattern: 'toggle-button',
    url: APG_URL,
    scope:
      'One persistent action control that is reported as a button, exposes its pressed state, keeps one name, and changes in both directions through pointer, Enter, and Space.',
    expectations: [
      {
        id: 'toggle-button.role.exposed',
        outcome:
          'The control is exposed as a button, so the user understands that it performs an action.',
        sources: [WCAG_4_1_2, FAMILY_BUTTONS_FR2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'button') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this toggle button'
                : `the browser reports this control as "${role}", not as a button`,
            );
          }
        },
      },
      {
        id: 'toggle-button.name.exposed',
        outcome:
          'The toggle button has an accessible name, so the user knows which persistent action it controls.',
        sources: [FAMILY_BUTTONS_FR1, WCAG_4_1_2, APG_LABEL],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this toggle button',
            );
          }
        },
      },
      {
        id: 'toggle-button.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so a speech-input user can say what they can read.',
        sources: [WCAG_2_5_3, APG_LABEL],
        covers: ['2.5.3-label-in-name'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this state renders no visible words, so WCAG 2.5.3 has no visible label to compare',
            );
          }
          const {name} = await subject.computed();
          if (!saysInOrder(spokenWords(name), spokenWords(visible))) {
            throw new Error(
              `the visible label reads "${visible}" but the browser computes the accessible name as "${name}"`,
            );
          }
        },
      },
      {
        id: 'toggle-button.state.exposed',
        outcome:
          'The pressed state is exposed and matches the rendered state, so assistive technology reports the same persistent choice the user sees.',
        sources: [FAMILY_BUTTONS_FR6, WCAG_4_1_2, APG_PRESSED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {pressed} = await subject.computed();
          const expected = facts.pressed ? 'true' : 'false';
          if (pressed == null) {
            throw new Error(
              'the browser exposes no pressed state for this toggle button',
            );
          }
          if (pressed !== expected) {
            throw new Error(
              `this state is ${pressedWord(expected)} but the browser reports it as ${pressedWord(pressed)}`,
            );
          }
        },
      },
      {
        id: 'toggle-button.description.resolvable',
        outcome:
          'Every description target exists, so supporting text is not silently dropped.',
        sources: [WCAG_1_3_1, APG_DESCRIPTION],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders supporting text',
          test: facts => facts.described,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const ids = ((await subject.attribute('aria-describedby')) ?? '')
            .split(/\s+/)
            .filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'the binding renders supporting text, but the toggle button has no aria-describedby',
            );
          }
          const targets = await subject.idReferences('aria-describedby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-describedby points at ${dangling.map(id => `"${id}"`).join(', ')}, which resolves to nothing`,
            );
          }
        },
      },
      {
        id: 'toggle-button.description.exposed',
        outcome: 'Supporting text is exposed as the toggle button description.',
        sources: [WCAG_4_1_2, APG_DESCRIPTION],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding renders supporting text',
          test: facts => facts.described,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).description.trim() === '') {
            throw new Error(
              'the binding renders supporting text, but the browser computes no accessible description',
            );
          }
        },
      },
      {
        id: 'toggle-button.unavailable.exposed',
        outcome: 'An unavailable toggle button is reported as unavailable.',
        sources: [WCAG_4_1_2, APG_UNAVAILABLE],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state unavailable',
          test: facts => facts.unavailable,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if (!(await subject.computed()).disabled) {
            throw new Error(
              'this state is unavailable, but the browser reports the toggle button as available',
            );
          }
        },
      },
      {
        id: 'toggle-button.state.pointer-round-trip',
        outcome:
          'A pointer changes the pressed state and changes it back, with the exposed state following both transitions.',
        sources: [FAMILY_BUTTONS_FR6, APG_PRESSED, WCAG_4_1_2],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the user can change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) =>
          roundTrip(
            subject,
            facts.pressed,
            () => harness.click(subject),
            'clicking the toggle button',
          ),
      },
      {
        id: 'toggle-button.state.enter-round-trip',
        outcome: 'Enter changes the pressed state and changes it back.',
        sources: [WCAG_2_1_1, FAMILY_BUTTONS_FR2, APG_ENTER],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the state is operable and focusable',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the toggle button did not take focus, so Enter never reaches it',
            );
          }
          await roundTrip(
            subject,
            facts.pressed,
            () => harness.press('Enter'),
            'pressing Enter on the focused toggle button',
          );
        },
      },
      {
        id: 'toggle-button.state.space-round-trip',
        outcome: 'Space changes the pressed state and changes it back.',
        sources: [WCAG_2_1_1, FAMILY_BUTTONS_FR2, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the state is operable and focusable',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the toggle button did not take focus, so Space never reaches it',
            );
          }
          await roundTrip(
            subject,
            facts.pressed,
            () => harness.press('Space'),
            'pressing Space on the focused toggle button',
          );
        },
      },
      {
        id: 'toggle-button.name.stable-across-change',
        outcome:
          'The name stays the same after both state changes, so it identifies the action rather than contradicting the pressed state.',
        sources: [APG_STABLE_LABEL, WCAG_4_1_2],
        wcagOutcome:
          'The accessible name in 4.1.2 continues to identify the same control while its separately exposed state changes.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the user can change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'advisory',
        advisoryBecause:
          'The label-stability detail is APG guidance that no current Astryx record adopts as a required shared outcome.',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).name;
          await harness.click(subject);
          const changed = (await subject.computed()).name;
          if (changed.trim().toLowerCase() !== before.trim().toLowerCase()) {
            throw new Error(
              `changing the pressed state renamed the toggle button from "${before}" to "${changed}"`,
            );
          }
          await harness.click(subject);
          const back = (await subject.computed()).name;
          if (back.trim().toLowerCase() !== before.trim().toLowerCase()) {
            throw new Error(
              `changing the pressed state back renamed the toggle button from "${before}" to "${back}"`,
            );
          }
        },
      },
      {
        id: 'toggle-button.state.survives-an-aborted-press',
        outcome:
          'A press released away from the control leaves the pressed state unchanged.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the user can change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).pressed;
          await harness.abortedPress(subject);
          const after = (await subject.computed()).pressed;
          if (after !== before) {
            throw new Error(
              `pressing and releasing away still changed the toggle button to ${pressedWord(after)}`,
            );
          }
        },
      },
      {
        id: 'toggle-button.focus.stays-on-change',
        outcome:
          'Changing the pressed state leaves focus on the toggle button.',
        sources: [WCAG_3_2_2],
        // Partly: see the 3.2.2 exemption for context changes caused by the
        // caller rather than by the ToggleButton itself.
        covers: ['3.2.2-on-input'],
        appliesWhen: {
          condition: 'the state is operable and focusable',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the toggle button did not take focus, so its state cannot be changed from the keyboard',
            );
          }
          const before = (await subject.computed()).pressed;
          await harness.press('Space');
          if ((await subject.computed()).pressed === before) {
            throw new Error(
              'pressing Space did not change the pressed state, so there is no change whose focus outcome can be checked',
            );
          }
          if (!(await subject.isFocused())) {
            throw new Error(
              'changing the pressed state moved focus off the toggle button',
            );
          }
        },
      },
      {
        id: 'toggle-button.focus.reachable-and-escapable',
        outcome: 'Tab reaches the toggle button and then leaves it.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition: 'the state belongs in the tab sequence',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await harness.resetFocus();
          let reached = false;
          for (let step = 0; step < TAB_BUDGET && !reached; step += 1) {
            await harness.press('Tab');
            reached = await subject.isFocused();
          }
          if (!reached) {
            throw new Error(
              `${TAB_BUDGET} presses of Tab never reached the toggle button`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error('Tab did not move focus off the toggle button');
          }
        },
      },
      {
        id: 'toggle-button.state.inoperable',
        outcome:
          'A toggle button that cannot be operated keeps its pressed state under pointer, Enter, and Space.',
        sources: [FAMILY_BUTTONS_FR3, FAMILY_BUTTONS_FR6, WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the user cannot change this state',
          test: facts => !facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const before = (await subject.computed()).pressed;
          await harness.click(subject, {ignoreAvailability: true});
          if ((await subject.computed()).pressed !== before) {
            throw new Error(
              'clicking an inoperable toggle button changed its pressed state',
            );
          }
          if (!facts.focusable) {
            return;
          }
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'this state is declared focusable but cannot take focus',
            );
          }
          for (const key of ['Enter', 'Space'] as const) {
            await harness.press(key);
            if ((await subject.computed()).pressed !== before) {
              throw new Error(
                `pressing ${key} changed an inoperable toggle button`,
              );
            }
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy: 'component icon tests and the repository axe audit',
        reason:
          'Decorative or informative graphics inside the control are component composition, not pressed-button semantics.',
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: 'page-level DOM-order review',
        reason:
          'A single control cannot determine its order among surrounding content.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form',
        verifiedBy: 'form integration review',
        reason:
          'A toggle button performs an action and does not collect user information.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'forced-colors tests and the visual gate',
        reason:
          'Whether pressed state is conveyed without color alone is a rendered-pixel claim.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'axe and visual gates',
        reason: 'Resolved text contrast is a rendered-pixel measurement.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy: 'axe, forced-colors, and visual gates',
        reason:
          'Control, state, icon, and focus-indicator contrast are rendered-pixel measurements.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A component does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          'This contract proves reachability and escape, not the meaning of the surrounding sequence.',
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'link-pattern and page review',
        reason:
          'ToggleButton remains an action and never adopts link semantics.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy:
          'content review of whether the supplied label describes the action',
        reason:
          'The contract proves that a name exists, not that the chosen wording is descriptive.',
      },
      '2.4.7-focus-visible': {
        owner: 'interaction-modality and the binding component',
        verifiedBy: 'the repository visual gate',
        reason: 'A visible focus indicator is a paint result.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page and overlay review',
        reason: 'Obscuration depends on surrounding authored content.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and composing page',
        verifiedBy: 'the repository axe target-size rule and visual review',
        reason:
          'Target-size exceptions depend on rendered geometry and neighbouring targets.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A component does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller, for its response to onPressedChange',
        verifiedBy:
          'integration and page-level review of any navigation, reload, or surrounding content change triggered by the caller',
        reason:
          'This contract proves that changing pressed state keeps focus on the ToggleButton. It cannot observe whether caller code changes the wider page context in response to onPressedChange.',
        coversRemainderOnly: true,
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy: 'shared pattern adoption and page-level content review',
        reason:
          'Consistency is a property of repeated controls across a product.',
      },
      '3.3.1-error-identification': {
        owner: 'the composing workflow',
        verifiedBy: 'workflow validation and status-message tests',
        reason:
          'A toggle button exposes pressed state, not a validation error contract.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'caller content',
        verifiedBy: 'content review',
        reason:
          'Instructions for a workflow are not owned by one toggle button.',
      },
      '4.1.3-status-messages': {
        owner: 'the binding component and caller',
        verifiedBy:
          'status-message tests and AST-009 when announcement is claimed',
        reason:
          'A pressed state is exposed on the control; separate status announcements are composed around it.',
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          'ToggleButton forced-colors tests and manual Windows High Contrast review',
        reason: 'Forced-colors output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy: 'motion guards and the visual gate',
        reason: 'Motion is a rendered result over time.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'localization review and AST-009 when announcement is claimed',
        reason:
          'The contract compares names and labels but does not own translation or spoken output.',
      },
    },
  });
