// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file radio-group.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output RADIO_GROUP_PATTERN and RadioGroupStateFacts
 * @position Reusable accessibility contract for a radio group and its options.
 *
 * The contract covers direct radio groups and the role/state portion of radio
 * choices inside menus. Menu-owned movement, focus, activation, and dismissal
 * stay with the Menu pattern. Component callbacks, form participation,
 * composition, and styling stay in component-local tests.
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Key} from '../harness';
import {saysInOrder, spokenWords} from '../spoken';

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';
const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/radio/';

const APG_SINGLE_SELECTION: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'A radio group is a set of checkable buttons, known as radio buttons, where no more than one of the buttons can be checked at a time.',
  url: APG_URL,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'Space checks the focused radio button if it is not already checked.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_TAB_ENTRY: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'Tab and Shift + Tab move focus into and out of the radio group; entry targets the checked button, or the first button when none is checked.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_ARROW_SELECTION: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'Right/Down move focus to and check the next radio button; Left/Up do the same for the previous radio button, with wrapping at each end.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_GROUP_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'The radio buttons are contained in or owned by an element with role radiogroup.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_OPTION_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement: 'Each radio button element has role radio.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_SELECTION_STATE: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'A checked radio has aria-checked set to true, and an unchecked radio has aria-checked set to false.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_OPTION_NAME: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'Each radio is labelled by its content, a visible label referenced by aria-labelledby, or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_GROUP_NAME: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'The radiogroup has a visible label referenced by aria-labelledby or a label specified with aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIPTION: ApgRequirement = {
  standard: 'apg',
  pattern: 'radio',
  requirement:
    'Additional information about the radio group or a radio button is referenced by that element with aria-describedby.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};

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
const WCAG_3_3_2: WcagCriterion = {
  standard: 'wcag',
  id: '3.3.2',
  name: 'Labels or Instructions',
  level: 'A',
  url: `${UNDERSTANDING}/labels-or-instructions.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

export type RadioGroupRole = 'radiogroup' | 'group' | 'radio' | 'menuitemradio';

export interface RadioGroupStateFacts {
  readonly part: 'group' | 'option';
  readonly role: RadioGroupRole;
  readonly checked: boolean | null;
  readonly selection: 'none' | 'one' | null;
  /** Relation names for every option in a group-level fixture or binding. */
  readonly optionRelations: readonly string[];
  /** The one relation expected to be selected, or null for a zero-selection state. */
  readonly selectedOption: string | null;
  readonly disabled: boolean | null;
  readonly description: string | null;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly operable: boolean;
  /** Whether the option or an option in the group is expected in page Tab order. */
  readonly tabReachable: boolean;
  /** Whether this direct group owns Space selection rather than delegating it. */
  readonly spaceSelection: boolean;
  /** Whether this group owns pointer selection rather than delegating it. */
  readonly pointerSelection: boolean;
  /** Whether this direct group owns directional selection rather than delegating it. */
  readonly arrowSelection: boolean;
  /** Whether this option owns direct pointer cancellation rather than delegating it. */
  readonly pointerCancellation: boolean;
  readonly visibleLabel: boolean;
  readonly movement: 'none' | 'horizontal-ltr' | 'horizontal-rtl' | 'vertical';
}

function sameWords(actual: string, expected: string): boolean {
  const actualWords = spokenWords(actual);
  const expectedWords = spokenWords(expected);
  return (
    actualWords.length === expectedWords.length &&
    actualWords.every((word, index) => word === expectedWords[index])
  );
}

function movementKeys(
  movement: RadioGroupStateFacts['movement'],
): readonly [Key, Key] {
  switch (movement) {
    case 'horizontal-ltr':
      return ['ArrowRight', 'ArrowLeft'];
    case 'horizontal-rtl':
      return ['ArrowLeft', 'ArrowRight'];
    case 'vertical':
      return ['ArrowDown', 'ArrowUp'];
    case 'none':
      throw new Error(
        'arrow movement ran for a state owned by another pattern',
      );
  }
}

export const RADIO_GROUP_PATTERN: PatternContract<RadioGroupStateFacts> =
  definePattern<RadioGroupStateFacts>({
    pattern: 'radio-group',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/radio/',
    scope:
      'A named single-choice group and its radio-bearing options expose their adopted roles, selection, availability, and supporting relationships; direct radio groups preserve one-stop keyboard entry and selection movement while menu movement stays with Menu.',
    expectations: [
      {
        id: 'radio-group.group.role-exposed',
        outcome:
          'The browser exposes the group role this single-choice composition adopts, so its options are presented as one related set.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_GROUP_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates the group container',
          test: facts => facts.part === 'group',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role} = await subject.computed();
          if (role !== facts.role) {
            throw new Error(
              role == null
                ? `the browser exposes no role for this ${facts.role} group`
                : `this binding adopts the ${facts.role} role for its group, but the browser reports "${role}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.option.role-exposed',
        outcome:
          'The browser exposes the radio-bearing role this option adopts, so the user knows it belongs to a single-choice set.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_OPTION_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one option in the group',
          test: facts => facts.part === 'option',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role} = await subject.computed();
          if (role !== facts.role) {
            throw new Error(
              role == null
                ? `the browser exposes no role for this ${facts.role} option`
                : `this binding adopts the ${facts.role} role for its option, but the browser reports "${role}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.option.name-exposed',
        outcome:
          'Each radio option has an accessible name, so the user can identify the choice before selecting it.',
        sources: [WCAG_3_3_2, WCAG_4_1_2, APG_OPTION_NAME],
        covers: ['4.1.2-name-role-value', '3.3.2-labels-or-instructions'],
        appliesWhen: {
          condition: 'the binding designates one option in the group',
          test: facts => facts.part === 'option',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this radio option',
            );
          }
        },
      },
      {
        id: 'radio-group.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so a speech-input user can say the option or group they can read.',
        sources: [WCAG_2_5_3],
        covers: ['2.5.3-label-in-name'],
        appliesWhen: {
          condition: 'the binding renders the radio group pattern',
          test: () => true,
        },
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this state renders no label a person can read, so there are no visible words for speech input',
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
        id: 'radio-group.option.state-exposed',
        outcome:
          'The browser exposes whether each radio option is selected, and that state matches the binding.',
        sources: [WCAG_4_1_2, APG_SELECTION_STATE],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one option in the group',
          test: facts => facts.part === 'option',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          if (facts.checked == null) {
            throw new Error(
              'option-state expectation ran without a declared checked state',
            );
          }
          const {checked} = await subject.computed();
          const expected = facts.checked ? 'true' : 'false';
          if (checked !== expected) {
            throw new Error(
              checked == null
                ? 'the browser exposes no selected state for this radio option'
                : `this state declares the radio option ${facts.checked ? 'selected' : 'unselected'}, but the browser reports it ${checked === 'true' ? 'selected' : 'unselected'}`,
            );
          }
        },
      },
      {
        id: 'radio-group.selection.exposed',
        outcome:
          'The group exposes no more than one selected option, and the selected option matches the binding state.',
        sources: [
          WCAG_1_3_1,
          WCAG_4_1_2,
          APG_SINGLE_SELECTION,
          APG_SELECTION_STATE,
        ],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a group state and names every option relation',
          test: facts => facts.part === 'group' && facts.selection != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const selected: string[] = [];
          for (const relation of facts.optionRelations) {
            const {checked} = await (
              await harness.related(relation)
            ).computed();
            if (checked === 'true') {
              selected.push(relation);
            } else if (checked !== 'false') {
              throw new Error(
                `the browser exposes no selected state for option relation "${relation}"`,
              );
            }
          }

          if (facts.selection === 'none') {
            if (selected.length > 0) {
              throw new Error(
                `this state declares no selected option, but the browser exposes ${selected.map(name => `"${name}"`).join(', ')} selected`,
              );
            }
            return;
          }

          if (selected.length !== 1) {
            throw new Error(
              `this state declares exactly one selected option, but the browser exposes ${selected.length} selected options`,
            );
          }
          if (selected[0] !== facts.selectedOption) {
            throw new Error(
              `this state declares "${facts.selectedOption}" selected, but the browser exposes "${selected[0]}" selected`,
            );
          }
        },
      },
      {
        id: 'radio-group.focus.entry-and-exit',
        outcome:
          'Tab enters a direct radio group at its selected option, or its first option when none is selected, and Tab again leaves the group.',
        sources: [WCAG_2_1_1, WCAG_2_1_2, WCAG_2_4_3, APG_TAB_ENTRY],
        covers: [
          '2.1.1-keyboard',
          '2.1.2-no-keyboard-trap',
          '2.4.3-focus-order',
        ],
        appliesWhen: {
          condition:
            'the binding designates a direct radio group that participates in page Tab order',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.tabReachable &&
            facts.selection != null,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await harness.resetFocus();
          for (
            let step = 0;
            step < 10 && !(await subject.containsFocus());
            step += 1
          ) {
            await harness.press('Tab');
          }
          if (!(await subject.containsFocus())) {
            throw new Error(
              '10 presses of Tab from the start of the document never entered the radio group',
            );
          }

          const focused: string[] = [];
          for (const relation of facts.optionRelations) {
            if (await (await harness.related(relation)).isFocused()) {
              focused.push(relation);
            }
          }
          const expected = facts.selectedOption ?? facts.optionRelations[0];
          if (focused.length !== 1 || focused[0] !== expected) {
            throw new Error(
              `Tab entered the radio group at ${focused.length === 0 ? 'no named option' : focused.map(name => `"${name}"`).join(', ')} instead of ${facts.selectedOption == null ? `its first option "${expected}"` : `its selected option "${expected}"`}`,
            );
          }

          await harness.press('Tab');
          if (await subject.containsFocus()) {
            throw new Error(
              'Tab did not leave the radio group, so a keyboard user is trapped inside it',
            );
          }
        },
      },
      {
        id: 'radio-group.selection.space-round-trip',
        outcome:
          'Space selects a focused unselected option, and selecting the original option restores the starting choice.',
        sources: [WCAG_2_1_1, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'an operable direct radio group starts with exactly one selected option and at least one alternative',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.spaceSelection &&
            facts.selection === 'one' &&
            facts.selectedOption != null &&
            facts.optionRelations.some(
              relation => relation !== facts.selectedOption,
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const originalName = facts.selectedOption;
          const alternateName = facts.optionRelations.find(
            relation => relation !== originalName,
          );
          if (originalName == null || alternateName == null) {
            throw new Error(
              'Space expectation ran without an original and alternate option',
            );
          }
          const original = await harness.related(originalName);
          const alternate = await harness.related(alternateName);

          await alternate.focus();
          await harness.press('Space');
          const alternateAfter = await alternate.computed();
          const originalAfter = await original.computed();
          if (
            alternateAfter.checked !== 'true' ||
            originalAfter.checked !== 'false'
          ) {
            throw new Error(
              `pressing Space on "${alternateName}" left it ${alternateAfter.checked === 'true' ? 'selected' : 'unselected'}, so the keyboard cannot choose that option`,
            );
          }

          await original.focus();
          await harness.press('Space');
          const originalBack = await original.computed();
          const alternateBack = await alternate.computed();
          if (
            originalBack.checked !== 'true' ||
            alternateBack.checked !== 'false'
          ) {
            throw new Error(
              `pressing Space selected "${alternateName}", but pressing Space on "${originalName}" did not restore the original selection`,
            );
          }
        },
      },
      {
        id: 'radio-group.selection.arrow-round-trip',
        outcome:
          'The adopted directional arrows move focus and selection to an adjacent option and back without losing either state.',
        sources: [WCAG_2_1_1, APG_ARROW_SELECTION],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'an operable direct radio group adopts horizontal or vertical arrow movement and starts with one selected option',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.arrowSelection &&
            facts.selection === 'one' &&
            facts.optionRelations.length > 1,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const originalName = facts.selectedOption;
          if (originalName == null) {
            throw new Error(
              'arrow expectation ran without a selected option relation',
            );
          }
          const originalIndex = facts.optionRelations.indexOf(originalName);
          const nextName =
            facts.optionRelations[
              (originalIndex + 1) % facts.optionRelations.length
            ];
          if (originalIndex < 0 || nextName == null) {
            throw new Error(
              'arrow expectation ran without a complete option order',
            );
          }
          const [forwardKey, backwardKey] = movementKeys(facts.movement);
          const original = await harness.related(originalName);
          const next = await harness.related(nextName);

          await original.focus();
          await harness.press(forwardKey);
          const nextAfter = await next.computed();
          const originalAfter = await original.computed();
          if (
            !(await next.isFocused()) ||
            nextAfter.checked !== 'true' ||
            originalAfter.checked !== 'false'
          ) {
            throw new Error(
              `pressing ${forwardKey} from "${originalName}" did not move focus and selection to "${nextName}"`,
            );
          }

          await harness.press(backwardKey);
          const originalBack = await original.computed();
          const nextBack = await next.computed();
          if (
            !(await original.isFocused()) ||
            originalBack.checked !== 'true' ||
            nextBack.checked !== 'false'
          ) {
            throw new Error(
              `pressing ${forwardKey} moved to "${nextName}", but pressing ${backwardKey} did not restore "${originalName}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.selection.space-from-none',
        outcome:
          'When no option starts selected, Space selects the first option that receives group entry focus.',
        sources: [WCAG_2_1_1, APG_SPACE, APG_TAB_ENTRY],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'an operable direct radio group starts with no selected option and owns Space selection',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.spaceSelection &&
            facts.selection === 'none' &&
            facts.optionRelations.length > 0,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const firstName = facts.optionRelations[0];
          if (firstName == null) {
            throw new Error(
              'Space-from-none expectation ran without a first option relation',
            );
          }
          const first = await harness.related(firstName);
          await first.focus();
          await harness.press('Space');
          if ((await first.computed()).checked !== 'true') {
            throw new Error(
              'pressing Space on the first option of an unselected group left it unselected',
            );
          }
        },
      },
      {
        id: 'radio-group.selection.arrow-from-none',
        outcome:
          'When no option starts selected, the adopted forward arrow moves from the entry option and selects the next option.',
        sources: [WCAG_2_1_1, APG_ARROW_SELECTION, APG_TAB_ENTRY],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'an operable direct radio group starts with no selected option and owns directional selection',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.arrowSelection &&
            facts.selection === 'none' &&
            facts.optionRelations.length > 1,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const firstName = facts.optionRelations[0];
          const nextName = facts.optionRelations[1];
          if (firstName == null || nextName == null) {
            throw new Error(
              'arrow-from-none expectation ran without first and next option relations',
            );
          }
          const [forwardKey] = movementKeys(facts.movement);
          const first = await harness.related(firstName);
          const next = await harness.related(nextName);
          await first.focus();
          await harness.press(forwardKey);
          const firstAfter = await first.computed();
          const nextAfter = await next.computed();
          if (
            !(await next.isFocused()) ||
            firstAfter.checked !== 'false' ||
            nextAfter.checked !== 'true'
          ) {
            throw new Error(
              `pressing ${forwardKey} from the first option of an unselected group did not move focus and selection to "${nextName}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.option.availability-exposed',
        outcome:
          'Each radio option exposes whether it is available, without presenting an unavailable choice as actionable or an available choice as disabled.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one option in the group',
          test: facts => facts.part === 'option',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {disabled} = await subject.computed();
          if (disabled !== facts.disabled) {
            throw new Error(
              `the binding declares this radio option ${facts.disabled ? 'unavailable' : 'available'}, but the browser reports it ${disabled ? 'unavailable' : 'available'}`,
            );
          }
        },
      },
      {
        id: 'radio-group.option.survives-aborted-press',
        outcome:
          'A press released away from an operable radio option leaves the selection unchanged, so an accidental press can be taken back.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'this option is operable by pointer',
          test: facts => facts.part === 'option' && facts.pointerCancellation,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).checked;
          await harness.abortedPress(subject);
          const after = (await subject.computed()).checked;
          if (after !== before) {
            throw new Error(
              'pressing the radio option and releasing away from it still selected it, so the choice cannot be taken back before release',
            );
          }
        },
      },
      {
        id: 'radio-group.selection.pointer-round-trip',
        outcome:
          'A pointer selects an alternative option, and selecting the original option restores the starting choice.',
        sources: [APG_SINGLE_SELECTION, WCAG_4_1_2],
        wcagOutcome:
          'The selected state exposed under 4.1.2 stays synchronized with the state the user changes.',
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'an operable group starts with exactly one selected option and at least one alternative',
          test: facts =>
            facts.part === 'group' &&
            facts.pointerSelection &&
            facts.selection === 'one' &&
            facts.selectedOption != null &&
            facts.optionRelations.some(
              relation => relation !== facts.selectedOption,
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'advisory',
        advisoryBecause:
          'APG defines the selected-state invariant but does not independently require pointer activation, and no current Astryx radio-group record adopts pointer selection as a gate.',
        run: async ({harness, facts}) => {
          const originalName = facts.selectedOption;
          const alternateName = facts.optionRelations.find(
            relation => relation !== originalName,
          );
          if (originalName == null || alternateName == null) {
            throw new Error(
              'pointer expectation ran without an original and alternate option',
            );
          }
          const original = await harness.related(originalName);
          const alternate = await harness.related(alternateName);

          await harness.click(alternate);
          const alternateAfter = await alternate.computed();
          const originalAfter = await original.computed();
          if (
            alternateAfter.checked !== 'true' ||
            originalAfter.checked !== 'false'
          ) {
            throw new Error(
              `clicking "${alternateName}" left it ${alternateAfter.checked === 'true' ? 'selected' : 'unselected'}, so a pointer cannot choose that option`,
            );
          }

          await harness.click(original);
          const originalBack = await original.computed();
          const alternateBack = await alternate.computed();
          if (
            originalBack.checked !== 'true' ||
            alternateBack.checked !== 'false'
          ) {
            throw new Error(
              `clicking "${alternateName}" selected it, but clicking "${originalName}" did not restore the original selection`,
            );
          }
        },
      },
      {
        id: 'radio-group.option.inoperable',
        outcome:
          'A radio option the binding marks inoperable does not change through pointer or owned keyboard input.',
        sources: [APG_SINGLE_SELECTION, WCAG_4_1_2],
        wcagOutcome:
          'The selected state exposed under 4.1.2 does not claim a change the unavailable option did not accept.',
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this radio option is not meant to change',
          test: facts => facts.part === 'option' && !facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'advisory',
        advisoryBecause:
          'The standards require accurate exposed state, but no current Astryx radio-group record adopts inertness for every unavailable option as a universal gate.',
        run: async ({harness, subject, facts}) => {
          const before = (await subject.computed()).checked;
          await harness.click(subject, {ignoreAvailability: true});
          const afterClick = (await subject.computed()).checked;
          if (afterClick !== before) {
            throw new Error(
              `the user is not meant to change this radio option, but clicking it ${afterClick === 'true' ? 'selected' : 'unselected'} it`,
            );
          }
          if (!facts.tabReachable || facts.role !== 'radio') {
            return;
          }
          await subject.focus();
          if (!(await subject.isFocused())) {
            return;
          }
          await harness.press('Space');
          const afterSpace = (await subject.computed()).checked;
          if (afterSpace !== before) {
            throw new Error(
              `the user is not meant to change this radio option, but pressing Space ${afterSpace === 'true' ? 'selected' : 'unselected'} it`,
            );
          }
        },
      },
      {
        id: 'radio-group.group.name-exposed',
        outcome:
          'The single-choice group has an accessible name, so the user knows what decision its options belong to.',
        sources: [WCAG_3_3_2, WCAG_4_1_2, APG_GROUP_NAME],
        covers: ['4.1.2-name-role-value', '3.3.2-labels-or-instructions'],
        appliesWhen: {
          condition: 'the binding designates the group container',
          test: facts => facts.part === 'group',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this single-choice group',
            );
          }
        },
      },
      {
        id: 'radio-group.description.resolvable',
        outcome:
          'Every piece of supporting text the group or option points at exists, so its explanation is not silently dropped.',
        sources: [WCAG_1_3_1, APG_DESCRIPTION],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.description != null,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.description;
          if (expected == null) {
            throw new Error(
              'description expectation ran without expected text',
            );
          }
          const attribute = await subject.attribute('aria-describedby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'the binding renders supporting text for this state, but the subject has no aria-describedby relationship',
            );
          }
          const targets = await subject.idReferences('aria-describedby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-describedby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing`,
            );
          }
          const attached = targets
            .filter((text): text is string => text != null)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (attached !== expected) {
            throw new Error(
              `the binding expects the description "${expected}", but aria-describedby resolves to "${attached}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.description.exposed',
        outcome:
          'The browser exposes the intended supporting text as the group or option description, not only as nearby markup.',
        sources: [WCAG_4_1_2, APG_DESCRIPTION],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.description != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.description;
          if (expected == null) {
            throw new Error(
              'description expectation ran without expected text',
            );
          }
          const {description} = await subject.computed();
          if (!sameWords(description, expected)) {
            throw new Error(
              description.trim() === ''
                ? `the binding expects the description "${expected}", but the browser computes no accessible description`
                : `the binding expects the description "${expected}", but the browser computes "${description}"`,
            );
          }
        },
      },
      {
        id: 'radio-group.required.declared',
        outcome:
          'A radio group that requires a choice declares that requirement for accessibility consumers.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this direct radio group requires a choice',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.required,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-required')) !== 'true') {
            throw new Error(
              'this group is required, but it does not declare aria-required="true"',
            );
          }
        },
      },
      {
        id: 'radio-group.required.not-declared',
        outcome:
          'A radio group that does not require a choice does not expose a false required state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this direct radio group does not require a choice',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            !facts.required,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-required')) === 'true') {
            throw new Error(
              'this group is not required, but it declares aria-required="true"',
            );
          }
        },
      },
      {
        id: 'radio-group.invalid.exposed',
        outcome:
          'A radio group in error is exposed as invalid, so the user can identify the choice that needs attention.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this direct radio group is in error',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if (!(await subject.computed()).invalid) {
            throw new Error(
              'this group is in error, but the browser does not report it as invalid',
            );
          }
        },
      },
      {
        id: 'radio-group.invalid.not-exposed',
        outcome: 'A valid radio group does not expose a false invalid state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this direct radio group is valid',
          test: facts =>
            facts.part === 'group' &&
            facts.role === 'radiogroup' &&
            !facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).invalid) {
            throw new Error(
              'this group is valid, but the browser reports it as invalid',
            );
          }
        },
      },
      {
        id: 'radio-group.group.availability-exposed',
        outcome:
          'When a binding exposes availability on the radio group itself, the browser reports that exact state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a group whose availability is exposed on the group node',
          test: facts => facts.part === 'group' && facts.disabled != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {disabled} = await subject.computed();
          if (disabled !== facts.disabled) {
            throw new Error(
              `the binding declares this radio group ${facts.disabled ? 'unavailable' : 'available'}, but the browser reports it ${disabled ? 'unavailable' : 'available'}`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component suites for decorative indicators and caller-content review, plus the repository axe audit',
        reason:
          'The contract observes group and option semantics; each adopter owns the graphics and content rendered around those nodes.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing form or menu',
        verifiedBy:
          'component DOM tests for labels, descriptions, field status, and menu containment outside the bound subjects',
        reason:
          'This contract covers group/option roles, selected relationships, and authored descriptions; surrounding form and menu structure stays with its composition owner.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy: 'component DOM-order tests and page-level review',
        reason:
          'The reading order around the group and any rich option content depends on the concrete component and page composition.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review when a choice collects information about the user',
        reason:
          'Radio groups choose among caller-defined values and do not themselves assign the autocomplete purposes listed by the criterion.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and component review',
        reason:
          'Whether selection is conveyed by color alone is a rendered-pixel fact, not a semantic-tree result.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Text contrast depends on resolved colors over each adopter’s actual background.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Radio indicators, selected surfaces, boundaries, and focus indicators require rendered-color measurement.',
      },
      '2.1.1-keyboard': {
        owner: 'the Menu pattern, the binding component, and caller content',
        verifiedBy:
          'menu keyboard suites plus component-local tests for optional or component-specific commands',
        reason:
          'This contract covers direct radio-group entry, Space, and adopted arrow movement. Menuitemradio movement and activation belong to Menu, and caller-composed controls keep their own keyboard contracts.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the Menu pattern and composing page',
        verifiedBy:
          'menu focus/dismissal suites and page-level sequential-focus review',
        reason:
          'This contract proves Tab can leave a direct radio group; menu composites and surrounding page focus remain with their owners.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason:
          'A radio group rendered in isolation does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the Menu pattern and composing page',
        verifiedBy:
          'menu focus suites and page-level review of focus before and after the group',
        reason:
          'This contract proves the direct group entry target and one-stop exit; the larger sequence and menu composite order remain outside it.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'caller content',
        verifiedBy: 'review of any links composed into option content',
        reason: 'The adopted radio-group pattern has no link part.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and component review',
        verifiedBy:
          'content review of group labels, option labels, and instructions',
        reason:
          'This contract proves names exist and visible words remain in those names; whether the wording describes the choice is a content judgement.',
      },
      '2.4.7-focus-visible': {
        owner:
          'architecture:interaction-modality, the binding component, and the theme',
        verifiedBy: 'component focus-ring tests and the repository visual gate',
        reason:
          'A visible focus indicator is a painted result owned by each adopter’s actual focus surface.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page or overlay',
        verifiedBy: 'real-browser layout and overlay review',
        reason:
          'Whether focused radio content is obscured depends on surrounding authored content.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component and caller-composed interactive content',
        verifiedBy:
          'component pointer suites for any target outside the bound radio option',
        reason:
          'This contract proves cancellation on the radio option itself; nested or enlarged component surfaces retain their own pointer behavior.',
        coversRemainderOnly: true,
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component-specific label tests and content review for visible words outside the bound label',
        reason:
          'This contract compares the bound group or option name with its rendered label; caller-composed adjacent text remains outside the semantic label relation.',
        coversRemainderOnly: true,
      },
      '2.5.8-target-size': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'real-browser geometry measurement with neighbouring-target spacing and manual exception review',
        reason:
          'Target-size applicability depends on rendered geometry and neighbouring targets in the concrete composition.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason:
          'A component rendered in isolation does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller',
        verifiedBy:
          'integration review of navigation or page rewrites caused by the selection callback',
        reason:
          'The contract keeps focus and selection coherent inside the group; any wider context change caused by the caller is outside the component.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and composing application',
        verifiedBy:
          'cross-component and cross-page review of equivalent single-choice functions',
        reason:
          'Consistency is a comparison across usages, not a property one isolated binding can establish.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component',
        verifiedBy: 'component status-message tests and visible-text review',
        reason:
          'This contract verifies invalid-state exposure; the textual identification of an error is composed around the group.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component tests for persistent visible labels and content review for instructions needed to make the choice',
        reason:
          'This contract proves accessible names exist; visual persistence and instructional sufficiency remain presentation and content outcomes.',
        coversRemainderOnly: true,
      },
      '4.1.2-name-role-value': {
        owner:
          'the binding component and separate contracts for composed parts',
        verifiedBy:
          'component-specific tests for states and values not owned by radio-group semantics',
        reason:
          'This contract covers group/option role, name, selection, availability, requiredness, invalidity, and descriptions; component-specific busy, form, and composed-control states stay local.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'the binding component and AST-009 for any claimed announcement',
        verifiedBy:
          'component status-message tests plus real-AT evidence when the claim is about spoken or braille output',
        reason:
          'Validation and async status messages are composed around the group, and their announcement is not observable in this contract.',
      },
      'apg-interaction': {
        owner: 'the Menu pattern and each binding’s current component contract',
        verifiedBy:
          'menu keyboard suites and component-local tests for any optional interaction the owner adopts',
        reason:
          'This contract covers direct-group Space and directional arrows. DropdownMenu radio movement belongs to Menu. Home and End are not required by the APG radio-group pattern and no current Astryx record adopts them as shared radio-group behavior.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          'component forced-colors suites and manual Windows High Contrast review',
        reason:
          'Forced-colors output is a paint result rather than semantic or interaction evidence.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          'component transition tests and the repository visual gate under reduced motion',
        reason:
          'Motion is a rendered result over time and is not intrinsic to radio-group semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy:
          'the repository i18n catalog check and review of component-authored accessibility strings',
        reason:
          'Translation is a source-level concern that rendered semantics alone cannot distinguish.',
      },
    },
  });
