// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file accordion.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Accordion pattern's header, state, relationship, and keyboard requirements
 * @output ACCORDION_PATTERN — the reusable contract a group of disclosures binds to when it adopts Accordion's required parts
 * @position Pattern contract; bound by CollapsibleGroup under its record's AR4 (`spec:AST-020/FR15`)
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/accordion/';
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

const APG_HEADER_BUTTON: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'The title of each accordion header is contained in an element with role button.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_EXPANDED: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'If the accordion panel associated with an accordion header is visible, the header button element has aria-expanded set to true. If the panel is not visible, aria-expanded is set to false.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_CONTROLS: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'The accordion header button element has aria-controls set to the ID of the element containing the accordion panel content.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DISABLED: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'If the accordion panel associated with an accordion header is visible, and if the accordion does not permit the panel to be collapsed, the header button element has aria-disabled set to true.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_ENTER_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'Enter or Space: When focus is on the accordion header for a collapsed panel, expands the associated panel. If the implementation allows only one panel to be expanded, and if another panel is expanded, collapses that panel. When focus is on the accordion header for an expanded panel, collapses the panel if the implementation supports collapsing.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_TAB: ApgRequirement = {
  standard: 'apg',
  pattern: 'accordion',
  requirement:
    'Tab: Moves focus to the next focusable element; all focusable elements in the accordion are included in the page Tab sequence.',
  url: `${APG_URL}#keyboardinteraction`,
};

/**
 * What a binding knows about one accordion header and the group around it.
 * The subject is always a header; `panel` is the content it controls,
 * `next-header` the header that follows it in the page Tab order (when one
 * exists), and `open-sibling` the other header that is expanded in a
 * single-expansion group (when one exists).
 */
export interface AccordionStateFacts {
  /** Whether this header's panel is meant to be visible in this state. */
  readonly expanded: boolean;
  /** Whether the user is meant to be able to toggle this header. */
  readonly operable: boolean;
  /** Whether this header is meant to accept keyboard focus. */
  readonly focusable: boolean;
  /** Whether the group allows only one panel to be expanded at a time. */
  readonly single: boolean;
  /** Whether the binding supplies a `next-header` relation after this header. */
  readonly hasNextHeader: boolean;
  /** Whether the binding supplies an expanded `open-sibling` relation. */
  readonly hasOpenSibling: boolean;
}

const ALWAYS = {
  condition: 'the binding designates an accordion header',
  test: () => true,
};

function stateWord(expanded: boolean): 'expanded' | 'collapsed' {
  return expanded ? 'expanded' : 'collapsed';
}

async function authoredExpanded(subject: Subject): Promise<boolean | null> {
  const value = await subject.attribute('aria-expanded');
  return value === 'true' ? true : value === 'false' ? false : null;
}

async function assertStateAndPanel(
  subject: Subject,
  panel: Subject,
  expected: boolean,
  after: string,
): Promise<void> {
  const state = await authoredExpanded(subject);
  if (state !== expected) {
    throw new Error(
      `${after} left aria-expanded ${state == null ? 'absent or invalid' : state} instead of ${expected}`,
    );
  }
  const visible = await panel.isVisible();
  if (visible !== expected) {
    throw new Error(
      `${after} left the header ${stateWord(expected)} while its panel was ${visible ? 'visible' : 'hidden'}`,
    );
  }
}

async function roundTrip(
  subject: Subject,
  panel: Subject,
  start: boolean,
  activate: () => Promise<void>,
  how: string,
): Promise<void> {
  await assertStateAndPanel(subject, panel, start, 'the starting state');
  await activate();
  await assertStateAndPanel(subject, panel, !start, how);
  await activate();
  await assertStateAndPanel(subject, panel, start, `${how} a second time`);
}

async function focusOrFail(subject: Subject, forWhat: string): Promise<void> {
  await subject.focus();
  if (!(await subject.isFocused())) {
    throw new Error(
      `the accordion header did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

export const ACCORDION_PATTERN: PatternContract<AccordionStateFacts> =
  definePattern<AccordionStateFacts>({
    pattern: 'accordion',
    url: APG_URL,
    scope:
      "An accordion header's button role and name, expanded state, controlled panel, Enter and Space toggling, single-expansion sibling collapse, page Tab order, and the absence of arrow-key focus movement.",
    expectations: [
      {
        id: 'accordion.header.role-and-name',
        outcome:
          'The browser exposes the header as a named button, so a user hears what section they can open.',
        sources: [WCAG_4_1_2, APG_HEADER_BUTTON],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'button') {
            throw new Error(
              `the browser exposes this header as ${role == null ? 'no role' : `"${role}"`}, not as a button`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this header',
            );
          }
        },
      },
      {
        id: 'accordion.header.expanded-state',
        outcome:
          'The header reports whether its panel is expanded or collapsed.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expanded = await subject.attribute('aria-expanded');
          if (expanded !== String(facts.expanded)) {
            throw new Error(
              `the header is ${stateWord(facts.expanded)} but aria-expanded is ${expanded ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'accordion.header.controls-panel',
        outcome:
          'The header names the panel it controls, so the relationship is programmatic.',
        sources: [WCAG_1_3_1, APG_CONTROLS],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const panel = await harness.related('panel');
          if (!(await harness.references(subject, 'aria-controls', panel))) {
            throw new Error('aria-controls does not identify the panel');
          }
          if (
            (await subject.idReferences('aria-controls')).some(
              target => target === null,
            )
          ) {
            throw new Error('aria-controls includes a missing panel target');
          }
        },
      },
      {
        id: 'accordion.header.disabled-when-fixed',
        outcome:
          'A header whose expanded panel cannot be collapsed says so, instead of looking like a control that ignores the user.',
        sources: [WCAG_4_1_2, APG_DISABLED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the header is expanded and cannot be toggled',
          test: facts => facts.expanded && !facts.operable,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-disabled')) !== 'true') {
            throw new Error(
              'the expanded header cannot be collapsed but does not carry aria-disabled="true"',
            );
          }
        },
      },
      {
        id: 'accordion.panel.matches-state',
        outcome:
          'An expanded panel is visible and a collapsed panel is hidden, so the exposed state describes what the user receives.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await assertStateAndPanel(
            subject,
            await harness.related('panel'),
            facts.expanded,
            'the rendered state',
          );
        },
      },
      {
        id: 'accordion.header.enter-round-trip',
        outcome:
          'With focus on the header, Enter expands the panel and collapses it again.',
        sources: [WCAG_2_1_1, APG_ENTER_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the header can be toggled and can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'Enter');
          await roundTrip(
            subject,
            await harness.related('panel'),
            facts.expanded,
            () => harness.press('Enter'),
            'pressing Enter on the focused header',
          );
        },
      },
      {
        id: 'accordion.header.space-round-trip',
        outcome:
          'With focus on the header, Space expands the panel and collapses it again.',
        sources: [WCAG_2_1_1, APG_ENTER_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the header can be toggled and can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'Space');
          await roundTrip(
            subject,
            await harness.related('panel'),
            facts.expanded,
            () => harness.press('Space'),
            'pressing Space on the focused header',
          );
        },
      },
      {
        id: 'accordion.header.survives-an-aborted-press',
        outcome:
          'A press released away from the header leaves it unchanged, so an unintended press can be cancelled.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the header can be toggled',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const panel = await harness.related('panel');
          await assertStateAndPanel(
            subject,
            panel,
            facts.expanded,
            'the starting state',
          );
          await harness.abortedPress(subject);
          await assertStateAndPanel(
            subject,
            panel,
            facts.expanded,
            'releasing the press away from the header',
          );
        },
      },
      {
        id: 'accordion.focus.stays-on-header',
        outcome:
          'Toggling a header leaves focus on it, so the user stays at the control they changed.',
        sources: [WCAG_3_2_2],
        covers: ['3.2.2-on-input'],
        appliesWhen: {
          condition: 'the header can be toggled and can receive focus',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'the focus result of toggling');
          const panel = await harness.related('panel');
          await harness.press('Space');
          await assertStateAndPanel(
            subject,
            panel,
            !facts.expanded,
            'pressing Space on the focused header',
          );
          if (!(await subject.isFocused())) {
            throw new Error('toggling the header moved focus away from it');
          }
        },
      },
      {
        id: 'accordion.group.single-collapses-sibling',
        outcome:
          'In a single-expansion group, expanding a header collapses the sibling that was open, so one panel is open at a time.',
        sources: [APG_ENTER_SPACE],
        wcagOutcome:
          'Supports WCAG 2.2 4.1.2 for the grouped behaviour; the APG and component:CollapsibleGroup AR4 define it, so this row is advisory until that record is current (AST-020 FR9).',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition:
            'the group allows one expanded panel, this header is collapsed and operable, and another header is expanded',
          test: facts =>
            facts.single &&
            !facts.expanded &&
            facts.operable &&
            facts.focusable &&
            facts.hasOpenSibling,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "Single-expansion sibling collapse is the group's own promise (component:CollapsibleGroup AR4), not an APG-required part; this becomes required once that record is current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          const sibling = await harness.related('open-sibling');
          if ((await authoredExpanded(sibling)) !== true) {
            throw new Error('the open sibling is not expanded to begin with');
          }
          await focusOrFail(subject, 'Space');
          await harness.press('Space');
          if ((await authoredExpanded(subject)) !== true) {
            throw new Error('pressing Space did not expand the header');
          }
          if ((await authoredExpanded(sibling)) !== false) {
            throw new Error(
              'expanding this header left the open sibling expanded in a single-expansion group',
            );
          }
        },
      },
      {
        id: 'accordion.group.tab-order',
        outcome:
          'Tab moves from this header to the next header, so every header sits in the page Tab sequence.',
        sources: [APG_TAB],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 for the grouped behaviour; the APG and component:CollapsibleGroup AR4 define it, so this row is advisory until that record is current (AST-020 FR9).',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'this header can receive focus and another header follows it',
          test: facts => facts.focusable && facts.hasNextHeader,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "The header-to-header Tab step is the group's own promise (component:CollapsibleGroup AR4); this becomes required once that record is current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          const next = await harness.related('next-header');
          await focusOrFail(subject, 'Tab');
          await harness.press('Tab');
          if (!(await next.isFocused())) {
            throw new Error(
              'Tab from the header did not reach the next header in the page sequence',
            );
          }
        },
      },
      {
        id: 'accordion.group.arrows-do-not-move-focus',
        outcome:
          'ArrowDown and ArrowUp leave focus on the header, because this group is a set of independent disclosures, not one composite control.',
        sources: [APG_TAB],
        wcagOutcome:
          'Supports WCAG 2.2 2.1.1 for the grouped behaviour; the APG and component:CollapsibleGroup AR4 define it, so this row is advisory until that record is current (AST-020 FR9).',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition: 'this header can receive focus',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "Not adopting arrow-key movement is the group's own decision (component:CollapsibleGroup AR4 and DEC-1); this becomes required once that record is current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          await focusOrFail(subject, 'ArrowDown');
          await harness.press('ArrowDown');
          if (!(await subject.isFocused())) {
            throw new Error('ArrowDown moved focus away from the header');
          }
          await harness.press('ArrowUp');
          if (!(await subject.isFocused())) {
            throw new Error('ArrowUp moved focus away from the header');
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
          'The accordion contract owns trigger state and controlled-content behavior. Decorative graphics such as a chevron are binding-specific composition.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the binding's component tests and page-level relationship review",
        reason:
          'This contract encodes the required header-to-panel relationship (aria-controls). Other structure and relationships inside or around a panel belong to the binding and its composition.',
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
          'An accordion trigger does not itself collect information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'Color and any non-color accordion cue are rendered presentation facts, not trigger-state semantics.',
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
          'Control and accordion-cue contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN focus-navigation expectations plus page-level keyboard-order review',
        reason:
          'This contract encodes the accordion-specific Enter and Space transitions, the header-to-header Tab step, and the absence of arrow-key movement. Generic reachability and other page keyboard paths remain with the button and composition owners.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the button pattern and composing page',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local focus reach/escape tests and page-level keyboard review',
        reason:
          'An accordion adds no focus trap; Tab entry and exit are generic button and composition behavior.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'An accordion rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level focus-order review; this contract proves the header-to-header Tab step and that arrow keys do not move focus',
        reason:
          'Sequential order between the headers, the revealed panels, and surrounding controls depends on composition.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'review of links inside or around the disclosed content',
        reason: 'The adopted accordion trigger is a button, not a link.',
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
          'The accordion adds state to a button without changing who owns the button label and name.',
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
        reason: 'An accordion rendered in isolation owns no document language.',
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
          'this shared contract across bindings plus content review of repeated accordion labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated accordion.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and composing form',
        verifiedBy: 'form-level error-state and text review',
        reason: 'The accordion pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'The accordion trigger does not collect user input that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the button pattern and binding component',
        verifiedBy:
          'BUTTON_PATTERN for adopters, plus binding-local role, name, and unavailable-state tests',
        reason:
          'This contract encodes the header role and name, the expanded state, the fixed-panel disabled state, and their transitions. Other button semantics remain with BUTTON_PATTERN.',
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
          "This contract encodes accordion state, relationship, and Enter/Space visibility transitions. The trigger's generic button semantics stay with BUTTON_PATTERN.",
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
          'Reveal motion is binding-specific paint over time and is not part of accordion semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels and descriptions',
        reason:
          'The accordion contract introduces no string; trigger and content text come from the binding or caller.',
      },
    },
  });
