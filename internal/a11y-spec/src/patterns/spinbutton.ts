// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spinbutton.ts
 * @input Uses the shared accessibility contract vocabulary
 * @output SPINBUTTON_PATTERN and SpinbuttonStateFacts
 * @position Reusable semantic and keyboard contract for numeric spinbuttons.
 *
 * The required slice covers role, name, committed value, bounds, availability,
 * read-only exposure, and keyboard entry/exit. Arrow stepping is exercised as
 * advisory APG behavior until a current Astryx component record adopts it.
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

function wcag(
  id: string,
  name: string,
  level: 'A' | 'AA',
  slug: string,
): WcagCriterion {
  return {
    standard: 'wcag',
    id,
    name,
    level,
    url: `${UNDERSTANDING}/${slug}.html`,
  };
}

const WCAG_1_3_1 = wcag(
  '1.3.1',
  'Info and Relationships',
  'A',
  'info-and-relationships',
);
const WCAG_2_1_1 = wcag('2.1.1', 'Keyboard', 'A', 'keyboard');
const WCAG_2_1_2 = wcag('2.1.2', 'No Keyboard Trap', 'A', 'no-keyboard-trap');
const WCAG_2_4_6 = wcag(
  '2.4.6',
  'Headings and Labels',
  'AA',
  'headings-and-labels',
);
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

function apg(requirement: string): ApgRequirement {
  return {standard: 'apg', pattern: 'spinbutton', requirement, url: APG_URL};
}

const APG_ARROW_UP = apg('Up Arrow increases the value.');
const APG_ARROW_DOWN = apg('Down Arrow decreases the value.');
const APG_NOT_FORMALLY_ADOPTED =
  'NumberInput currently implements this APG mechanic, but no current component record adopts it as a reusable required gate.';
const TAB_BUDGET = 10;

export interface SpinbuttonStateFacts {
  readonly value: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly valueText: string | null;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly focusable: boolean;
  readonly stepUpValue: number | null;
  readonly stepDownValue: number | null;
}

const ALWAYS = {
  condition: 'the binding renders a numeric spinbutton',
  test: () => true,
};

export const SPINBUTTON_PATTERN: PatternContract<SpinbuttonStateFacts> =
  definePattern<SpinbuttonStateFacts>({
    pattern: 'spinbutton',
    url: APG_URL,
    scope:
      'One labelled numeric spinbutton and its committed value, optional bounds, availability, read-only state, keyboard reachability, and currently implemented arrow stepping.',
    expectations: [
      {
        id: 'spinbutton.identity.exposed',
        outcome:
          'The browser exposes a named spinbutton so the user knows what numeric value it edits.',
        sources: [WCAG_4_1_2, WCAG_2_4_6],
        covers: ['4.1.2-name-role-value', '2.4.6-headings-and-labels'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'spinbutton') {
            throw new Error(
              `the browser exposes ${role == null ? 'no role' : `"${role}"`} instead of spinbutton`,
            );
          }
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this spinbutton',
            );
          }
        },
      },
      {
        id: 'spinbutton.label.persistently-associated',
        outcome:
          'The spinbutton keeps a persistent programmatic label rather than relying on placeholder text.',
        sources: [WCAG_1_3_1, WCAG_2_4_6],
        covers: ['1.3.1-info-and-relationships', '2.4.6-headings-and-labels'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const label = await subject.labelText();
          if (label == null || label.trim() === '') {
            throw new Error(
              'the spinbutton has no persistent label relationship',
            );
          }
        },
      },
      {
        id: 'spinbutton.value.exposed',
        outcome:
          'The browser exposes the committed numeric value, not an uncommitted edit.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding has a committed value',
          test: facts => facts.value != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {rangeValue} = await subject.computed();
          if (rangeValue !== facts.value) {
            throw new Error(
              `the binding commits ${facts.value}, but the browser exposes ${rangeValue ?? 'no numeric value'}`,
            );
          }
        },
      },
      {
        id: 'spinbutton.value.empty',
        outcome:
          'An empty spinbutton does not advertise a stale committed numeric value.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding has no committed value',
          test: facts => facts.value == null,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const value = await subject.attribute('aria-valuenow');
          if (value != null) {
            throw new Error(
              `the empty spinbutton advertises stale aria-valuenow="${value}"`,
            );
          }
        },
      },
      {
        id: 'spinbutton.bounds.exposed',
        outcome:
          'The browser exposes each numeric bound supplied by the binding.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding supplies a minimum or maximum',
          test: facts => facts.min != null || facts.max != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {rangeMin, rangeMax} = await subject.computed();
          if (rangeMin !== facts.min || rangeMax !== facts.max) {
            throw new Error(
              `the binding declares bounds ${facts.min ?? 'none'}..${facts.max ?? 'none'}, but the browser exposes ${rangeMin ?? 'none'}..${rangeMax ?? 'none'}`,
            );
          }
        },
      },
      {
        id: 'spinbutton.value-text.exposed',
        outcome:
          'A formatted committed value remains available as the spinbutton value text.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding supplies formatted value text',
          test: facts => facts.valueText != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {valueText} = await subject.computed();
          if (valueText !== facts.valueText) {
            throw new Error(
              `the binding formats the value as "${facts.valueText}", but the browser exposes ${valueText == null ? 'no value text' : `"${valueText}"`}`,
            );
          }
        },
      },
      {
        id: 'spinbutton.disabled.exposed',
        outcome:
          'A spinbutton the binding marks unavailable is exposed as disabled.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state unavailable',
          test: facts => facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {disabled} = await subject.computed();
          if (!disabled) {
            throw new Error(
              'the binding declares this spinbutton disabled, but the browser exposes it as available',
            );
          }
        },
      },
      {
        id: 'spinbutton.available.not-disabled',
        outcome:
          'An available spinbutton does not expose a false disabled state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state available',
          test: facts => !facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {disabled} = await subject.computed();
          if (disabled) {
            throw new Error(
              'this spinbutton is available, but the browser exposes it as disabled',
            );
          }
        },
      },
      {
        id: 'spinbutton.readonly.exposed',
        outcome: 'A read-only spinbutton is exposed as read-only.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state read-only and available',
          test: facts => facts.readOnly && !facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {readOnly} = await subject.computed();
          if (readOnly !== true) {
            throw new Error(
              'the binding declares this spinbutton read-only, but the browser does not expose read-only state',
            );
          }
        },
      },
      {
        id: 'spinbutton.keyboard.reachable-and-escapable',
        outcome:
          'Keyboard focus can reach the spinbutton and leave it without a trap.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition: 'the binding declares the spinbutton focusable',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await harness.resetFocus();
          for (
            let index = 0;
            index < TAB_BUDGET && !(await subject.isFocused());
            index += 1
          ) {
            await harness.press('Tab');
          }
          if (!(await subject.isFocused())) {
            throw new Error(
              `${TAB_BUDGET} presses of Tab never reached the spinbutton`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error('Tab did not leave the spinbutton');
          }
        },
      },
      {
        id: 'spinbutton.keyboard.arrow-up',
        outcome:
          'Up Arrow increases the committed value when stepping is available.',
        sources: [APG_ARROW_UP],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 by keeping the currently implemented stepping function keyboard-operable.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding supplies an enabled upward step',
          test: facts => facts.stepUpValue != null,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'advisory',
        advisoryBecause: APG_NOT_FORMALLY_ADOPTED,
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          await harness.press('ArrowUp');
          const {rangeValue} = await subject.computed();
          if (rangeValue !== facts.stepUpValue) {
            throw new Error(
              `Up Arrow should expose ${facts.stepUpValue}, but the browser exposes ${rangeValue ?? 'no numeric value'}`,
            );
          }
        },
      },
      {
        id: 'spinbutton.keyboard.arrow-down',
        outcome:
          'Down Arrow decreases the committed value when stepping is available.',
        sources: [APG_ARROW_DOWN],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 by keeping the currently implemented stepping function keyboard-operable.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding supplies an enabled downward step',
          test: facts => facts.stepDownValue != null,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'advisory',
        advisoryBecause: APG_NOT_FORMALLY_ADOPTED,
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          await harness.press('ArrowDown');
          const {rangeValue} = await subject.computed();
          if (rangeValue !== facts.stepDownValue) {
            throw new Error(
              `Down Arrow should expose ${facts.stepDownValue}, but the browser exposes ${rangeValue ?? 'no numeric value'}`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'NumberInput icon and caller content',
        verifiedBy: 'Component axe and content review',
        reason:
          'The spinbutton semantic contract does not own decorative or informative graphics.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'Field and InputGroup composition',
        verifiedBy: 'Component relationship tests and axe',
        reason:
          'This contract checks the persistent label; descriptions and group composition remain local.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'Field composition and caller layout',
        verifiedBy: 'Component DOM order and browser review',
        reason:
          'One role-bearing control does not establish the surrounding reading sequence.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'Caller form purpose',
        verifiedBy: 'Autocomplete and form review',
        reason:
          'A numeric widget cannot infer whether it collects a listed personal-information purpose.',
      },
      '1.4.1-use-of-color': {
        owner: 'Field status and theme',
        verifiedBy: 'Component status tests and visual review',
        reason:
          'Programmatic value state does not prove non-color visual cues.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'NumberInput themes',
        verifiedBy: 'Contrast audit',
        reason: 'Contrast requires rendered pixels.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'NumberInput themes and focus styling',
        verifiedBy: 'Contrast and visual audit',
        reason: 'Semantic state does not prove painted control contrast.',
      },
      '2.4.2-page-titled': {
        owner: 'Page shell',
        verifiedBy: 'Page-level review',
        reason: 'A spinbutton does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'Field composition and caller layout',
        verifiedBy: 'Real-browser form-flow review',
        reason:
          'Reachability and escape do not determine the surrounding task order.',
      },
      '2.4.4-link-purpose': {
        owner: 'Link and caller content',
        verifiedBy: 'Navigation review',
        reason: 'A spinbutton edits a value and is not a link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller label wording',
        verifiedBy: 'Content review',
        reason:
          'The contract proves a label exists, not that its wording is descriptive.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'NumberInput theme and interaction-modality system',
        verifiedBy: 'Rendered keyboard-focus review',
        reason: 'Focus-ring paint requires visual evidence.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'Caller layout',
        verifiedBy: 'Constrained-viewport browser review',
        reason: 'Occlusion depends on surrounding content.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'NumberInput stepper and Field controls',
        verifiedBy: 'Component pointer suites',
        reason:
          'The subject is a text-editing control; adjacent buttons retain their own pointer contract.',
      },
      '2.5.3-label-in-name': {
        owner: 'Field rendering and caller label',
        verifiedBy: 'Visible-label versus computed-name browser review',
        reason:
          'This first slice proves persistent naming without making a visible-label pixel claim.',
      },
      '2.5.8-target-size': {
        owner: 'NumberInput theme and composed buttons',
        verifiedBy: 'Browser geometry audit',
        reason: 'Target size requires rendered geometry.',
      },
      '3.1.1-language-of-page': {
        owner: 'Page shell and localization provider',
        verifiedBy: 'Document-language checks',
        reason: 'The spinbutton does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'NumberInput commit policy and caller response',
        verifiedBy: 'Component commit tests and task review',
        reason:
          'The shared pattern does not decide application context changes.',
      },
      '3.2.4-consistent-identification': {
        owner: 'Design system and caller content',
        verifiedBy: 'Cross-control review',
        reason:
          'One fixture cannot establish consistency across an application.',
      },
      '3.3.1-error-identification': {
        owner: 'NumberInput validation and status-message owners',
        verifiedBy:
          'Existing invalid-draft and status tests; AST-009 for announcements',
        reason:
          'Parsing, error text, and announcement behavior remain component-local.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'Field and caller instructions',
        verifiedBy: 'Field-label and form-content review',
        reason:
          'A persistent label does not establish every instruction needed by the task.',
      },
      '4.1.3-status-messages': {
        owner: 'Status-message contract and NumberInput invalid feedback',
        verifiedBy: 'Component status tests; AST-009 for speech and timing',
        reason: 'Static spinbutton semantics do not own announcement timing.',
      },
      'apg-interaction': {
        owner: 'Current NumberInput interaction authority',
        verifiedBy: 'Advisory arrow-key contract and component stepping tests',
        reason:
          'Arrow stepping is observed, while PageUp, PageDown, Home, and End remain optional APG mechanics not adopted by current Astryx authority.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'NumberInput themes',
        verifiedBy: 'Real-browser forced-color review',
        reason: 'Semantic state does not prove painted control visibility.',
      },
      'reduced-motion': {
        owner: 'NumberInput and adjacent overlay owners',
        verifiedBy: 'Component motion review',
        reason: 'This semantic and keyboard slice owns no animation.',
      },
      'at-facing-strings': {
        owner: 'NumberInput localization and caller labels',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'The binding uses deterministic labels without claiming spoken output.',
      },
    },
  });
