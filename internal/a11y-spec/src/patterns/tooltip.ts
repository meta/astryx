// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltip.ts
 * @input WCAG 2.2 A/AA success criteria (1.3.1, 2.1.1, 4.1.2, and 1.4.13 Content on Hover or Focus), the APG Tooltip pattern's role, relationship, focus, and Escape requirements, and spec:AST-020 FR15
 * @output TOOLTIP_PATTERN — the reusable contract a tooltip binds to: its tooltip role, the trigger described by it, keyboard focus showing it while focus stays on the trigger, Escape dismissing it, and hover keeping it while the pointer rests on the trigger or the tooltip; focus leaving hiding it, hover showing it and the pointer leaving hiding it are advisory
 * @position Pattern contract; bound by Tooltip and useTooltip (`spec:AST-020/FR15`: a tooltip plays the tooltip role, so it adopts the pattern's role and relationship; it is not a composite control, so it gains no arrow or Home/End keys)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_1_4_13: WcagCriterion = {
  standard: 'wcag',
  id: '1.4.13',
  name: 'Content on Hover or Focus',
  level: 'AA',
  url: `${UNDERSTANDING}/content-on-hover-or-focus.html`,
};
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

const ROLES = `${APG_URL}#wai-ariaroles,states,andproperties`;
const KEYS = `${APG_URL}#keyboardinteraction`;

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'The element that serves as the tooltip container has role tooltip.',
  url: ROLES,
};
const APG_DESCRIBEDBY: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'The element that triggers the tooltip references the tooltip element with aria-describedby.',
  url: ROLES,
};
const APG_SHOWS: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'A tooltip is a popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.',
  url: APG_URL,
};
const APG_FOCUS_STAYS: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'Focus stays on the triggering element while the tooltip is displayed.',
  url: KEYS,
};
const APG_ESCAPE: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement: 'Escape: Dismisses the Tooltip.',
  url: KEYS,
};
const APG_BLUR: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'If the tooltip is invoked when the trigger element receives focus, then it is dismissed when it no longer has focus (onBlur).',
  url: KEYS,
};
const APG_HOVER_STAYS: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'If the tooltip is invoked when a pointing cursor moves over the trigger element, then it remains open as long as the cursor is over the trigger or the tooltip.',
  url: KEYS,
};
const APG_MOUSE_OUT: ApgRequirement = {
  standard: 'apg',
  pattern: 'tooltip',
  requirement:
    'It typically appears after a small delay and disappears when Escape is pressed or on mouse out.',
  url: APG_URL,
};

/**
 * The current Astryx adoption rule. A tooltip plays the tooltip role, so it
 * takes the pattern's role and its relationship to the trigger; keyboard focus
 * reaching the hint rests on WCAG 2.1.1. It is not one composite control, so
 * it gains no arrow or Home/End keys. The pattern's blur and hover behaviour is
 * not among the parts the rule names, so those rows stay advisory.
 */
const AST_020_FR15: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-020',
  clause: 'FR15',
  url: 'https://github.com/meta/astryx/blob/577a62e5901911a24b5a485ac4c0bdf5fca4ef1f/docs/specs/AST-020/spec.md#L83-L92',
  requirement:
    "Where a component part already plays an APG pattern's role, Astryx adopts that pattern's required parts for it: the role, the accessible name, the state and relationship properties, and activation by Tab plus Enter or Space. The pattern's optional keyboard extras — arrow-key movement between parts, Home and End — are adopted only where the component already acts as one composite control.",
};

/**
 * What a binding knows about one tooltip. The subject is the trigger: the
 * element the tooltip describes, which takes focus and hover. Relations:
 * `tooltip` (the element with role tooltip, present in the page whether or
 * not it is showing), `before` and `after` (focusable controls on either side
 * of the trigger in the page Tab order).
 */
export interface TooltipStateFacts {
  /**
   * Whether resting the pointer on the trigger shows the tooltip. WCAG 1.4.13's
   * hoverable and dismissible requirements apply to content hover can show,
   * so the hover rows apply only when it can.
   */
  readonly showsOnHover: boolean;
  /** How long the binding waits after the pointer arrives before it shows the tooltip, in milliseconds. */
  readonly showDelayMs: number;
}

/** How long a tooltip gets to appear or disappear beyond its declared delay. */
const SETTLE_BUDGET_MS = 1000;
/**
 * How long the tooltip must stay while the pointer rests on the trigger or on
 * the tooltip itself. Longer than any hover bridge or hide delay a binding uses
 * to let the pointer cross between them, so a tooltip that times out or
 * vanishes on the crossing fails here.
 */
const PERSIST_MS = 1000;
const POLL_MS = 25;

const ALWAYS = {
  condition: 'the binding designates a tooltip and its trigger',
  test: () => true,
};

const ON_HOVER = {
  condition: 'resting the pointer on the trigger shows the tooltip',
  test: (facts: TooltipStateFacts) => facts.showsOnHover,
};

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Whether `check` becomes true within `withinMs`, polling as the page settles. */
async function becomes(
  check: () => Promise<boolean>,
  withinMs: number,
): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  for (;;) {
    if (await check()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await pause(POLL_MS);
  }
}

async function expectHidden(tooltip: Subject, before: string): Promise<void> {
  if (await tooltip.isVisible()) {
    throw new Error(
      `the tooltip was already showing ${before}, so the check cannot tell what made it appear`,
    );
  }
}

async function expectShows(
  tooltip: Subject,
  withinMs: number,
  after: string,
): Promise<void> {
  if (!(await becomes(() => tooltip.isVisible(), withinMs))) {
    throw new Error(`${after} did not show the tooltip within ${withinMs}ms`);
  }
}

async function expectGone(
  tooltip: Subject,
  withinMs: number,
  after: string,
): Promise<void> {
  if (!(await becomes(async () => !(await tooltip.isVisible()), withinMs))) {
    throw new Error(
      `the tooltip was still showing ${withinMs}ms after ${after}`,
    );
  }
}

/** Tab from the control before the trigger, the way a keyboard user arrives. */
async function tabOntoTrigger(
  harness: Harness,
  trigger: Subject,
): Promise<void> {
  const before = await harness.related('before');
  await harness.pointerAway();
  await before.focus();
  if (!(await before.isFocused())) {
    throw new Error('the control before the trigger did not take focus');
  }
  await harness.press('Tab');
  if (!(await trigger.isFocused())) {
    throw new Error(
      'Tab from the control before the trigger did not move focus to the trigger',
    );
  }
}

export const TOOLTIP_PATTERN: PatternContract<TooltipStateFacts> =
  definePattern<TooltipStateFacts>({
    pattern: 'tooltip',
    url: APG_URL,
    scope:
      "A tooltip's role, its trigger described by it, keyboard focus showing it while focus stays on the trigger, Escape dismissing it whether focus or hover showed it, and hover keeping it while the pointer rests on the trigger or the tooltip; focus leaving hiding it, hover showing it and the pointer leaving hiding it are reported as advisory.",
    expectations: [
      {
        id: 'tooltip.surface.role',
        outcome:
          'The popup is a tooltip, so assistive technology treats it as a description of its trigger and not as a separate widget to visit.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness}) => {
          const role = await (
            await harness.related('tooltip')
          ).attribute('role');
          if (role !== 'tooltip') {
            throw new Error(
              `the popup's role is ${role == null ? 'absent' : `"${role}"`}, not tooltip`,
            );
          }
        },
      },
      {
        id: 'tooltip.trigger.described-by-tooltip',
        outcome:
          "The trigger's aria-describedby names the tooltip, so the relationship between the control and its hint is in the markup, not only in where the hint is painted.",
        sources: [WCAG_1_3_1, APG_DESCRIBEDBY],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const tooltip = await harness.related('tooltip');
          if (
            !(await harness.references(subject, 'aria-describedby', tooltip))
          ) {
            const value = await subject.attribute('aria-describedby');
            throw new Error(
              `the trigger's aria-describedby (${value == null ? 'absent' : `"${value}"`}) does not name the tooltip`,
            );
          }
        },
      },
      {
        id: 'tooltip.trigger.description',
        outcome:
          "The browser computes the tooltip's text into the trigger's accessible description, so a screen-reader user hears the hint on the control without hovering it.",
        sources: [WCAG_4_1_2, APG_DESCRIBEDBY],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const text = (await (await harness.related('tooltip')).textContent())
            .replace(/\s+/g, ' ')
            .trim();
          if (text === '') {
            throw new Error('the tooltip has no text to describe its trigger');
          }
          const {description} = await subject.computed();
          if (!description.replace(/\s+/g, ' ').includes(text)) {
            throw new Error(
              `the trigger's computed description is "${description}", which does not carry the tooltip's text "${text}"`,
            );
          }
        },
      },
      {
        id: 'tooltip.focus.shows-on-keyboard-focus',
        outcome:
          'Tabbing onto the trigger shows the tooltip while focus stays on the trigger, and it stays as long as focus does, so a keyboard user gets the same hint a mouse user gets by hovering, has time to read it, and can carry on from the control.',
        sources: [
          WCAG_2_1_1,
          WCAG_1_4_13,
          APG_SHOWS,
          APG_FOCUS_STAYS,
          AST_020_FR15,
        ],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          await harness.pointerAway();
          await harness.resetFocus();
          await expectHidden(tooltip, 'before the trigger had focus');
          await tabOntoTrigger(harness, subject);
          await expectShows(
            tooltip,
            facts.showDelayMs + SETTLE_BUDGET_MS,
            'Tab onto the trigger',
          );
          if (!(await subject.isFocused())) {
            throw new Error(
              'showing the tooltip moved focus off the trigger; focus stays on the trigger while the tooltip is displayed',
            );
          }
          await pause(PERSIST_MS);
          if (!(await tooltip.isVisible())) {
            throw new Error(
              `the tooltip disappeared within ${PERSIST_MS}ms while focus stayed on the trigger`,
            );
          }
          if (!(await subject.isFocused())) {
            throw new Error('focus left the trigger while the tooltip showed');
          }
        },
      },
      {
        id: 'tooltip.keys.escape-dismisses',
        outcome:
          'Escape hides the tooltip without moving focus or the pointer, whether keyboard focus or (where it can) hover showed it, so a user can clear a hint that covers what they want to read.',
        sources: [WCAG_1_4_13, APG_ESCAPE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          const showWithin = facts.showDelayMs + SETTLE_BUDGET_MS;
          await harness.resetFocus();
          await tabOntoTrigger(harness, subject);
          await expectShows(tooltip, showWithin, 'Tab onto the trigger');
          await harness.press('Escape');
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'Escape on the focused trigger',
          );
          if (!(await subject.isFocused())) {
            throw new Error('Escape moved focus off the trigger');
          }
          if (!facts.showsOnHover) {
            return;
          }

          await harness.resetFocus();
          await harness.pointerAway();
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'focus and the pointer left',
          );
          await harness.hover(subject);
          await expectShows(tooltip, showWithin, 'hovering the trigger');
          await harness.press('Escape');
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'Escape with the pointer resting on the trigger',
          );
        },
      },
      {
        id: 'tooltip.focus.leaving-hides',
        outcome:
          'Tabbing off the trigger hides the tooltip, so a hint for a control the user has left does not linger over the next one.',
        sources: [APG_BLUR],
        wcagOutcome:
          'Supports WCAG 2.2 2.4.11 Focus Not Obscured by keeping a hint for a control the user has left from lingering over the control they Tab to next; 2.4.11 itself is a placement outcome owned by the layer runtime and the page, so this row reports the shipped behaviour without gating.',
        covers: ['apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          'Hiding on blur is the APG Tooltip pattern’s own behaviour, but spec:AST-020 FR15 names only the role, the name, the state and relationship properties and Tab plus Enter or Space as adopted required parts, and the Tooltip component record is draft; it becomes required once a current record names it as adopted (AST-020 FR9).',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          await harness.resetFocus();
          await tabOntoTrigger(harness, subject);
          await expectShows(
            tooltip,
            facts.showDelayMs + SETTLE_BUDGET_MS,
            'Tab onto the trigger',
          );
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error('Tab from the trigger left focus on it');
          }
          await expectGone(tooltip, SETTLE_BUDGET_MS, 'Tab off the trigger');
        },
      },
      {
        id: 'tooltip.hover.shows-on-hover',
        outcome:
          'Resting the pointer on the trigger shows the tooltip after its delay, so a mouse user gets the hint without clicking.',
        sources: [APG_SHOWS],
        wcagOutcome:
          'Supports WCAG 2.2 1.4.13 and 2.1.1 by giving a mouse user the hint keyboard focus already gives; WCAG requires the keyboard path, encoded above, not a hover path, so this row reports the shipped behaviour without gating.',
        covers: ['apg-interaction'],
        appliesWhen: ON_HOVER,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          'Showing on hover is part of the APG Tooltip definition, but spec:AST-020 FR15 names only the role, the name, the state and relationship properties and Tab plus Enter or Space as adopted required parts, and the Tooltip component record is draft; it becomes required once a current record names it as adopted (AST-020 FR9).',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          await harness.resetFocus();
          await harness.pointerAway();
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'focus and the pointer left',
          );
          await harness.hover(subject);
          await expectShows(
            tooltip,
            facts.showDelayMs + SETTLE_BUDGET_MS,
            'hovering the trigger',
          );
        },
      },
      {
        id: 'tooltip.hover.stays-while-hovered',
        outcome:
          'The tooltip stays while the pointer rests on the trigger, and stays when the pointer moves onto the tooltip itself, so a mouse user can read it, or magnify it, without it timing out or vanishing under the pointer.',
        sources: [WCAG_1_4_13, APG_HOVER_STAYS],
        covers: ['apg-interaction'],
        appliesWhen: ON_HOVER,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          await harness.resetFocus();
          await harness.pointerAway();
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'focus and the pointer left',
          );
          await harness.hover(subject);
          await expectShows(
            tooltip,
            facts.showDelayMs + SETTLE_BUDGET_MS,
            'hovering the trigger',
          );
          await pause(PERSIST_MS);
          if (!(await tooltip.isVisible())) {
            throw new Error(
              `the tooltip disappeared within ${PERSIST_MS}ms while the pointer rested on the trigger`,
            );
          }
          await harness.hover(tooltip);
          await pause(PERSIST_MS);
          if (!(await tooltip.isVisible())) {
            throw new Error(
              'the tooltip disappeared when the pointer moved from the trigger onto the tooltip',
            );
          }
        },
      },
      {
        id: 'tooltip.hover.leaving-hides',
        outcome:
          'Moving the pointer off both the trigger and the tooltip hides the tooltip, so a hint does not stay behind over content the user has moved on to.',
        sources: [APG_MOUSE_OUT],
        wcagOutcome:
          'Supports WCAG 2.2 1.4.13 by keeping hover content tied to the hover that summoned it; 1.4.13 itself requires only that the content can be dismissed (Escape, encoded above), so this row reports the shipped behaviour without gating.',
        covers: ['apg-interaction'],
        appliesWhen: ON_HOVER,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          'The APG describes hiding on mouse out as what a tooltip typically does, not as a required part, and WCAG 1.4.13 requires only that hover content be dismissible, which the Escape row gates; it becomes required once the binding’s component record names it as adopted and that record is current (AST-020 FR9, FR15).',
        run: async ({harness, subject, facts}) => {
          const tooltip = await harness.related('tooltip');
          await harness.resetFocus();
          await harness.pointerAway();
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'focus and the pointer left',
          );
          await harness.hover(subject);
          await expectShows(
            tooltip,
            facts.showDelayMs + SETTLE_BUDGET_MS,
            'hovering the trigger',
          );
          await harness.pointerAway();
          await expectGone(
            tooltip,
            SETTLE_BUDGET_MS,
            'the pointer left the trigger and the tooltip',
          );
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the trigger and caller content',
        verifiedBy:
          "the trigger's own pattern contract (button, link) and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'A tooltip paints no graphic of its own; an icon-only trigger names itself through its own pattern, and the tooltip describes it rather than naming it.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'caller content',
        verifiedBy: 'content review of any structure placed inside a tooltip',
        reason:
          'This contract encodes the trigger-to-tooltip relationship. Structure inside the tooltip text is caller content; a tooltip is short text, so headings or lists inside it are a content choice.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and the layer runtime',
        verifiedBy:
          "the binding's layer placement tests (Tooltip.test.tsx) and the layer runtime's mount-position tests",
        reason:
          'The tooltip reaches assistive technology through the description relationship, so where it sits in the reading order does not change what the trigger announces.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the trigger and the composing form',
        verifiedBy:
          'the text-input contract and form integration review of any user-information input that carries a tooltip',
        reason: 'A tooltip collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and the theme',
        verifiedBy: 'the repository visual gate and forced-colors review',
        reason:
          'A tooltip carries no state of its own that color alone could signal; its text is the content.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and the theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Tooltip text contrast depends on the resolved inverted surface and text colors of the theme.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and the theme',
        verifiedBy:
          'the repository visual gate and rendered review of the tooltip surface edge',
        reason:
          'The tooltip surface boundary is a paint outcome owned by the component styling and the theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the trigger',
        verifiedBy:
          "the trigger's own pattern contract (button, link) for its activation",
        reason:
          'This contract encodes keyboard focus showing the tooltip and Escape dismissing it. Activating the trigger is the trigger’s own pattern; a tooltip itself takes no focus and has no activation.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the composing page',
        verifiedBy:
          'this contract’s advisory focus-leaving row, which reports that Tab moves off the trigger, plus page-level keyboard review',
        reason:
          'A tooltip takes no focus, so it cannot hold it; where Tab goes beyond the trigger is the composition.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A tooltip rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the trigger and the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          'A tooltip adds no stop to the Tab order; this contract proves focus stays on the trigger while it shows. The trigger among surrounding controls is the composition.',
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy: 'LINK_PATTERN and content review of link text',
        reason:
          'A link that carries a tooltip names its purpose through its own text; the tooltip only adds a description.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy: 'content review of tooltip text',
        reason:
          'Whether a tooltip’s text helps is a caller-content judgement; this contract checks that the text reaches the trigger’s description.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record, the trigger, and the theme',
        verifiedBy:
          "the trigger's focus-ring styling and the repository visual gate",
        reason:
          'The focus ring belongs to the focused trigger; the tooltip never takes focus.',
      },
      '2.4.11-focus-not-obscured': {
        owner:
          'the binding component, the layer runtime and the composing page',
        verifiedBy:
          "the layer runtime's anchor-placement tests and page-level review of sticky surfaces",
        reason:
          'The tooltip is placed beside its trigger by the layer runtime, so whether it or another surface hides a focused control is placement and page geometry; this contract’s advisory focus-leaving row reports that it leaves when focus does.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the trigger',
        verifiedBy: "the trigger's own pattern contract (button, link)",
        reason:
          'A tooltip has no pointer activation of its own; pressing the trigger is the trigger’s action.',
      },
      '2.5.3-label-in-name': {
        owner: 'the trigger and caller content',
        verifiedBy:
          "the trigger's own pattern contract and content review of visible labels",
        reason:
          'A tooltip describes its trigger; it does not supply the name, so the visible label and the name are the trigger’s.',
      },
      '2.5.8-target-size': {
        owner: 'the trigger and the theme',
        verifiedBy: "the repository axe audit's target-size rule",
        reason: 'A tooltip is not a pointer target; the target is the trigger.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level language review',
        reason: 'A tooltip rendered in isolation owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the trigger and the caller',
        verifiedBy: 'integration review of what the trigger does when changed',
        reason:
          'Showing or hiding a tooltip changes no setting; what the trigger does when operated is the trigger and its caller.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and caller content',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated tooltip text',
        reason:
          'Consistency is a property of the set of repeated tooltips, not one tooltip.',
      },
      '3.3.1-error-identification': {
        owner: 'the composing form and the field status pattern',
        verifiedBy: 'form-level error-state review',
        reason:
          'The tooltip pattern defines no validation error state; a field error is announced by the field, not by a hover hint.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the trigger and caller content',
        verifiedBy: 'form-level review of labels and instructions',
        reason:
          'A tooltip may carry an instruction, but whether a field’s instructions are sufficient is the field and its caller.',
      },
      '4.1.2-name-role-value': {
        owner: 'the trigger',
        verifiedBy: "the trigger's own pattern contract (button, link)",
        reason:
          'This contract encodes the tooltip role and the description it gives the trigger. The trigger’s own role, name and state are its own pattern.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken output',
        reason:
          'A tooltip is a description read with its trigger, not a status message, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the binding's touch-trigger, controlled-open and press-to-hide tests (Tooltip.test.tsx, useTooltip.test.tsx) and content review",
        reason:
          'This contract encodes the role, the description relationship, focus showing, Escape and hover staying, and reports focus leaving, hover showing and pointer leaving as advisory. That a tooltip holds no focusable content is caller content — interactive hover content belongs to a non-modal dialog such as HoverCard, not a tooltip; touch, where there is no hover, and press-to-hide are binding behaviour the APG leaves to the author.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and the theme',
        verifiedBy:
          'rendered Windows High Contrast review of the tooltip surface',
        reason: 'Forced-colors output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the layer runtime and the theme',
        verifiedBy:
          'the layer animation reduced-motion source tests and rendered motion review',
        reason:
          'The tooltip’s entry and exit motion comes from the shared layer animations.',
      },
      'at-facing-strings': {
        owner: 'caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored tooltip text',
        reason:
          'The tooltip contract introduces no string; the tooltip text comes from the caller.',
      },
    },
  });
