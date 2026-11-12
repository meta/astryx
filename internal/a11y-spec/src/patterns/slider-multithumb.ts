// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider-multithumb.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Slider (Multi-Thumb) pattern's thumb, dependent-bound, and Tab-order requirements
 * @output SLIDER_MULTITHUMB_PATTERN — the reusable contract a two-thumb slider binds to when it adopts the pattern (Slider range mode under component:Slider AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by Slider in range mode, next to SLIDER_PATTERN bound per thumb
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

/** The binding's name for the thumb that sets the upper value. */
export const UPPER_THUMB = 'upper-thumb';

const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_2_4_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.4.3',
  name: 'Focus Order',
  level: 'A',
  url: `${UNDERSTANDING}/focus-order.html`,
};
const WCAG_2_4_6: WcagCriterion = {
  standard: 'wcag',
  id: '2.4.6',
  name: 'Headings and Labels',
  level: 'AA',
  url: `${UNDERSTANDING}/headings-and-labels.html`,
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
  pattern: 'slider-multithumb',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteraction';
const APG_ROLE = apgReq(
  'Each element serving as a focusable slider thumb has role slider.',
  A,
);
const APG_NAME = apgReq(
  'If a slider has a visible label, it is referenced by aria-labelledby on the slider element. Otherwise, the slider element has a label provided by aria-label.',
  A,
);
const APG_DEPENDENT_BOUNDS = apgReq(
  'When the range (e.g. minimum and/or maximum value) of another slider is dependent on the current value of a slider, the values of aria-valuemin or aria-valuemax of the dependent sliders are updated when the value changes.',
  A,
);
const APG_TAB_ORDER = apgReq(
  'Each thumb is in the page tab sequence and has the keyboard interactions described in the Slider Pattern. The tab order remains constant regardless of thumb value and visual position within the slider.',
  K,
);
const SLIDER_AR1: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Slider',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/daa239e981898df414257d2530732b8e32a4b446/docs/specs/components/Slider/Slider.spec.md#L167-L177',
  requirement:
    'Slider adopts the APG Slider pattern, each thumb as one composite control: every thumb is `role="slider"` with an accessible name (a range names each thumb), `aria-valuemin`, `aria-valuemax`, `aria-valuenow` […]; every thumb is a Tab stop, enabled or disabled. […] In a range, a thumb never crosses the other past the minimum separation.',
};

/**
 * What a binding knows about one two-thumb slider. The subject is the lower
 * thumb; the binding names the upper thumb `UPPER_THUMB`. `separation` is the
 * smallest gap the thumbs keep, in value units.
 */
export interface SliderMultithumbStateFacts {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly lower: number;
  readonly upper: number;
  readonly separation: number;
  /** Whether the user is meant to be able to change the values. */
  readonly operable: boolean;
  /** Whether each thumb is meant to accept keyboard focus. */
  readonly focusable: boolean;
}

interface Thumbs {
  readonly lower: Subject;
  readonly upper: Subject;
}

async function thumbs(harness: Harness, subject: Subject): Promise<Thumbs> {
  return {lower: subject, upper: await harness.related(UPPER_THUMB)};
}

async function numericAttribute(
  thumb: Subject,
  which: string,
  name: string,
): Promise<number> {
  const raw = await thumb.attribute(name);
  const parsed = raw == null ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `the ${which} thumb's ${name} is ${raw ?? 'absent'}, not a number`,
    );
  }
  return parsed;
}

async function expectBounds(
  thumb: Subject,
  which: string,
  expected: {now: number; min: number; max: number},
  after: string,
): Promise<void> {
  const now = await numericAttribute(thumb, which, 'aria-valuenow');
  const min = await numericAttribute(thumb, which, 'aria-valuemin');
  const max = await numericAttribute(thumb, which, 'aria-valuemax');
  if (now !== expected.now || min !== expected.min || max !== expected.max) {
    throw new Error(
      `${after}, the ${which} thumb exposes now/min/max ${now}/${min}/${max}, not ${expected.now}/${expected.min}/${expected.max}`,
    );
  }
}

async function expectValue(
  thumb: Subject,
  which: string,
  expected: number,
  after: string,
): Promise<void> {
  const now = await numericAttribute(thumb, which, 'aria-valuenow');
  if (Math.abs(now - expected) > 1e-9) {
    throw new Error(
      `${after} left the ${which} thumb's aria-valuenow at ${now}, not ${expected}`,
    );
  }
}

async function focusOrFail(
  thumb: Subject,
  which: string,
  forWhat: string,
): Promise<void> {
  await thumb.focus();
  if (!(await thumb.isFocused())) {
    throw new Error(
      `the ${which} thumb did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

const OPERABLE = {
  condition: 'the thumbs can be changed and focused',
  test: (facts: SliderMultithumbStateFacts) =>
    facts.operable && facts.focusable,
};

export const SLIDER_MULTITHUMB_PATTERN: PatternContract<SliderMultithumbStateFacts> =
  definePattern<SliderMultithumbStateFacts>({
    pattern: 'slider-multithumb',
    url: APG_URL,
    scope:
      "What two thumbs on one slider owe each other: a distinct name for each, bounds that follow the other thumb's value and update when it moves, no crossing past the separation, and a Tab order that never changes. Each thumb's own role, values and keys are SLIDER_PATTERN's.",
    expectations: [
      {
        id: 'slider-multithumb.thumbs.distinct-names',
        outcome:
          'The browser exposes both thumbs as sliders with different names, so a user can tell the lower thumb from the upper one.',
        sources: [WCAG_4_1_2, WCAG_2_4_6, APG_ROLE, APG_NAME, SLIDER_AR1],
        covers: [
          '4.1.2-name-role-value',
          '2.4.6-headings-and-labels',
          'apg-interaction',
        ],
        appliesWhen: {
          condition: 'the binding designates two slider thumbs',
          test: () => true,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const {lower, upper} = await thumbs(harness, subject);
          const names: string[] = [];
          for (const [which, thumb] of [
            ['lower', lower],
            ['upper', upper],
          ] as const) {
            const {role, name} = await thumb.computed();
            if (role !== 'slider') {
              throw new Error(
                `the browser exposes the ${which} thumb as ${role == null ? 'no role' : `"${role}"`}, not as a slider`,
              );
            }
            if (!name || name.trim() === '') {
              throw new Error(
                `the browser computes no accessible name for the ${which} thumb`,
              );
            }
            names.push(name.trim());
          }
          if (names[0] === names[1]) {
            throw new Error(
              `both thumbs are named "${names[0]}", so a user cannot tell them apart`,
            );
          }
        },
      },
      {
        id: 'slider-multithumb.bounds.follow-other-thumb',
        outcome:
          "Each thumb's bounds stop at the other thumb, so a user hears how far that thumb can actually move.",
        sources: [WCAG_4_1_2, APG_DEPENDENT_BOUNDS, SLIDER_AR1],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding designates two slider thumbs',
          test: () => true,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {lower, upper} = await thumbs(harness, subject);
          await expectBounds(
            lower,
            'lower',
            {
              now: facts.lower,
              min: facts.min,
              max: facts.upper - facts.separation,
            },
            'before any key',
          );
          await expectBounds(
            upper,
            'upper',
            {
              now: facts.upper,
              min: facts.lower + facts.separation,
              max: facts.max,
            },
            'before any key',
          );
        },
      },
      {
        id: 'slider-multithumb.bounds.update-on-change',
        outcome:
          "When one thumb moves, the other thumb's bound moves with it, so the range a user hears is never stale.",
        sources: [WCAG_4_1_2, APG_DEPENDENT_BOUNDS, SLIDER_AR1],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the thumbs can be changed and focused, with room for one step each toward the other',
          test: facts =>
            OPERABLE.test(facts) &&
            facts.lower + 2 * facts.step + facts.separation <= facts.upper,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {lower, upper} = await thumbs(harness, subject);
          await focusOrFail(lower, 'lower', 'the arrow keys');
          await harness.press('ArrowUp');
          await expectBounds(
            upper,
            'upper',
            {
              now: facts.upper,
              min: facts.lower + facts.step + facts.separation,
              max: facts.max,
            },
            'after ArrowUp on the lower thumb',
          );
          await focusOrFail(upper, 'upper', 'the arrow keys');
          await harness.press('ArrowDown');
          await expectBounds(
            lower,
            'lower',
            {
              now: facts.lower + facts.step,
              min: facts.min,
              max: facts.upper - facts.step - facts.separation,
            },
            'after ArrowDown on the upper thumb',
          );
        },
      },
      {
        id: 'slider-multithumb.keys.no-crossing',
        outcome:
          'End on the lower thumb and Home on the upper thumb stop at the other thumb, so a range never turns inside out.',
        sources: [SLIDER_AR1, WCAG_2_1_1, APG_DEPENDENT_BOUNDS],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: OPERABLE,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {lower, upper} = await thumbs(harness, subject);
          await focusOrFail(lower, 'lower', 'End');
          await harness.press('End');
          await expectValue(
            lower,
            'lower',
            facts.upper - facts.separation,
            'End on the lower thumb',
          );
          await expectValue(
            upper,
            'upper',
            facts.upper,
            'End on the lower thumb',
          );
          await harness.press('Home');
          await expectValue(
            lower,
            'lower',
            facts.min,
            'Home on the lower thumb',
          );
          await focusOrFail(upper, 'upper', 'Home');
          await harness.press('Home');
          await expectValue(
            upper,
            'upper',
            facts.min + facts.separation,
            'Home on the upper thumb',
          );
          await expectValue(
            lower,
            'lower',
            facts.min,
            'Home on the upper thumb',
          );
        },
      },
      {
        id: 'slider-multithumb.tab-order.constant',
        outcome:
          'Tab goes from the lower thumb to the upper thumb, also after the lower thumb moves up to the upper one, so a keyboard user always meets the thumbs in the same order.',
        sources: [WCAG_2_4_3, APG_TAB_ORDER, SLIDER_AR1],
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition: 'the thumbs can receive focus',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {lower, upper} = await thumbs(harness, subject);
          const tabFromLower = async (after: string) => {
            await focusOrFail(lower, 'lower', 'Tab');
            await harness.press('Tab');
            if (!(await upper.isFocused())) {
              throw new Error(
                `${after}, Tab from the lower thumb does not reach the upper thumb`,
              );
            }
          };
          await tabFromLower('before any key');
          if (facts.operable) {
            await focusOrFail(lower, 'lower', 'End');
            await harness.press('End');
            await tabFromLower(
              'after End moves the lower thumb up to the upper one',
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
          'This contract owns what the two thumbs owe each other. Tick marks and any icon the binding paints are binding composition.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's range-group, label and description association tests",
        reason:
          "The group around the thumbs, its label, and any description or status text are the binding's relationships, proven by its own tests.",
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's DOM-order tests and page-level reading-order review",
        reason:
          'Where the slider, its label and its values sit relative to surrounding content is composition.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'A slider collects values, not information about the user that autofill could supply.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's filled-range, marks and disabled state tests plus rendered review",
        reason:
          'The filled range between the thumbs and the disabled cues are paint results owned by the binding and theme.',
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
          'the repository axe audit plus rendered review of the thumbs, track and focus indicator',
        reason:
          'Thumb, track and focus indicator contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'SLIDER_PATTERN, bound per thumb, and the composing page',
        verifiedBy:
          "the binding's SLIDER_PATTERN run over each thumb and page-level keyboard review",
        reason:
          "This contract encodes only the keys' effect across thumbs. Each thumb's arrow, Page, Home and End keys are SLIDER_PATTERN's; reaching the slider is the page's.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy: "the component's Tab tests and page-level keyboard review",
        reason:
          'Two thumbs add no focus trap; Tab entry into and exit from the slider are generic focus behavior.',
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
          "This contract proves the order of the two thumbs. The slider's place among surrounding controls depends on composition.",
        coversRemainderOnly: true,
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
          'This contract proves the thumbs have different names; whether the label they compose with is descriptive is caller content.',
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
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's coincident-thumb pointer tests and page-level layout review",
        reason:
          'Whether another surface covers the focused thumb depends on composition; two coincident thumbs drawn over each other are the binding geometry.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy: "the component's pointer drag and release tests",
        reason:
          "Which thumb a press takes and how a drag ends are the binding's pointer model, outside this keyboard and semantics contract.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's accessible-name tests",
        reason:
          "Whether each thumb's name contains the visible label it composes with is the binding's naming requirement.",
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule and the component's touch-target tests",
        reason:
          "The thumbs' hit areas, including how they share the gap between them, are geometry owned by the binding and theme.",
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
          "Changing the range is the slider's own purpose; any context change a caller makes on change is the caller's action.",
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
          "This contract proves the thumbs are named apart; help text and its association are the binding's.",
      },
      '4.1.2-name-role-value': {
        owner: 'SLIDER_PATTERN, bound per thumb, and the binding component',
        verifiedBy:
          "the binding's SLIDER_PATTERN run over each thumb and the component's range-group and status tests",
        reason:
          "This contract encodes the thumbs' roles, distinct names and dependent bounds. Each thumb's value text, orientation and disabled state are SLIDER_PATTERN's; the group and aria-invalid are the binding's.",
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
        owner: 'SLIDER_PATTERN and the binding component',
        verifiedBy:
          'the binding running SLIDER_PATTERN over each thumb, under component:Slider AR1',
        reason:
          "APG gives each thumb the Slider pattern's own interaction, which SLIDER_PATTERN encodes. This contract encodes only what the multi-thumb pattern adds.",
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
          'the repository i18n catalog check and source review of the thumb names',
        reason:
          'The contract introduces no string; the thumb names come from the binding catalog and the label from the caller.',
      },
    },
  });
