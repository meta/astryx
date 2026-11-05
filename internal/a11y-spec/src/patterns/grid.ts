// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file grid.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Grid pattern's role, structure, name, selection, and data-grid keyboard requirements
 * @output GRID_PATTERN — the reusable contract a composite grid binds to when it adopts the pattern (Calendar's month grid under component:Calendar AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by Calendar (DateInput's month panes to follow)
 */

import type {Subject} from '../harness';
import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type WebStandardRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/grid/';
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
const WCAG_2_4_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.4.3',
  name: 'Focus Order',
  level: 'A',
  url: `${UNDERSTANDING}/focus-order.html`,
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
  pattern: 'grid',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteractionfordatagrids';
const APG_ROLE = apgReq('The grid container has role grid.', A);
const APG_ROWS = apgReq(
  'Each row container has role row and is either a DOM descendant of or owned by the grid element or an element with role rowgroup. Each cell is either a DOM descendant of or owned by a row element and has role columnheader if it contains header information for the column, rowheader if for the row, or gridcell otherwise.',
  A,
);
const APG_NAME = apgReq(
  'If there is an element in the user interface that serves as a label for the grid, aria-labelledby is set on the grid element; otherwise, a label is specified for the grid element using aria-label.',
  A,
);
const APG_SELECTION = apgReq(
  'If the grid supports selection, when a cell or row is selected, the selected element has aria-selected set true.',
  A,
);
const ARIA_MULTISELECTABLE: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2',
  requirement:
    'aria-multiselectable: Indicates that the user may select more than one item from the current selectable descendants.',
  url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-multiselectable',
};
const APG_FOCUS = apgReq(
  'Only one of the focusable elements contained by the grid is included in the page tab sequence.',
  'about-this-pattern',
);
const APG_ARROWS = apgReq(
  'Right Arrow: Moves focus one cell to the right. Left Arrow: Moves focus one cell to the left. Down Arrow: Moves focus one cell down. Up Arrow: Moves focus one cell up.',
  K,
);
const APG_HOME_END = apgReq(
  'Home: moves focus to the first cell in the row that contains focus. End: moves focus to the last cell in the row that contains focus.',
  K,
);
const CALENDAR_AR1_ACTIVATE: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Calendar',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/66d7146e5aeb8e983b6803c3571a8e871135a35c/packages/core/src/Calendar/Calendar.spec.md#L141-L143',
  requirement: 'Enter or Space picks the focused day.',
};

/**
 * What a binding knows about one grid (the subject). The binding also
 * designates related subjects around one `start` cell's focus target: `next`
 * and `previous` (the cells one column forward and back in reading order),
 * `below` and `above` (one row down and up), and `rowStart` and `rowEnd`
 * (the first and last cells of the start row). Any that do not exist for the
 * chosen start cell are omitted and the matching key is not pressed.
 */
export interface GridStateFacts {
  /** Whether the grid's first row is a header row of `columnheader` cells. */
  readonly hasColumnHeaders: boolean;
  /** Whether the grid is on a right-to-left page (the inline arrows follow reading order). */
  readonly rtl: boolean;
  /** Whether the grid claims `aria-multiselectable`. */
  readonly multiselectable: boolean;
  /** How many cells the binding has selected in this state. */
  readonly selectedCount: number;
  /** Whether Enter on the start cell selects it (the binding's default action). */
  readonly enterSelectsStart: boolean;
  /** Which related neighbours the start cell has in this state. */
  readonly neighbours: ReadonlyArray<
    'next' | 'previous' | 'below' | 'above' | 'rowStart' | 'rowEnd'
  >;
}

const ALWAYS = {
  condition: 'the binding designates a grid',
  test: () => true,
};

async function expectFocused(subject: Subject, after: string): Promise<void> {
  if (!(await subject.isFocused())) {
    throw new Error(`${after} did not move focus to the expected cell`);
  }
}

export const GRID_PATTERN: PatternContract<GridStateFacts> =
  definePattern<GridStateFacts>({
    pattern: 'grid',
    url: APG_URL,
    scope:
      "A grid's role and name, its row and cell structure, its single Tab stop, its selection semantics, and the arrow, Home, End and activation keys within it.",
    expectations: [
      {
        id: 'grid.container.role-and-name',
        outcome:
          'The browser exposes the grid as a named grid, so a user hears what the table of cells is.',
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
          if (role !== 'grid') {
            throw new Error(
              `the browser exposes this as ${role == null ? 'no role' : `"${role}"`}, not as a grid`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this grid',
            );
          }
        },
      },
      {
        id: 'grid.structure.rows-and-cells',
        outcome:
          'Every row is a row of gridcells (or column headers), so assistive technology can navigate it as a table.',
        sources: [WCAG_1_3_1, APG_ROWS],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const rows = await subject.descendantCount('[role="row"]');
          if (rows === 0) {
            throw new Error('the grid contains no role="row"');
          }
          const stray = await subject.descendantCount(
            ':scope > :not([role="row"]):not([role="rowgroup"])',
          );
          if (stray > 0) {
            throw new Error(
              `${stray} direct child(ren) of the grid are neither rows nor row groups`,
            );
          }
          const cells = await subject.descendantCount(
            '[role="row"] > :not([role="gridcell"]):not([role="columnheader"]):not([role="rowheader"])',
          );
          if (cells > 0) {
            throw new Error(
              `${cells} row child(ren) are not gridcell, columnheader or rowheader`,
            );
          }
          const headers = await subject.descendantCount(
            '[role="columnheader"]',
          );
          if (facts.hasColumnHeaders && headers === 0) {
            throw new Error(
              'the grid claims column headers but has no columnheader cell',
            );
          }
        },
      },
      {
        id: 'grid.focus.single-tab-stop',
        outcome:
          'Tab lands in the grid once: exactly one cell target is in the Tab order, and the arrows take it from there.',
        sources: [WCAG_2_1_1, WCAG_2_4_3, APG_FOCUS],
        covers: ['2.1.1-keyboard', '2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const stops = await subject.descendantCount(
            '[tabindex="0"], button:not([tabindex]):not([disabled]), a[href]:not([tabindex]), input:not([tabindex]):not([disabled])',
          );
          if (stops !== 1) {
            throw new Error(
              `${stops} elements inside the grid are in the Tab order; a grid is one Tab stop`,
            );
          }
        },
      },
      {
        id: 'grid.selection.exposed',
        outcome:
          'Selected cells say so, and a grid that can hold several selections says that too.',
        sources: [WCAG_4_1_2, APG_SELECTION, ARIA_MULTISELECTABLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const multi = await subject.attribute('aria-multiselectable');
          if (facts.multiselectable && multi !== 'true') {
            throw new Error(
              'a multi-selection grid does not claim aria-multiselectable="true"',
            );
          }
          if (!facts.multiselectable && multi === 'true') {
            throw new Error(
              'a single-selection grid claims aria-multiselectable="true"',
            );
          }
          const selected = await subject.descendantCount(
            '[aria-selected="true"]',
          );
          if (selected !== facts.selectedCount) {
            throw new Error(
              `${selected} cells are exposed as selected, not ${facts.selectedCount}`,
            );
          }
        },
      },
      {
        id: 'grid.keys.arrows',
        outcome:
          'The arrows move focus one cell at a time within the grid — forward and back along the row in reading order, down and up the column.',
        sources: [WCAG_2_1_1, APG_ARROWS],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          const start = await harness.related('start');
          const forward = facts.rtl ? 'ArrowLeft' : 'ArrowRight';
          const back = facts.rtl ? 'ArrowRight' : 'ArrowLeft';
          await start.focus();
          await expectFocused(start, 'focusing the start cell');
          if (facts.neighbours.includes('next')) {
            await harness.press(forward);
            await expectFocused(
              await harness.related('next'),
              `${forward} (forward)`,
            );
            await harness.press(back);
            await expectFocused(start, `${back} (back)`);
          }
          if (facts.neighbours.includes('previous')) {
            await harness.press(back);
            await expectFocused(
              await harness.related('previous'),
              `${back} (back)`,
            );
            await harness.press(forward);
            await expectFocused(start, `${forward} (forward)`);
          }
          if (facts.neighbours.includes('below')) {
            await harness.press('ArrowDown');
            await expectFocused(await harness.related('below'), 'ArrowDown');
            await harness.press('ArrowUp');
            await expectFocused(start, 'ArrowUp');
          }
          if (facts.neighbours.includes('above')) {
            await harness.press('ArrowUp');
            await expectFocused(await harness.related('above'), 'ArrowUp');
            await harness.press('ArrowDown');
            await expectFocused(start, 'ArrowDown');
          }
        },
      },
      {
        id: 'grid.keys.home-end',
        outcome: 'Home moves to the first cell of the row and End to the last.',
        sources: [WCAG_2_1_1, APG_HOME_END],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the start row has a first and last cell to reach',
          test: facts =>
            facts.neighbours.includes('rowStart') &&
            facts.neighbours.includes('rowEnd'),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness}) => {
          const start = await harness.related('start');
          await start.focus();
          await harness.press('Home');
          await expectFocused(await harness.related('rowStart'), 'Home');
          await start.focus();
          await harness.press('End');
          await expectFocused(await harness.related('rowEnd'), 'End');
        },
      },
      {
        id: 'grid.keys.enter-activates',
        outcome:
          "Enter performs the focused cell's default action: here, it selects the cell.",
        sources: [WCAG_2_1_1, CALENDAR_AR1_ACTIVATE],
        wcagOutcome:
          "Supports WCAG 2.2 2.1.1 by keeping the cell's action keyboard-operable; the APG leaves the action to the author and the binding record names it, so this row is advisory until that record is current (AST-020 FR9).",
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'Enter on the start cell selects it',
          test: facts => facts.enterSelectsStart,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "The cell's default action is author-determined in the APG and defined by the binding's draft record; required once that record is current (AST-020 FR9).",
        run: async ({harness}) => {
          const start = await harness.related('start');
          await start.focus();
          await harness.press('Enter');
          const cell = await harness.related('startCell');
          if ((await cell.attribute('aria-selected')) !== 'true') {
            throw new Error('Enter did not select the focused cell');
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          "This contract owns the grid's structure and keys. Icons or images inside cells are the binding's or the caller's composition.",
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component',
        verifiedBy:
          "the component's cell-content tests (today marker, descriptions, headers' names)",
        reason:
          "This contract proves the grid/row/cell hierarchy. What each cell says beyond its role (a date name, a today marker) is the binding's.",
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component',
        verifiedBy: "the component's DOM-order tests",
        reason:
          'Row and cell order follow the data; the structure row proves they are nested as a table reads them.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'A grid cell does not collect information about the user that autofill could supply.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's selected, today, range and disabled state tests plus rendered review",
        reason:
          'Selected, today, in-range and disabled cues are paint results owned by the binding and theme; this contract proves the programmatic selection.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'Cell text contrast is a paint outcome owned by the binding and theme.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the focus indicator and selection fill',
        reason:
          'Focus indicator and selection fill contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's month-navigation and Page-key tests, plus page-level keyboard review",
        reason:
          "This contract encodes the arrows, Home, End and Enter within the grid. Page keys and crossing the grid's edge are author-determined and the binding's; reaching the grid is composition.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and composing page',
        verifiedBy: "the component's Tab tests and page-level keyboard review",
        reason:
          'A grid adds no focus trap: it is one Tab stop and Tab leaves it; the single-Tab-stop row proves the stop count.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A grid rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level focus-order review',
        reason:
          "This contract proves the one Tab stop; the grid's place among surrounding controls is composition.",
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'The bound grids render no link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'This contract proves the grid has a name; whether that name and the column headers are descriptive is content.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's focus-outline tests and rendered focus review",
        reason:
          "The focused cell's indicator is a paint result owned by the binding and theme.",
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level layout review',
        reason:
          'Whether another surface covers the focused cell depends on composition.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy: "the component's pointer selection tests",
        reason:
          "Picking a cell by pointer is the binding's; this contract covers the keyboard.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's cell-name tests",
        reason:
          "Whether a cell's accessible name contains its visible text is the binding's naming requirement.",
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over the cells",
        reason: 'Cell hit areas are geometry owned by the binding and theme.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A grid owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy: 'integration review of what a caller does with onChange',
        reason:
          "Selecting a cell is the grid's own purpose; any further context change a caller makes is the caller's action.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing page',
        verifiedBy: 'this shared contract across bindings plus content review',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated grid.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component',
        verifiedBy:
          "the component's bounds and constraint tests (disabled days)",
        reason:
          "A day outside the bounds is disabled, not an error; the binding's own tests prove the disabled exposure.",
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's label tests",
        reason:
          "This contract proves the grid is named; any instruction text is the binding's or the caller's.",
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component',
        verifiedBy:
          "the component's cell state tests (aria-current, aria-disabled)",
        reason:
          "This contract encodes the grid's role and name, the row/cell roles and the selection state. Per-cell current and disabled states are the binding's.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the binding component and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          "the component's month-change announcement tests and real-AT evidence under AST-009 when a change claims spoken or braille output",
        reason:
          "Moving focus within the grid is not a status message; the month-change announcement is the binding's own live-region claim.",
      },
      'apg-interaction': {
        owner: "the binding component's record",
        verifiedBy:
          'component:Calendar AR1 and FR5, which adopt the pattern as one composite control and define edge crossing and Page keys',
        reason:
          "This contract encodes the grid structure, the single Tab stop, the arrows within the grid, Home/End and Enter. Edge crossing into another month, Page keys and selection by pointer are the binding's.",
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
          'Month transitions are binding-specific paint over time and are not part of grid semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          "The grid contract introduces no string; month names, day names and the grid's name come from the binding's locale.",
      },
    },
  });
