// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Slider pattern's role, value, name, orientation, and keyboard requirements
 * @output SLIDER_PATTERN — the reusable contract a slider thumb binds to when it adopts the pattern (Slider under component:Slider AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by Slider per thumb
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/slider/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const apgReq = (requirement: string, anchor: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'slider',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteraction';
const APG_ROLE = apgReq(
  'The element serving as the focusable slider control has role slider.',
  A,
);
const APG_VALUES = apgReq(
  'The slider element has the aria-valuenow property set to a decimal value representing the current value of the slider. The slider element has the aria-valuemin property set to a decimal value representing the minimum allowed value of the slider. The slider element has the aria-valuemax property set to a decimal value representing the maximum allowed value of the slider.',
  A,
);
const APG_VALUETEXT = apgReq(
  'If the value of aria-valuenow is not user-friendly, the aria-valuetext property is set to a string that makes the slider value understandable.',
  A,
);
const APG_NAME = apgReq(
  'If the slider has a visible label, it is referenced by aria-labelledby on the slider element. Otherwise, the slider element has a label provided by aria-label.',
  A,
);
const APG_ORIENTATION = apgReq(
  'If the slider is vertically oriented, it has aria-orientation set to vertical. The default value of aria-orientation for a slider is horizontal.',
  A,
);
const APG_ARROWS = apgReq(
  'Right Arrow: Increase the value of the slider by one step. Up Arrow: Increase the value of the slider by one step. Left Arrow: Decrease the value of the slider by one step. Down Arrow: Decrease the value of the slider by one step.',
  K,
);
const APG_HOME_END = apgReq(
  'Home: Set the slider to the first allowed value in its range. End: Set the slider to the last allowed value in its range.',
  K,
);
const APG_PAGE = apgReq(
  'Page Up (Optional): Increase the slider value by an amount larger than the step change made by Up Arrow. Page Down (Optional): Decrease the slider value by an amount larger than the step change made by Down Arrow.',
  K,
);
const SLIDER_AR1: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Slider',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/250fd9ac197381ec06900279efc31cbb03544ca9/packages/core/src/Slider/Slider.spec.md#L120-L133',
  requirement:
    "On a horizontal track the horizontal arrows follow the track's direction — under RTL ArrowLeft increases and ArrowRight decreases; PageUp and PageDown step by ten steps; Home moves to `min` and End to `max`.",
};
const APG_REVERSED = apgReq(
  'In some circumstances, reversing the direction of the value change for the keys specified above could create a more intuitive experience.',
  K,
);

/**
 * What a binding knows about one slider thumb (the subject). Values are the
 * numbers the thumb exposes; `largeStep` is the Page key amount when the
 * binding ships Page keys; `valueText` is the formatted text when one is set.
 */
export interface SliderStateFacts {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly orientation: 'horizontal' | 'vertical';
  /** Whether the thumb sits on a right-to-left horizontal track (inline arrows follow the track). */
  readonly rtl: boolean;
  /** Whether the user is meant to be able to change the value. */
  readonly operable: boolean;
  /** Whether the thumb is meant to accept keyboard focus. */
  readonly focusable: boolean;
  /** The formatted value text the thumb exposes, or null when it exposes the number. */
  readonly valueText: string | null;
  /** The Page Up/Down amount, or null when the binding ships no Page keys. */
  readonly largeStep: number | null;
}

const ALWAYS = {
  condition: 'the binding designates a slider thumb',
  test: () => true,
};

async function numericAttribute(
  subject: Subject,
  name: string,
): Promise<number> {
  const raw = await subject.attribute(name);
  const parsed = raw == null ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is ${raw ?? 'absent'}, not a number`);
  }
  return parsed;
}

async function valueNow(subject: Subject): Promise<number> {
  return numericAttribute(subject, 'aria-valuenow');
}

function clampToStep(
  target: number,
  facts: Pick<SliderStateFacts, 'min' | 'max' | 'step'>,
): number {
  const steps = Math.round((target - facts.min) / facts.step);
  const snapped = facts.min + steps * facts.step;
  const rounded = Number(snapped.toFixed(10));
  return Math.min(facts.max, Math.max(facts.min, rounded));
}

async function focusOrFail(subject: Subject, forWhat: string): Promise<void> {
  await subject.focus();
  if (!(await subject.isFocused())) {
    throw new Error(
      `the slider thumb did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

async function expectValue(
  subject: Subject,
  expected: number,
  after: string,
): Promise<void> {
  const now = await valueNow(subject);
  if (Math.abs(now - expected) > 1e-9) {
    throw new Error(`${after} left aria-valuenow at ${now}, not ${expected}`);
  }
}

export const SLIDER_PATTERN: PatternContract<SliderStateFacts> =
  definePattern<SliderStateFacts>({
    pattern: 'slider',
    url: APG_URL,
    scope:
      "A slider thumb's role and name, its now/min/max values and optional value text, its orientation, and the arrow, Page, Home and End keys — with the horizontal arrows following the track's direction under right-to-left.",
    expectations: [
      {
        id: 'slider.thumb.role-and-name',
        outcome:
          'The browser exposes the thumb as a named slider, so a user hears what value they are changing.',
        sources: [WCAG_4_1_2, APG_ROLE, APG_NAME],
        covers: [
          '4.1.2-name-role-value',
          '2.4.6-headings-and-labels',
          'apg-interaction',
        ],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'slider') {
            throw new Error(
              `the browser exposes this thumb as ${role == null ? 'no role' : `"${role}"`}, not as a slider`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this thumb',
            );
          }
        },
      },
      {
        id: 'slider.thumb.value-properties',
        outcome:
          'The thumb states its current value and its bounds, so a user hears where they are in the range.',
        sources: [WCAG_4_1_2, APG_VALUES],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const now = await valueNow(subject);
          const min = await numericAttribute(subject, 'aria-valuemin');
          const max = await numericAttribute(subject, 'aria-valuemax');
          if (now !== facts.value || min !== facts.min || max !== facts.max) {
            throw new Error(
              `the thumb exposes now/min/max ${now}/${min}/${max}, not ${facts.value}/${facts.min}/${facts.max}`,
            );
          }
          if (now < min || now > max) {
            throw new Error(
              'aria-valuenow lies outside aria-valuemin..aria-valuemax',
            );
          }
        },
      },
      {
        id: 'slider.thumb.value-text',
        outcome:
          'A formatted value is spoken as that text, not as the raw number.',
        sources: [WCAG_4_1_2, APG_VALUETEXT],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding formats the value',
          test: facts => facts.valueText != null,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const text = await subject.attribute('aria-valuetext');
          if (text !== facts.valueText) {
            throw new Error(
              `aria-valuetext is ${text ?? 'absent'}, not "${facts.valueText}"`,
            );
          }
        },
      },
      {
        id: 'slider.thumb.orientation',
        outcome:
          'A vertical slider says so, so a user knows which arrows move it along the track.',
        sources: [WCAG_4_1_2, APG_ORIENTATION],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const orientation = await subject.attribute('aria-orientation');
          if (facts.orientation === 'vertical' && orientation !== 'vertical') {
            throw new Error(
              `a vertical thumb has aria-orientation ${orientation ?? 'absent'}`,
            );
          }
          if (
            facts.orientation === 'horizontal' &&
            orientation != null &&
            orientation !== 'horizontal'
          ) {
            throw new Error(
              `a horizontal thumb claims aria-orientation="${orientation}"`,
            );
          }
        },
      },
      {
        id: 'slider.keys.arrows-step',
        outcome:
          "The inline-forward arrow and Up raise the value by one step, the inline-back arrow and Down lower it, and on a right-to-left track the horizontal arrows follow the track's direction.",
        sources: [WCAG_2_1_1, APG_ARROWS, APG_REVERSED, SLIDER_AR1],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the thumb can be changed and focused',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const up = clampToStep(facts.value + facts.step, facts);
          const down = clampToStep(facts.value - facts.step, facts);
          await focusOrFail(subject, 'the arrow keys');
          if (facts.orientation === 'horizontal') {
            const forward = facts.rtl ? 'ArrowLeft' : 'ArrowRight';
            const back = facts.rtl ? 'ArrowRight' : 'ArrowLeft';
            await harness.press(forward);
            await expectValue(subject, up, `${forward} (inline forward)`);
            await harness.press(back);
            await expectValue(subject, facts.value, `${back} (inline back)`);
          }
          await harness.press('ArrowUp');
          await expectValue(subject, up, 'ArrowUp');
          await harness.press('ArrowDown');
          await expectValue(subject, facts.value, 'ArrowDown');
          await harness.press('ArrowDown');
          await expectValue(subject, down, 'ArrowDown a second time');
        },
      },
      {
        id: 'slider.keys.page',
        outcome:
          'Page Up and Page Down move the value by a larger amount than one step.',
        sources: [WCAG_2_1_1, APG_PAGE, SLIDER_AR1],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding ships Page keys and the thumb can be changed and focused',
          test: facts =>
            facts.largeStep != null && facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const large = facts.largeStep ?? 0;
          await focusOrFail(subject, 'the Page keys');
          await harness.press('PageUp');
          await expectValue(
            subject,
            clampToStep(facts.value + large, facts),
            'PageUp',
          );
          await harness.press('PageDown');
          await expectValue(subject, facts.value, 'PageDown');
        },
      },
      {
        id: 'slider.keys.home-end',
        outcome: 'Home sets the minimum and End sets the maximum.',
        sources: [WCAG_2_1_1, APG_HOME_END, SLIDER_AR1],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the thumb can be changed and focused',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'Home and End');
          await harness.press('Home');
          await expectValue(subject, facts.min, 'Home');
          await harness.press('End');
          await expectValue(subject, facts.max, 'End');
        },
      },
      {
        id: 'slider.thumb.unavailable-keeps-value',
        outcome:
          'An unavailable thumb that still takes focus keeps its value on every key, so a disabled slider never changes under the keyboard.',
        sources: [WCAG_4_1_2, APG_ARROWS],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the thumb cannot be changed but can receive focus',
          test: facts => !facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          if ((await subject.attribute('aria-disabled')) !== 'true') {
            throw new Error(
              'an unavailable thumb does not carry aria-disabled="true"',
            );
          }
          await focusOrFail(subject, 'the keys');
          for (const key of ['ArrowRight', 'ArrowUp', 'Home', 'End'] as const) {
            await harness.press(key);
            await expectValue(
              subject,
              facts.value,
              `${key} on an unavailable thumb`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          "This contract owns the thumb's semantics and keys. Tick marks and any icon the binding paints are binding composition.",
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's range-group, label and description association tests",
        reason:
          "A range slider's group, its label, and any description or status text are the binding's relationships, proven by its own tests.",
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's DOM-order tests and page-level reading-order review",
        reason:
          'Where the slider, its label and its value sit relative to surrounding content is composition.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'A slider collects a value, not information about the user that autofill could supply.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's filled-range, marks and disabled state tests plus rendered review",
        reason:
          'Filled range, marks and disabled cues are paint results owned by the binding and theme; this contract proves the programmatic value.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'Label and mark text contrast is a paint outcome owned by the binding and theme.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the thumb, track and focus indicator',
        reason:
          'Thumb, track and focus indicator contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          "This contract encodes the thumb's arrow, Page, Home and End keys. Reaching the thumb and other page keyboard paths remain with the composition.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy: "the component's Tab tests and page-level keyboard review",
        reason:
          'A slider thumb adds no focus trap; Tab entry and exit are generic focus behavior.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A slider rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          "The thumb's place among surrounding controls, and the order of two range thumbs, depend on composition.",
      },
      '2.4.4-link-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'A slider renders no link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'This contract proves the thumb has a name; whether that label is descriptive is caller content.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's focus-outline tests and rendered focus review",
        reason:
          "The focused thumb's indicator is a paint result owned by the binding and theme.",
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level layout review',
        reason:
          'Whether another surface covers the focused thumb depends on composition.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy: "the component's pointer drag and release tests",
        reason:
          "A slider changes value through the drag itself; the pointer model is the binding's and outside this keyboard contract.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's accessible-name tests",
        reason:
          "Whether the thumb's accessible name contains the visible label is the binding's naming requirement.",
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over the thumb",
        reason:
          "The thumb's hit area is geometry owned by the binding and theme.",
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A slider owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy: 'integration review of what a caller does with onChange',
        reason:
          "Changing the value is the slider's own purpose; any context change a caller makes on change is the caller's action.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing page',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated slider labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated slider.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component',
        verifiedBy:
          "the component's status tests (aria-invalid and the status text association)",
        reason:
          "An error status on a slider is the binding's status composition, outside this pattern.",
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's label and description tests",
        reason:
          "This contract proves the thumb is named; help text and its association are the binding's.",
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component',
        verifiedBy: "the component's range-group and status tests",
        reason:
          "This contract encodes the thumb's role, name, values, text, orientation and disabled state. A range slider's group semantics and aria-invalid are the binding's.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken or braille output',
        reason:
          'A value change is not a status-message contract, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: "the binding component's record",
        verifiedBy:
          'component:Slider AR1 and DEC-2, which adopt the pattern per thumb and the reversed inline arrows under RTL',
        reason:
          "This contract encodes the slider role, values, name, orientation and keys. The pointer drag model and a range's two-thumb separation are the binding's.",
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
          'Thumb and fill motion is binding-specific paint over time and is not part of slider semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          'The slider contract introduces no string; the label and value text come from the binding or caller.',
      },
    },
  });
