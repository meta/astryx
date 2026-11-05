// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file status-message.ts
 * @input Uses the shared accessibility contract vocabulary
 * @output STATUS_MESSAGE_PATTERN and the facts a binding declares for one status surface
 * @position Reusable WCAG 2.2 status-message contract
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

const WCAG_4_1_3: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.3',
  name: 'Status Messages',
  level: 'AA',
  url: `${UNDERSTANDING}/status-messages.html`,
};

const ARIA_STATUS: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 status role',
  requirement:
    'A status is a type of live region whose content is advisory information for the user but is not important enough to justify an alert.',
  url: `${ARIA}/#status`,
};

const ARIA_ALERT: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 alert role',
  requirement:
    'Alerts are assertive live regions, which means they cause immediate notification for assistive technology users.',
  url: `${ARIA}/#alert`,
};

const ARIA_STATUS_ATOMIC: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 status role',
  requirement: 'The implicit value of aria-atomic for status is true.',
  url: `${ARIA}/#status`,
};

const ARIA_ALERT_ATOMIC: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 alert role',
  requirement: 'The implicit value of aria-atomic for alert is true.',
  url: `${ARIA}/#alert`,
};

const WCAG_ARIA22: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WCAG 2.2 Technique ARIA22',
  requirement:
    'The status container must be present in the DOM when the status message is displayed; the message is then added to or updated inside that container.',
  url: 'https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22',
};

const ARIA_PROGRESSBAR: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 progressbar role',
  requirement:
    'A progressbar is an element that displays the progress status for tasks that take a long time.',
  url: `${ARIA}/#progressbar`,
};

const ARIA_VALUE_MIN: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 aria-valuemin property',
  requirement:
    'Authors MUST ensure the value of aria-valuemin is less than or equal to the value of aria-valuemax.',
  url: `${ARIA}/#aria-valuemin`,
};

const ARIA_VALUE_NOW: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2 aria-valuenow property',
  requirement:
    'Authors MUST ensure aria-valuenow is greater than or equal to aria-valuemin and less than or equal to aria-valuemax.',
  url: `${ARIA}/#aria-valuenow`,
};

export type StatusMessageTransitionName =
  'show' | 'replace' | 'clear' | 'repeat' | 'progress' | 'complete';

export type StatusMessageStateFacts =
  | {
      readonly kind: 'live-region';
      readonly role: 'status' | 'alert' | null;
      readonly politeness: 'polite' | 'assertive';
      readonly messageSource: 'text' | 'accessible-name';
      /** Message exposed before the binding performs any transition. */
      readonly initialMessage: string;
      readonly message: string;
      readonly replacement: string;
      /** Public message transitions to observe; clear may remove the semantic subject. */
      readonly semanticTransitions: readonly StatusMessageTransitionName[];
    }
  | {
      readonly kind: 'progressbar';
      readonly politeness: null;
      readonly name: string;
      readonly initialValue: number | null;
      readonly initialMin: number;
      readonly initialMax: number;
      readonly progressValue: number;
      readonly completionValue: number;
      readonly minValue: number;
      readonly maxValue: number;
    };

const LIVE_REGION = {
  condition: 'this binding uses a live region to expose the status message',
  test: (facts: StatusMessageStateFacts) => facts.kind === 'live-region',
};

const ROLE_LIVE_REGION = {
  condition: 'this binding uses a status or alert role for its live region',
  test: (facts: StatusMessageStateFacts) =>
    facts.kind === 'live-region' && facts.role != null,
};

const LIVE_TEXT_REGION = {
  condition:
    'this binding exposes status text inside a live region that it updates',
  test: (facts: StatusMessageStateFacts) =>
    facts.kind === 'live-region' && facts.messageSource === 'text',
};

const PROGRESSBAR = {
  condition: 'this binding exposes the status as a progress bar',
  test: (facts: StatusMessageStateFacts) => facts.kind === 'progressbar',
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function messageAfterTransition(
  facts: Extract<StatusMessageStateFacts, {kind: 'live-region'}>,
  transition: StatusMessageTransitionName,
): string {
  switch (transition) {
    case 'show':
    case 'repeat':
      return facts.message;
    case 'replace':
      return facts.replacement;
    case 'clear':
      return '';
    case 'progress':
    case 'complete':
      throw new Error(
        `live-region facts cannot use the ${JSON.stringify(transition)} transition`,
      );
  }
}

export const STATUS_MESSAGE_PATTERN: PatternContract<StatusMessageStateFacts> =
  definePattern<StatusMessageStateFacts>({
    pattern: 'status-message',
    url: `${UNDERSTANDING}/status-messages.html`,
    scope:
      'One status update that is programmatically exposed without moving focus; announcement output remains real-AT evidence.',
    expectations: [
      {
        id: 'status-message.role.exposed',
        outcome:
          'The browser exposes the live region through the status or alert role selected by the binding.',
        sources: [WCAG_4_1_3, WCAG_4_1_2, ARIA_STATUS, ARIA_ALERT],
        covers: ['4.1.3-status-messages', '4.1.2-name-role-value'],
        appliesWhen: ROLE_LIVE_REGION,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'live-region' || facts.role == null) {
            return;
          }
          const assertRole = async (phase: string): Promise<void> => {
            const {role} = await subject.computed();
            if (role !== facts.role) {
              throw new Error(
                `the browser exposes this ${facts.politeness} status as ${JSON.stringify(role)} ${phase}, not as the declared ${JSON.stringify(facts.role)} role`,
              );
            }
          };
          await assertRole('at the pre-update boundary');
          for (const name of facts.semanticTransitions) {
            await transition(name);
            if (name === 'clear' && !(await subject.currentExists())) {
              continue;
            }
            await assertRole(`after the ${JSON.stringify(name)} transition`);
          }
        },
      },
      {
        id: 'status-message.channel.exposed',
        outcome:
          'The browser exposes the status through the intended polite or assertive live channel before and after its public updates.',
        sources: [WCAG_4_1_3, ARIA_STATUS, ARIA_ALERT],
        covers: ['4.1.3-status-messages'],
        appliesWhen: LIVE_REGION,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'live-region') {
            return;
          }
          const assertChannel = async (phase: string): Promise<void> => {
            const {live} = await subject.computed();
            if (live !== facts.politeness) {
              throw new Error(
                live == null
                  ? `the browser exposes no live channel ${phase} for this ${facts.politeness} status message, so assistive technology has no programmatic status update to present without moving focus`
                  : `the browser exposes this status message through the ${live} channel ${phase}, not the intended ${facts.politeness} channel`,
              );
            }
          };
          await assertChannel('at the pre-update boundary');
          for (const name of facts.semanticTransitions) {
            await transition(name);
            if (name === 'clear' && !(await subject.currentExists())) {
              continue;
            }
            await assertChannel(`after the ${JSON.stringify(name)} transition`);
          }
        },
      },
      {
        id: 'status-message.region.precedes-update',
        outcome:
          'The binding follows the ARIA22 reliability technique: the role=status container exists before a tested message update occurs in that same node.',
        sources: [WCAG_ARIA22, WCAG_4_1_3, ARIA_STATUS],
        wcagOutcome:
          'Status information can be programmatically determined without moving focus.',
        covers: ['4.1.3-status-messages'],
        appliesWhen: {
          condition:
            'this binding exposes text through the status role; alerts and accessible-name-only states use different semantics',
          test: facts =>
            facts.kind === 'live-region' &&
            facts.role === 'status' &&
            facts.messageSource === 'text',
        },
        evidenceLayer: 'dom',
        enforcement: 'advisory',
        advisoryBecause:
          'ARIA22 is a sufficient WCAG technique, not the only conforming implementation; real assistive-technology evidence owns whether another lifecycle is reliably announced.',
        run: async ({subject, facts, transition}) => {
          if (
            facts.kind !== 'live-region' ||
            facts.role !== 'status' ||
            facts.messageSource !== 'text'
          ) {
            return;
          }
          const firstUpdate = facts.semanticTransitions[0];
          if (firstUpdate == null) {
            throw new Error(
              'the binding declares no message transition for the ARIA22 lifecycle check',
            );
          }
          await subject.isConnected();
          await transition(firstUpdate);
          if (!(await subject.isConnected())) {
            throw new Error(
              `the role=status container was replaced by the ${JSON.stringify(firstUpdate)} update instead of predating and receiving that message`,
            );
          }
        },
      },
      {
        id: 'status-message.message.text-exposed',
        outcome:
          'The complete status text remains in the browser accessibility subtree before and after the binding’s public update.',
        sources: [WCAG_4_1_3, ARIA_STATUS, ARIA_ALERT],
        covers: ['4.1.3-status-messages'],
        appliesWhen: LIVE_TEXT_REGION,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'live-region' || facts.messageSource !== 'text') {
            return;
          }
          const assertMessage = async (
            expected: string,
            phase: string,
          ): Promise<void> => {
            const authored = normalizeText(await subject.textContent());
            if (authored !== normalizeText(expected)) {
              throw new Error(
                `the live region contains ${JSON.stringify(authored)} ${phase}, not the complete authored message ${JSON.stringify(normalizeText(expected))}`,
              );
            }
            const exposed = normalizeText(
              (await subject.computed()).accessibleText,
            );
            if (exposed !== normalizeText(expected)) {
              throw new Error(
                `the accessibility tree exposes ${JSON.stringify(exposed)} ${phase}, not the complete status text ${JSON.stringify(normalizeText(expected))}`,
              );
            }
          };
          await assertMessage(
            facts.initialMessage,
            'at the pre-update boundary',
          );
          for (const name of facts.semanticTransitions) {
            await transition(name);
            if (name === 'clear' && !(await subject.currentExists())) {
              continue;
            }
            await assertMessage(
              messageAfterTransition(facts, name),
              `after the ${JSON.stringify(name)} transition`,
            );
          }
        },
      },
      {
        id: 'status-message.message.name-exposed',
        outcome:
          'The browser exposes the complete status as the live region’s accessible name when that is the chosen message channel.',
        sources: [WCAG_4_1_3, WCAG_4_1_2],
        covers: ['4.1.3-status-messages', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'this binding exposes the status as the live region accessible name',
          test: facts =>
            facts.kind === 'live-region' &&
            facts.messageSource === 'accessible-name',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (
            facts.kind !== 'live-region' ||
            facts.messageSource !== 'accessible-name'
          ) {
            return;
          }
          const assertName = async (
            expected: string,
            phase: string,
          ): Promise<void> => {
            const name = (await subject.computed()).name.trim();
            if (name !== expected.trim()) {
              throw new Error(
                `the browser computes the live region name as ${JSON.stringify(name)} ${phase}, not ${JSON.stringify(expected.trim())}`,
              );
            }
          };
          await assertName(facts.initialMessage, 'at the pre-update boundary');
          for (const name of facts.semanticTransitions) {
            await transition(name);
            if (name === 'clear' && !(await subject.currentExists())) {
              continue;
            }
            await assertName(
              messageAfterTransition(facts, name),
              `after the ${JSON.stringify(name)} transition`,
            );
          }
        },
      },
      {
        id: 'status-message.region.atomic',
        outcome:
          'The browser exposes the status or alert role’s implicit whole-region atomicity before and after public updates.',
        sources: [ARIA_STATUS_ATOMIC, ARIA_ALERT_ATOMIC, WCAG_4_1_3],
        wcagOutcome:
          'Status information can be programmatically determined without moving focus.',
        covers: ['4.1.3-status-messages'],
        appliesWhen: ROLE_LIVE_REGION,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'advisory',
        advisoryBecause:
          'WAI-ARIA defines an overridable implicit default; only real assistive-technology evidence can establish whole-message presentation.',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'live-region' || facts.role == null) {
            return;
          }
          const assertAtomic = async (phase: string): Promise<void> => {
            const {atomic} = await subject.computed();
            if (atomic !== true) {
              throw new Error(
                `the browser does not expose this ${facts.role} region as atomic ${phase}, so a partial text mutation can omit the context needed to understand the status`,
              );
            }
          };
          await assertAtomic('at the pre-update boundary');
          for (const name of facts.semanticTransitions) {
            await transition(name);
            if (name === 'clear' && !(await subject.currentExists())) {
              continue;
            }
            await assertAtomic(`after the ${JSON.stringify(name)} transition`);
          }
        },
      },
      {
        id: 'status-message.focus.unchanged',
        outcome:
          'The status update leaves focus on the user’s current control instead of moving focus to the message.',
        sources: [WCAG_4_1_3],
        covers: [
          '4.1.3-status-messages',
          '2.4.3-focus-order',
          '3.2.2-on-input',
        ],
        appliesWhen: {
          condition:
            'the binding produces a status update without a context change',
          test: () => true,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, facts, transition}) => {
          const anchor = await harness.related('focus-anchor');
          await anchor.focus();
          if (!(await anchor.isFocused())) {
            throw new Error(
              'the binding focus anchor could not receive focus before the status transition, so this scenario does not prove the no-focus-change requirement',
            );
          }
          const transitions: readonly StatusMessageTransitionName[] =
            facts.kind === 'live-region'
              ? facts.semanticTransitions
              : ['progress', 'complete'];
          for (const name of transitions) {
            await transition(name);
            if (!(await anchor.isFocused())) {
              throw new Error(
                `the ${JSON.stringify(name)} status transition moved focus away from the user’s current control instead of remaining passive`,
              );
            }
          }
        },
      },
      {
        id: 'status-message.progress.role-exposed',
        outcome:
          'The browser exposes ongoing progress as a progress bar rather than as an unidentified visual change.',
        sources: [WCAG_4_1_3, WCAG_4_1_2, ARIA_PROGRESSBAR],
        covers: ['4.1.3-status-messages', '4.1.2-name-role-value'],
        appliesWhen: PROGRESSBAR,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'progressbar') {
            return;
          }
          const assertRole = async (phase: string): Promise<void> => {
            const {role} = await subject.computed();
            if (role !== 'progressbar') {
              throw new Error(
                role == null
                  ? `the browser exposes no role for this progress status ${phase}, so assistive technology cannot identify the changing value as progress`
                  : `the browser exposes this progress status as ${JSON.stringify(role)} ${phase}, not as a progress bar`,
              );
            }
          };
          await assertRole('at the pre-update boundary');
          await transition('progress');
          await assertRole('after the "progress" transition');
          await transition('complete');
          await assertRole('after the "complete" transition');
        },
      },
      {
        id: 'status-message.progress.name-exposed',
        outcome:
          'The progress status names the operation whose progress is changing.',
        sources: [WCAG_4_1_2, ARIA_PROGRESSBAR],
        covers: ['4.1.2-name-role-value', '2.4.6-headings-and-labels'],
        appliesWhen: PROGRESSBAR,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'progressbar') {
            return;
          }
          const assertName = async (phase: string): Promise<void> => {
            const {name} = await subject.computed();
            if (name.trim() === '') {
              throw new Error(
                `the browser computes no accessible name for this progress bar ${phase}, so the changing value does not say which operation it belongs to`,
              );
            }
            if (name.trim() !== facts.name.trim()) {
              throw new Error(
                `the browser computes the progress name as ${JSON.stringify(name.trim())} ${phase}, not the binding’s declared operation ${JSON.stringify(facts.name.trim())}`,
              );
            }
          };
          await assertName('at the pre-update boundary');
          await transition('progress');
          await assertName('after the "progress" transition');
          await transition('complete');
          await assertName('after the "complete" transition');
        },
      },
      {
        id: 'status-message.progress.values-exposed',
        outcome:
          'The progress bar exposes a valid declared range and its starting, in-progress, and completion values.',
        sources: [
          WCAG_4_1_2,
          ARIA_VALUE_MIN,
          ARIA_VALUE_NOW,
          ARIA_PROGRESSBAR,
          WCAG_4_1_3,
        ],
        wcagOutcome:
          'Progress status and its current value can be programmatically determined without moving focus.',
        covers: ['4.1.3-status-messages', '4.1.2-name-role-value'],
        appliesWhen: PROGRESSBAR,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts, transition}) => {
          if (facts.kind !== 'progressbar') {
            return;
          }
          if (facts.initialMin > facts.initialMax) {
            throw new Error(
              `the binding declares a reversed initial progress range ${facts.initialMin}..${facts.initialMax}`,
            );
          }
          if (
            facts.initialValue != null &&
            (facts.initialValue < facts.initialMin ||
              facts.initialValue > facts.initialMax)
          ) {
            throw new Error(
              `the binding declares initial progress value ${facts.initialValue} outside ${facts.initialMin}..${facts.initialMax}`,
            );
          }
          if (facts.minValue > facts.maxValue) {
            throw new Error(
              `the binding declares a reversed progress range ${facts.minValue}..${facts.maxValue}`,
            );
          }
          for (const [phase, value] of [
            ['progress', facts.progressValue],
            ['completion', facts.completionValue],
          ] as const) {
            if (value < facts.minValue || value > facts.maxValue) {
              throw new Error(
                `the binding declares ${phase} progress value ${value} outside ${facts.minValue}..${facts.maxValue}`,
              );
            }
          }
          const initial = await subject.computed();
          if (
            initial.rangeValue !== facts.initialValue ||
            initial.rangeMin !== facts.initialMin ||
            initial.rangeMax !== facts.initialMax
          ) {
            throw new Error(
              `the browser exposes initial progress as value=${String(initial.rangeValue)}, min=${String(initial.rangeMin)}, max=${String(initial.rangeMax)} instead of value=${String(facts.initialValue)}, min=${String(facts.initialMin)}, max=${String(facts.initialMax)}`,
            );
          }
          await transition('progress');
          const progressing = await subject.computed();
          if (
            progressing.rangeValue !== facts.progressValue ||
            progressing.rangeMin !== facts.minValue ||
            progressing.rangeMax !== facts.maxValue
          ) {
            throw new Error(
              `the browser exposes progress as value=${String(progressing.rangeValue)}, min=${String(progressing.rangeMin)}, max=${String(progressing.rangeMax)} instead of ${facts.progressValue} in ${facts.minValue}..${facts.maxValue}`,
            );
          }
          await transition('complete');
          const completed = await subject.computed();
          if (
            completed.rangeValue !== facts.completionValue ||
            completed.rangeMin !== facts.minValue ||
            completed.rangeMax !== facts.maxValue
          ) {
            throw new Error(
              `the browser exposes completion as value=${String(completed.rangeValue)}, min=${String(completed.rangeMin)}, max=${String(completed.rangeMax)} instead of ${facts.completionValue} in ${facts.minValue}..${facts.maxValue}`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's own decorative-icon and text-alternative tests plus the repository axe audit",
        reason:
          'This contract observes the status surface. A component or caller decides whether an icon carries information and supplies its alternative or hides it as redundant.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing feature',
        verifiedBy:
          "the component's relationship tests and integration review of any control or result the message describes",
        reason:
          'A live channel exposes the update, but the relationship between that update and nearby controls or results belongs to the composition that creates them.',
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: 'page-level DOM-order and reading-order review',
        reason:
          'The order of a status surface among surrounding content is decided by the page, not by one message in isolation.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form',
        verifiedBy:
          'form review for user-information inputs and their autocomplete purposes',
        reason:
          'A status message reports an outcome and does not collect user information.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's non-color-cue tests and the repository visual review",
        reason:
          'Color and any redundant visible icon are painted binding details that this semantic contract cannot observe.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit over component stories plus rendered visual review',
        reason:
          'Text contrast depends on resolved foreground, backdrop, theme, and state pixels.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered visual review of meaningful indicators and progress graphics',
        reason:
          'The contrast of an icon, progress fill, track, or boundary is a rendered-pixel result outside this semantic contract.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's own tests for any controls placed beside or inside the status",
        reason:
          'The status surface is passive. Any dismiss, retry, or related action keeps its own button or link contract.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'keyboard review of any interactive content composed with the status',
        reason:
          'The status surface neither accepts nor traps focus; interactive descendants remain separate component contracts.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason:
          'A component status update cannot provide or evaluate the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level focus-order review; this contract proves only that producing the status leaves the current focus unchanged',
        reason:
          'The order of every focusable element around the status is a page property.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'caller content and the link pattern',
        verifiedBy:
          'review of any link composed into or beside a visible status message',
        reason:
          'A status surface is not a link, and any linked recovery or follow-up action keeps its own contract.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and the binding component',
        verifiedBy:
          'content review of the status wording; this contract proves only that a progress status has a name',
        reason:
          'Whether the supplied wording describes the operation or outcome well is a content judgement.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the currently focused control and its component',
        verifiedBy:
          'the focused component contract and rendered focus-indicator review',
        reason:
          'The status must not take focus. The control that keeps focus owns its visible indicator.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page and overlay system',
        verifiedBy: 'page-level and overlay visual review',
        reason:
          'Whether a newly rendered status covers the focused control depends on page layout and layering.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'any interactive control composed with the status',
        verifiedBy: "that control's pointer interaction contract",
        reason:
          'The status surface is passive and performs no single-pointer action.',
      },
      '2.5.3-label-in-name': {
        owner: 'interactive controls composed with the status',
        verifiedBy: "each control's visible-label and accessible-name contract",
        reason:
          'A passive status message is not a speech-input target. A related action remains a separate button or link.',
      },
      '2.5.8-target-size': {
        owner: 'interactive controls composed with the status and the page',
        verifiedBy:
          'the repository target-size audit over rendered controls and their neighbours',
        reason:
          'The status surface has no pointer target; related actions keep their own geometry.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level language review',
        reason:
          'A component status update cannot set or verify the document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller that causes the status update',
        verifiedBy:
          'integration review of any navigation, viewport, or meaning change caused by the caller',
        reason:
          'This contract proves that the status itself does not move focus. Any other context change comes from the action that produced it.',
        coversRemainderOnly: true,
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system',
        verifiedBy:
          'this shared contract and review of every component binding to it',
        reason:
          'Consistency is a property of the complete set of status-message adopters, not one binding state.',
      },
      '3.3.1-error-identification': {
        owner: 'the field component and caller content',
        verifiedBy:
          "the field's error-state and textual-identification tests plus form review",
        reason:
          'This contract can expose an error message through an assertive channel, but the field owner decides which input is in error and whether the text identifies it.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'A status message reports an outcome; it does not provide the persistent label or instructions for an input.',
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component',
        verifiedBy:
          "the component's own semantic contract for states outside the progress status represented here",
        reason:
          'This pattern encodes the progressbar role, name, and value updates. Other component state and value semantics remain with each adopted component pattern.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the named real-AT/browser matrix and durable receipts required by AST-009 when a change claims spoken or braille output, order, timing, repetition, or omission',
        reason:
          'This contract proves DOM lifecycle, browser exposure, and focus preservation only. It does not claim what assistive technology announces.',
        coversRemainderOnly: true,
      },
      'apg-interaction': {
        owner: 'no adopted APG widget pattern for status messages',
        verifiedBy:
          'WCAG 2.2 Status Messages and WAI-ARIA status, alert, and progressbar semantics cited by this contract',
        reason:
          'No current Astryx record adopts an APG widget interaction model for this passive status-message pattern, so the contract does not import one.',
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's forced-colors tests plus rendered Windows High Contrast review",
        reason:
          'Forced-color paint is outside the DOM and accessibility-tree observations in this contract.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion source tests and rendered motion review",
        reason:
          'Spinner, typing, progress, and toast animation are visual timing behavior, not status-message semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check plus source review of generated and caller-supplied status strings',
        reason:
          'The shared contract receives rendered messages and cannot tell whether their source was translated. Each component owns generated strings; callers own supplied content.',
      },
    },
  });
