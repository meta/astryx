// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file window-splitter.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Window Splitter pattern's role, value, name, relationship, and keyboard requirements
 * @output WINDOW_SPLITTER_PATTERN — the reusable contract a focusable resize separator binds to when it adopts the pattern (ResizeHandle under component:Resizable AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by ResizeHandle and the components that render it
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Key, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/';
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
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const apgReq = (requirement: string, anchor: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'windowsplitter',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteraction';
const APG_ROLE = apgReq(
  'The element that serves as the focusable splitter has role separator.',
  A,
);
const APG_VALUES = apgReq(
  'The separator element has the aria-valuenow property set to a decimal value representing the current position of the separator; aria-valuemin set to the position where the primary pane has its minimum size; aria-valuemax set to the position where the primary pane has its maximum size.',
  A,
);
const APG_NAME = apgReq(
  'If the primary pane has a visible label, it is referenced by aria-labelledby on the separator element. Otherwise, the separator element has a label provided by aria-label.',
  A,
);
const APG_CONTROLS = apgReq(
  'The separator element has aria-controls referring to the primary pane.',
  A,
);
const APG_ARROWS = apgReq(
  'Left Arrow: Moves a vertical splitter to the left. Right Arrow: Moves a vertical splitter to the right. Up Arrow: Moves a horizontal splitter up. Down Arrow: Moves a horizontal splitter down.',
  K,
);
const APG_ENTER = apgReq(
  'Enter: If the primary pane is not collapsed, collapses the pane. If the pane is collapsed, restores the splitter to its previous position.',
  K,
);
const APG_HOME_END = apgReq(
  'Home (Optional): Moves splitter to the position that gives the primary pane its smallest allowed size. End (Optional): Moves splitter to the position that gives the primary pane its largest allowed size.',
  K,
);

/**
 * What a binding knows about one focusable splitter (the subject). Positions
 * are the pixel sizes the separator exposes; `increaseKey` is the arrow that
 * grows `aria-valuenow` in this binding's layout (direction, reversal, and
 * reading direction decide it); `step` is that key's pixel step.
 */
export interface WindowSplitterStateFacts {
  readonly valueNow: number;
  readonly valueMin: number;
  /** The maximum the separator exposes, or null when the binding sets none (a recorded gap). */
  readonly valueMax: number | null;
  /** The axis the separator LIES along: a left/right pane handle is `vertical`. */
  readonly orientation: 'horizontal' | 'vertical';
  readonly increaseKey: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown';
  readonly step: number;
  /** Whether the user is meant to be able to move the separator. */
  readonly operable: boolean;
  /** Whether Enter collapses and restores the primary pane. */
  readonly collapsible: boolean;
  /**
   * Whether the pane starts collapsed. The collapse-and-restore row assumes
   * an open pane, so it does not run here; the arrow row still does, since a
   * collapsed pane must still answer the keyboard.
   */
  readonly startsCollapsed?: boolean;
}

const ALWAYS = {
  condition: 'the binding designates a focusable splitter',
  test: () => true,
};

const OPPOSITE: Record<WindowSplitterStateFacts['increaseKey'], Key> = {
  ArrowRight: 'ArrowLeft',
  ArrowLeft: 'ArrowRight',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
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

async function focusOrFail(subject: Subject, forWhat: string): Promise<void> {
  await subject.focus();
  if (!(await subject.isFocused())) {
    throw new Error(
      `the splitter did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

async function expectValue(
  subject: Subject,
  expected: number,
  after: string,
): Promise<void> {
  const now = await valueNow(subject);
  if (Math.abs(now - expected) > 0.5) {
    throw new Error(`${after} left aria-valuenow at ${now}, not ${expected}`);
  }
}

function clampTo(facts: WindowSplitterStateFacts, target: number): number {
  const upper = facts.valueMax ?? Number.POSITIVE_INFINITY;
  return Math.min(upper, Math.max(facts.valueMin, target));
}

export const WINDOW_SPLITTER_PATTERN: PatternContract<WindowSplitterStateFacts> =
  definePattern<WindowSplitterStateFacts>({
    pattern: 'windowsplitter',
    url: APG_URL,
    scope:
      "A focusable splitter's role and name, its position and bounds, the pane it controls, its orientation, and the arrow, Enter, Home and End keys.",
    expectations: [
      {
        id: 'windowsplitter.separator.role-and-name',
        outcome:
          'The browser exposes the splitter as a named separator, so a user hears which pane they are resizing.',
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
          if (role !== 'separator' && role !== 'splitter') {
            throw new Error(
              `the browser exposes this splitter as ${role == null ? 'no role' : `"${role}"`}, not as a separator`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this splitter',
            );
          }
        },
      },
      {
        id: 'windowsplitter.separator.position-and-minimum',
        outcome:
          'The splitter states where it is and the smallest size the pane can take, so a user hears their position in the range.',
        sources: [WCAG_4_1_2, APG_VALUES],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const now = await valueNow(subject);
          const min = await numericAttribute(subject, 'aria-valuemin');
          if (now !== facts.valueNow || min !== facts.valueMin) {
            throw new Error(
              `the splitter exposes now/min ${now}/${min}, not ${facts.valueNow}/${facts.valueMin}`,
            );
          }
          if (now < min) {
            throw new Error('aria-valuenow lies below aria-valuemin');
          }
        },
      },
      {
        id: 'windowsplitter.separator.maximum',
        outcome:
          'The splitter states the largest size the pane can take, so a user hears where the range ends.',
        sources: [WCAG_4_1_2, APG_VALUES],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const raw = await subject.attribute('aria-valuemax');
          if (raw == null) {
            throw new Error('the splitter exposes no aria-valuemax');
          }
          const max = Number(raw);
          if (!Number.isFinite(max)) {
            throw new Error(`aria-valuemax is "${raw}", not a number`);
          }
          if (facts.valueMax != null && max !== facts.valueMax) {
            throw new Error(`aria-valuemax is ${max}, not ${facts.valueMax}`);
          }
          if (max < facts.valueMin) {
            throw new Error('aria-valuemax lies below aria-valuemin');
          }
          const now = await valueNow(subject);
          if (now > max) {
            throw new Error('aria-valuenow lies above aria-valuemax');
          }
        },
      },
      {
        id: 'windowsplitter.separator.orientation',
        outcome:
          'The splitter says which axis it lies along, so a user knows which arrows move it.',
        sources: [WCAG_4_1_2, APG_ARROWS],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const orientation = await subject.attribute('aria-orientation');
          // A separator's default is horizontal; the bar that divides
          // left/right panes must say vertical.
          const actual = orientation ?? 'horizontal';
          if (actual !== facts.orientation) {
            throw new Error(
              `aria-orientation is ${orientation ?? 'absent (horizontal)'}, not ${facts.orientation}`,
            );
          }
        },
      },
      {
        id: 'windowsplitter.separator.controls-pane',
        outcome:
          'The splitter names the pane it resizes, so assistive technology can relate the control to its target.',
        sources: [WCAG_1_3_1, APG_CONTROLS],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const controls = await subject.attribute('aria-controls');
          if (controls == null || controls.trim() === '') {
            throw new Error('the splitter carries no aria-controls');
          }
          const pane = await harness.related('pane');
          if (!(await harness.references(subject, 'aria-controls', pane))) {
            throw new Error(
              `aria-controls points at "${controls}", not at the pane the binding designates`,
            );
          }
        },
      },
      {
        id: 'windowsplitter.keys.arrows-move',
        outcome:
          'One arrow moves the splitter so the pane grows by a step and the opposite arrow moves it back.',
        sources: [WCAG_2_1_1, APG_ARROWS],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the splitter can be moved',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'the arrow keys');
          await harness.press(facts.increaseKey);
          await expectValue(
            subject,
            clampTo(facts, facts.valueNow + facts.step),
            `${facts.increaseKey} (grow)`,
          );
          await harness.press(OPPOSITE[facts.increaseKey]);
          await expectValue(
            subject,
            facts.valueNow,
            `${OPPOSITE[facts.increaseKey]} (shrink)`,
          );
        },
      },
      {
        id: 'windowsplitter.keys.enter-collapses-and-restores',
        outcome:
          'Enter collapses the pane and announces it; Enter again restores the splitter to where it was.',
        sources: [WCAG_2_1_1, APG_ENTER],
        covers: ['2.1.1-keyboard', '4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the pane is collapsible, starts open, and the splitter can be moved',
          test: facts =>
            facts.collapsible && facts.operable && !facts.startsCollapsed,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'Enter');
          await harness.press('Enter');
          const text = await subject.attribute('aria-valuetext');
          if (text == null || text.trim() === '') {
            throw new Error(
              'Enter did not collapse the pane (no aria-valuetext announces the collapsed state)',
            );
          }
          await harness.press('Enter');
          const after = await subject.attribute('aria-valuetext');
          if (after != null) {
            throw new Error(
              'a second Enter did not restore the pane (aria-valuetext still announces it collapsed)',
            );
          }
          await expectValue(subject, facts.valueNow, 'Enter (restore)');
        },
      },
      {
        id: 'windowsplitter.keys.home-end',
        outcome:
          'Home gives the pane its smallest allowed size and End its largest.',
        sources: [WCAG_2_1_1, APG_HOME_END],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the splitter can be moved',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "Home and End are optional in the APG pattern; this becomes required once the binding's component record adopts them as current (AST-020 FR9).",
        run: async ({harness, subject, facts}) => {
          await focusOrFail(subject, 'Home and End');
          await harness.press('Home');
          await expectValue(subject, facts.valueMin, 'Home');
          await harness.press('End');
          // End should reach the maximum the separator exposes. Without a
          // configured maximum that is the reported stand-in (or, when none is
          // exposed, there is nowhere for End to go: it stays at the minimum
          // Home just reached). The row reports what End does rather than
          // skipping the state.
          const exposedMax = await subject.attribute('aria-valuemax');
          const endTarget =
            facts.valueMax ??
            (exposedMax != null && Number.isFinite(Number(exposedMax))
              ? Number(exposedMax)
              : facts.valueMin);
          await expectValue(subject, endTarget, 'End');
        },
      },
      {
        id: 'windowsplitter.separator.unavailable-keeps-position',
        outcome:
          'An unavailable splitter says so and keeps its position on every key, so a locked layout never moves under the keyboard.',
        sources: [WCAG_4_1_2, APG_ARROWS],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the splitter cannot be moved',
          test: facts => !facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          if ((await subject.attribute('aria-disabled')) !== 'true') {
            throw new Error(
              'an unavailable splitter does not carry aria-disabled="true"',
            );
          }
          await subject.focus();
          if (!(await subject.isFocused())) {
            // Out of the Tab order: nothing can reach it, so nothing moves.
            return;
          }
          for (const key of [facts.increaseKey, 'Home', 'Enter'] as const) {
            await harness.press(key);
            await expectValue(
              subject,
              facts.valueNow,
              `${key} on an unavailable splitter`,
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
          "This contract owns the splitter's semantics and keys. The grip pill and divider line the binding paints are decorative composition.",
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's pane structure tests and page-level relationship review",
        reason:
          "This contract proves the splitter names the pane it controls. The panes themselves and their landmarks are the binding's and the page's.",
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's DOM-order tests and page-level reading-order review",
        reason:
          "Where the splitter sits between its panes, and the panes' reading order, is composition.",
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the binding component',
        verifiedBy:
          "this contract's role row (the separator carries role, name and value properties and no input purpose) and the component's render tests",
        reason:
          "A splitter collects a layout position, not information about the user that autofill could supply; the binding's separator is the only control it renders.",
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's hover, focus and disabled state tests plus rendered review",
        reason:
          'Hover, drag and disabled cues on the handle are paint results owned by the binding and theme; this contract proves the programmatic position and state.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'A splitter paints no text; the collapsed announcement is programmatic.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the divider, grip and focus indicator',
        reason:
          'Divider, grip and focus indicator contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          "This contract encodes the splitter's arrow, Enter, Home and End keys. Reaching the splitter, F6 pane cycling, and other page keyboard paths remain with the composition.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy: "the component's Tab tests and page-level keyboard review",
        reason:
          'A splitter adds no focus trap; Tab entry and exit are generic focus behavior.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A splitter rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          "The splitter's place among surrounding controls depends on composition.",
      },
      '2.4.4-link-purpose': {
        owner: 'the binding component',
        verifiedBy:
          "this contract's role row and the component's render tests (the handle renders a separator and a grab zone, no anchor)",
        reason:
          'A splitter renders no link; the composing page owns any link placed around it.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'This contract proves the splitter has a name; whether that label is descriptive is caller content.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's focus-outline tests and rendered focus review",
        reason:
          "The focused splitter's indicator is a paint result owned by the binding and theme.",
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level layout review',
        reason:
          'Whether another surface covers the focused splitter depends on composition.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy:
          "the component's pointer suites: capture on the grab zone, moves from a pointer that does not own the drag are ignored, a drag that ends normally reports no cancel, pointercancel and lost capture end the gesture, and double-click collapse/restore",
        reason:
          "A splitter moves through the drag itself (the down event starts a reversible gesture; releasing ends it), so the pointer model is the binding's and outside this keyboard contract. The handle has no Escape cancel; the browser's pointercancel and lost capture are what end an interrupted drag.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's accessible-name tests",
        reason:
          'A splitter has no visible text label; its name is authored by the binding.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over the grab zone",
        reason:
          "The grab zone's hit area is geometry owned by the binding and theme.",
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A splitter owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy:
          'integration review of what a caller does with onSizeChange and onCollapseChange',
        reason:
          "Resizing or collapsing a pane is the splitter's own purpose; any further context change a caller makes is the caller's action.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing page',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated splitter labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated splitter.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "this contract's value rows (aria-valuenow stays within aria-valuemin/aria-valuemax, so no entry can be in error) and the composing page's form checks",
        reason:
          'A splitter has no free entry to validate: its value is clamped to its bounds as it changes; a form around it reports its own errors.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "this contract's name row (every separator is labelled) and the composing page's review of any instructions around it",
        reason:
          "The separator is named by its label; a splitter needs no entry instructions, and any guidance about the layout is the composing page's.",
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component',
        verifiedBy: "the component's collapsed-state and disabled tests",
        reason:
          "This contract encodes the splitter's role, name, position, bounds, orientation, collapsed text and disabled state. The panes' own roles are the binding's and the page's.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken or braille output',
        reason:
          'A size change is not a status-message contract; the collapsed state is exposed through aria-valuetext, not a live region.',
      },
      'apg-interaction': {
        owner: "the binding component's record",
        verifiedBy:
          'component:Resizable AR1 and its decision entry, which adopt the pattern as one composite control and name the gaps',
        reason:
          "This contract encodes the splitter role, position, bounds, name, relationship and keys. F6 pane cycling is not adopted; the pointer drag model is the binding's.",
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
          'Pane and handle motion is binding-specific paint over time and is not part of splitter semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          "The splitter contract introduces no string; the label and the collapsed text come from the binding's catalog.",
      },
    },
  });
