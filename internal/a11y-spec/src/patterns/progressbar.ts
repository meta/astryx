// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file progressbar.ts
 * @input WCAG 2.2 4.1.2 and the WAI-ARIA 1.2 progressbar role, value, value-text, and presentational-children requirements
 * @output PROGRESSBAR_PATTERN — the reusable contract one rendered progress indicator binds to, and the facts a binding declares for it
 * @position Pattern contract; bound by ProgressBar and Lab CircularProgress. The status-message contract keeps a progress update's exposure across transitions; this one owns each rendered state's identity.
 */

import {
  definePattern,
  type PatternContract,
  type WcagCriterion,
  type WebStandardRequirement,
} from '../contract';

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';
const ARIA = 'https://www.w3.org/TR/wai-aria-1.2';

const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};

const ARIA_PROGRESSBAR_NAME: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 progressbar role',
  requirement:
    'A progressbar is an element that displays the progress status for tasks that take a long time. Accessible Name Required: True.',
  url: `${ARIA}/#progressbar`,
};

const ARIA_PROGRESSBAR_VALUES: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 progressbar role',
  requirement:
    'The author SHOULD supply values for aria-valuenow, aria-valuemin, and aria-valuemax, unless the value is indeterminate, in which case the author SHOULD omit the aria-valuenow attribute.',
  url: `${ARIA}/#progressbar`,
};

const ARIA_VALUE_NOW: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 aria-valuenow property',
  requirement:
    'Authors MUST ensure aria-valuenow is greater than or equal to aria-valuemin and less than or equal to aria-valuemax.',
  url: `${ARIA}/#aria-valuenow`,
};

const ARIA_VALUE_TEXT: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 aria-valuetext property',
  requirement:
    'Defines the human-readable text alternative of aria-valuenow for a range widget.',
  url: `${ARIA}/#aria-valuetext`,
};

const ARIA_CHILDREN_PRESENTATIONAL: WebStandardRequirement = {
  standard: 'web-standard',
  specification:
    'WAI-ARIA 1.2 progressbar role (Children Presentational: True)',
  requirement:
    'The DOM descendants are presentational. User agents SHOULD NOT expose descendants of this element through the platform accessibility API.',
  url: `${ARIA}/#childrenArePresentational`,
};

/**
 * What a binding knows about one rendered progress indicator (the subject).
 * `value` is null while the amount of progress is unknown (indeterminate).
 * `valueText` is the formatted value the indicator speaks, or null when it
 * exposes the bare number.
 */
export interface ProgressbarStateFacts {
  /** The operation the indicator names. */
  readonly name: string;
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly valueText: string | null;
}

/**
 * Elements a keyboard user can land on. Inside a progressbar's presentational
 * subtree any of these takes focus while the platform hides what it is.
 */
const FOCUSABLE_DESCENDANT = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
]
  .map(selector => `:scope ${selector}`)
  .join(', ');

const ALWAYS = {
  condition: 'the binding designates a rendered progress indicator',
  test: () => true,
};

const DETERMINATE = {
  condition: 'the binding knows how much progress has been made',
  test: (facts: ProgressbarStateFacts) => facts.value != null,
};

export const PROGRESSBAR_PATTERN: PatternContract<ProgressbarStateFacts> =
  definePattern<ProgressbarStateFacts>({
    pattern: 'progressbar',
    url: `${ARIA}/#progressbar`,
    scope:
      "One rendered progress indicator's progressbar role and name, its value and range or its indeterminate state, its spoken value text, and a subtree that holds nothing a keyboard can land on. How the indicator stays exposed while progress updates belongs to the status-message contract.",
    expectations: [
      {
        id: 'progressbar.identity.role-and-name',
        outcome:
          'The browser exposes the indicator as a progress bar named for its operation, so a user hears what is progressing rather than a meter, a status, or an unnamed graphic.',
        sources: [WCAG_4_1_2, ARIA_PROGRESSBAR_NAME],
        covers: ['4.1.2-name-role-value', '2.4.6-headings-and-labels'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role, name} = await subject.computed();
          if (role !== 'progressbar') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this indicator, so assistive technology cannot tell it reports progress'
                : `the browser exposes this indicator as ${JSON.stringify(role)}, not as a progress bar`,
            );
          }
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this progress bar, so a user cannot tell which operation it reports',
            );
          }
          if (name.trim() !== facts.name.trim()) {
            throw new Error(
              `the browser names this progress bar ${JSON.stringify(name.trim())}, not the binding’s declared operation ${JSON.stringify(facts.name.trim())}`,
            );
          }
        },
      },
      {
        id: 'progressbar.determinate.value-and-range',
        outcome:
          'A progress bar that knows its progress exposes its current value inside its range, so a user hears how far the operation has come.',
        sources: [WCAG_4_1_2, ARIA_PROGRESSBAR_VALUES, ARIA_VALUE_NOW],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: DETERMINATE,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          if (facts.value == null) {
            return;
          }
          if (facts.min > facts.max) {
            throw new Error(
              `the binding declares a reversed progress range ${facts.min}..${facts.max}`,
            );
          }
          const {rangeValue, rangeMin, rangeMax} = await subject.computed();
          if (
            rangeValue !== facts.value ||
            rangeMin !== facts.min ||
            rangeMax !== facts.max
          ) {
            throw new Error(
              `the browser exposes value=${String(rangeValue)}, min=${String(rangeMin)}, max=${String(rangeMax)} instead of ${facts.value} in ${facts.min}..${facts.max}`,
            );
          }
          if (rangeValue < rangeMin || rangeValue > rangeMax) {
            throw new Error(
              `the browser exposes progress ${rangeValue} outside its range ${rangeMin}..${rangeMax}`,
            );
          }
        },
      },
      {
        id: 'progressbar.indeterminate.no-value-claimed',
        outcome:
          'A progress bar that does not know its progress claims no amount, so a user hears ongoing activity instead of a made-up percentage.',
        sources: [WCAG_4_1_2, ARIA_PROGRESSBAR_VALUES],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding does not know how much progress has been made',
          test: facts => facts.value == null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {rangeValue, valueText} = await subject.computed();
          if (rangeValue != null) {
            throw new Error(
              `the browser exposes progress value ${rangeValue} for an indicator whose progress is unknown`,
            );
          }
          if (valueText != null && valueText.trim() !== '') {
            throw new Error(
              `the browser exposes value text ${JSON.stringify(valueText)} for an indicator whose progress is unknown`,
            );
          }
        },
      },
      {
        id: 'progressbar.value.text-exposed',
        outcome:
          'A formatted progress value is spoken as that text, matching what a sighted user reads, not as a bare number.',
        sources: [WCAG_4_1_2, ARIA_VALUE_TEXT],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding knows its progress and speaks it as formatted text',
          test: facts => facts.value != null && facts.valueText != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {valueText} = await subject.computed();
          if ((valueText ?? '').trim() !== (facts.valueText ?? '').trim()) {
            throw new Error(
              valueText == null || valueText.trim() === ''
                ? `the browser exposes no value text, not the binding’s formatted ${JSON.stringify(facts.valueText)}`
                : `the browser exposes value text ${JSON.stringify(valueText)}, not the binding’s formatted ${JSON.stringify(facts.valueText)}`,
            );
          }
        },
      },
      {
        id: 'progressbar.subtree.no-focusable-descendants',
        outcome:
          'Nothing a keyboard can land on sits inside the progress bar, whose descendants the platform hides, so every focusable control keeps a role and a name.',
        sources: [WCAG_4_1_2, ARIA_CHILDREN_PRESENTATIONAL, WCAG_1_3_1],
        covers: ['4.1.2-name-role-value', '1.3.1-info-and-relationships'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const count = await subject.descendantCount(FOCUSABLE_DESCENDANT);
          if (count > 0) {
            throw new Error(
              `${count} focusable ${count === 1 ? 'element sits' : 'elements sit'} inside the progress bar, whose descendants the platform hides, so a keyboard user can land on a control with no exposed role or name`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's own tests for decorative track and fill parts plus the repository axe audit",
        reason:
          'The track, fill, and ring are drawn inside the presentational subtree; the progress bar itself carries the text alternative this contract checks.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the caller that loads a region of the page',
        verifiedBy:
          'integration review of aria-busy on the loading region and aria-describedby from it to the progress bar',
        reason:
          "This contract proves the progress bar's subtree holds no hidden controls. Pointing a loading region at the progress bar and marking the region busy is the caller's composition.",
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's label-order tests and page-level reading-order review",
        reason:
          'Where the label, value text, and indicator sit relative to surrounding content is layout and composition.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'A progress bar is read-only and collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's standalone completed-versus-remaining visual review",
        reason:
          'Distinguishing completed from remaining progress without color is a paint result outside this semantic contract.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'Label and value-text contrast depend on resolved theme pixels.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'rendered review of fill, track, and mark contrast across shipped themes',
        reason:
          'Fill and track contrast is a rendered-pixel outcome; this contract proves the programmatic value.',
      },
      '2.1.1-keyboard': {
        owner:
          'not applicable to the progress bar; any composed control keeps its own pattern',
        verifiedBy:
          "the composed control's own contract, such as a target mark's Tooltip binding",
        reason:
          'A progress bar is read-only, so it has no keyboard operation. A control rendered beside it, such as a target mark, is keyboard-operable under its own pattern.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          'A progress bar takes no focus and so cannot trap it; composed controls keep their own focus contracts.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A progress bar rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          'A progress bar is not a Tab stop; the order of controls around it is composition.',
      },
      '2.4.4-link-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'A progress bar renders no link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy: 'content review of the operation label',
        reason:
          'This contract proves the progress bar carries the declared name; whether that wording describes the operation is a content judgement.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'any focusable control composed with the progress bar',
        verifiedBy: "that control's focus-indicator review",
        reason:
          'A progress bar takes no focus, so it shows no focus indicator.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level layout review',
        reason: 'A progress bar takes no focus to obscure.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'A progress bar performs no pointer action.',
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's visible-label tests",
        reason:
          'A progress bar is not a speech-input target; this contract proves its name matches the declared operation.',
      },
      '2.5.8-target-size': {
        owner: 'any pointer target composed with the progress bar',
        verifiedBy:
          'the repository target-size audit over rendered marks and controls',
        reason: 'A progress bar is not a pointer target.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A progress bar owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'A progress bar takes no input.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system',
        verifiedBy:
          'this shared contract across ProgressBar and CircularProgress',
        reason:
          'Consistency is a property of the set of progress indicators, not one rendered state.',
      },
      '3.3.1-error-identification': {
        owner: 'the caller that reports a failed operation',
        verifiedBy: 'the status-message contract and caller review',
        reason:
          'A failed operation is reported by a status or error message, not by the progress bar.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'A progress bar is not an input that needs instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the status-message contract and the binding component',
        verifiedBy:
          "status-message.progress.* for exposure across progress and completion updates, and the component's clamping and disabled tests",
        reason:
          "This contract encodes each rendered state's role, name, value, range, indeterminate state, value text, and subtree. Keeping that exposure through updates, and how out-of-range input is clamped, belong to those owners.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'the status-message contract and spec:AST-009',
        verifiedBy:
          'the status-message progress expectations and real-AT evidence under AST-009 when a change claims spoken output',
        reason:
          'A progress update is a status message; this contract makes no announcement or update claim.',
      },
      'apg-interaction': {
        owner: 'no APG widget pattern for progress bars',
        verifiedBy:
          'the WAI-ARIA 1.2 progressbar, aria-valuenow, and aria-valuetext requirements this contract cites',
        reason:
          'The APG publishes no progressbar pattern and no current Astryx record adopts an interaction model for this read-only role.',
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy: "the component's forced-colors review of fill and track",
        reason:
          'Forced-colors output is a paint result outside the semantics this contract observes.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion tests for the indeterminate animation",
        reason:
          'The indeterminate slide and spin are visual timing, not progressbar semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and review of the default value formatter',
        reason:
          'The contract introduces no string; the label comes from the caller and the value text from the binding formatter.',
      },
    },
  });
