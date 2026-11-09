// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file disclosure.ts
 * @input Uses the shared accessibility-contract vocabulary
 * @output DISCLOSURE_PATTERN and DisclosureStateFacts
 * @position Disclosure-specific state, controlled-content, and interaction contract.
 *   Generic button role, naming, focus navigation, and disabled semantics remain
 *   owned by BUTTON_PATTERN; Accordion/group policy is outside this contract.
 *
 * Adopted pattern: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /internal/a11y-spec/src/patterns/disclosure.fixtures.ts
 * - /packages/core/src/Collapsible/__tests__/Collapsible.a11y.states.ts
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/';
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

const APG_STATE: ApgRequirement = {
  standard: 'apg',
  pattern: 'disclosure',
  requirement:
    'When the content is visible, the element with role button has aria-expanded set to true. When the content area is hidden, it is set to false.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_CONTROLS: ApgRequirement = {
  standard: 'apg',
  pattern: 'disclosure',
  requirement:
    'Optionally, the element with role button has a value specified for aria-controls that refers to the element that contains all the content that is shown or hidden.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'disclosure',
  requirement:
    'Enter: activates the disclosure control and toggles the visibility of the disclosure content.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'disclosure',
  requirement:
    'Space: activates the disclosure control and toggles the visibility of the disclosure content.',
  url: `${APG_URL}#keyboardinteraction`,
};

export interface DisclosureStateFacts {
  /** Whether the controlled content is meant to be visible in this state. */
  readonly expanded: boolean;
  /** Whether this binding intentionally declares aria-controls. */
  readonly controls: boolean;
  /** Whether the user is meant to be able to toggle this state. */
  readonly operable: boolean;
  /** Whether this state is meant to accept keyboard focus. */
  readonly focusable: boolean;
}

const ALWAYS = {
  condition: 'the binding renders a disclosure trigger and its content',
  test: () => true,
};

async function authoredExpanded(subject: Subject): Promise<boolean | null> {
  const value = await subject.attribute('aria-expanded');
  return value === 'true' ? true : value === 'false' ? false : null;
}

function stateWord(expanded: boolean): 'expanded' | 'collapsed' {
  return expanded ? 'expanded' : 'collapsed';
}

async function assertStateAndContent(
  subject: Subject,
  content: Subject,
  expected: boolean,
  after: string,
): Promise<void> {
  const state = await authoredExpanded(subject);
  if (state !== expected) {
    throw new Error(
      `${after} left aria-expanded ${state == null ? 'absent or invalid' : state} instead of ${expected}`,
    );
  }
  const visible = await content.isVisible();
  if (visible !== expected) {
    throw new Error(
      `${after} left the disclosure ${stateWord(expected)} while its content was ${visible ? 'visible' : 'hidden'}`,
    );
  }
}

async function roundTrip(
  subject: Subject,
  content: Subject,
  start: boolean,
  activate: () => Promise<void>,
  how: string,
): Promise<void> {
  await assertStateAndContent(subject, content, start, 'the starting state');
  await activate();
  await assertStateAndContent(subject, content, !start, how);
  await activate();
  await assertStateAndContent(subject, content, start, `${how} a second time`);
}

export const DISCLOSURE_PATTERN: PatternContract<DisclosureStateFacts> =
  definePattern<DisclosureStateFacts>({
    pattern: 'disclosure',
    url: APG_URL,
    scope:
      'One button-controlled content section whose expanded state and visibility stay synchronized through pointer, Enter, and Space activation.',
    expectations: [
      {
        id: 'disclosure.state.expanded',
        outcome:
          'The trigger identifies whether its controlled content is expanded or collapsed.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expanded = await subject.attribute('aria-expanded');
          if (expanded !== String(facts.expanded)) {
            throw new Error(
              `the disclosure is ${stateWord(facts.expanded)} but aria-expanded is ${expanded ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'disclosure.relationship.controls',
        outcome:
          'A declared control relationship identifies the content being disclosed.',
        sources: [WCAG_1_3_1, APG_CONTROLS],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding intentionally declares a controlled-content relationship',
          test: facts => facts.controls,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const content = await harness.related('content');
          if (!(await harness.references(subject, 'aria-controls', content))) {
            throw new Error(
              'aria-controls does not identify the disclosed content',
            );
          }
          if (
            (await subject.idReferences('aria-controls')).some(
              target => target === null,
            )
          ) {
            throw new Error('aria-controls includes a missing content target');
          }
        },
      },
      {
        id: 'disclosure.content.matches-state',
        outcome:
          'Expanded content is visible and collapsed content is hidden, so the exposed state describes what the user receives.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await assertStateAndContent(
            subject,
            await harness.related('content'),
            facts.expanded,
            'the rendered state',
          );
        },
      },
      {
        id: 'disclosure.state.pointer-round-trip',
        outcome:
          'A pointer reveals the content and hides it again, with the exposed state following both transitions.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the disclosure can be operated',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await roundTrip(
            subject,
            await harness.related('content'),
            facts.expanded,
            () => harness.click(subject),
            'clicking the disclosure',
          );
        },
      },
      {
        id: 'disclosure.state.enter-round-trip',
        outcome:
          'With focus on the trigger, Enter reveals the content and hides it again.',
        sources: [WCAG_2_1_1, APG_ENTER],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the disclosure can be operated and its trigger can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the disclosure trigger did not take focus, so Enter never reaches it',
            );
          }
          await roundTrip(
            subject,
            await harness.related('content'),
            facts.expanded,
            () => harness.press('Enter'),
            'pressing Enter on the focused disclosure',
          );
        },
      },
      {
        id: 'disclosure.state.space-round-trip',
        outcome:
          'With focus on the trigger, Space reveals the content and hides it again.',
        sources: [WCAG_2_1_1, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the disclosure can be operated and its trigger can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the disclosure trigger did not take focus, so Space never reaches it',
            );
          }
          await roundTrip(
            subject,
            await harness.related('content'),
            facts.expanded,
            () => harness.press('Space'),
            'pressing Space on the focused disclosure',
          );
        },
      },
      {
        id: 'disclosure.state.survives-an-aborted-press',
        outcome:
          'A press released away from the trigger leaves the disclosure unchanged, so an unintended press can be cancelled.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the disclosure can be operated',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const content = await harness.related('content');
          await assertStateAndContent(
            subject,
            content,
            facts.expanded,
            'the starting state',
          );
          await harness.abortedPress(subject);
          await assertStateAndContent(
            subject,
            content,
            facts.expanded,
            'releasing the press away from the disclosure',
          );
        },
      },
      {
        id: 'disclosure.focus.stays-on-trigger',
        outcome:
          'Toggling the disclosure leaves focus on its trigger, so the user stays at the control they changed.',
        sources: [WCAG_3_2_2],
        covers: ['3.2.2-on-input'],
        appliesWhen: {
          condition:
            'the disclosure can be operated and its trigger can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the disclosure trigger did not take focus, so the focus result of changing it cannot be observed',
            );
          }
          const content = await harness.related('content');
          await harness.press('Space');
          await assertStateAndContent(
            subject,
            content,
            !facts.expanded,
            'pressing Space on the focused disclosure',
          );
          if (!(await subject.isFocused())) {
            throw new Error(
              'toggling the disclosure moved focus away from its trigger',
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
          'The disclosure contract owns trigger state and controlled-content behavior. Decorative graphics such as a chevron are binding-specific composition.',
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
          'A disclosure trigger does not itself collect information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'Color and any non-color disclosure cue are rendered presentation facts, not trigger-state semantics.',
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
          'Control and disclosure-cue contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN focus-navigation expectations plus page-level keyboard-order review',
        reason:
          'This contract encodes the disclosure-specific Enter and Space state transitions. Generic reachability and other page keyboard paths remain with the button and composition owners.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local focus reach/escape tests and page-level keyboard review',
        reason:
          'A disclosure adds no focus trap; Tab entry and exit are generic button and composition behavior.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A disclosure rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level focus-order review; this contract proves only that toggling does not move focus',
        reason:
          'Sequential order across the trigger, revealed content, and surrounding controls depends on composition.',
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'review of links inside or around the disclosed content',
        reason: 'The adopted disclosure trigger is a button, not a link.',
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
          'The disclosure adds state to a button without changing who owns the button label and name.',
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
        reason: 'A disclosure rendered in isolation owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy:
          'integration review of any navigation, viewport, or meaning change a caller causes while toggling',
        reason:
          'This contract proves the trigger keeps focus while its own section toggles. Any additional context change is caller behavior.',
        coversRemainderOnly: true,
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated disclosure labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated disclosure.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and composing form',
        verifiedBy: 'form-level error-state and text review',
        reason: 'The disclosure pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'The disclosure trigger does not collect user input that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the button pattern and binding component',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local role, name, and unavailable-state tests',
        reason:
          'This contract encodes the disclosure-expanded state and its transitions. Generic button role, name, and unavailable state remain with BUTTON_PATTERN.',
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
          "This contract encodes disclosure state, relationship, and Enter/Space visibility transitions. The trigger's generic button semantics stay with BUTTON_PATTERN.",
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
          'Reveal motion is binding-specific paint over time and is not part of disclosure semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels and descriptions',
        reason:
          'The disclosure contract introduces no string; trigger and content text come from the binding or caller.',
      },
    },
  });
