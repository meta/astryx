// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file table.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Table pattern's roles, name, and sort-state requirements
 * @output TABLE_PATTERN, TableStateFacts, TableModuleContract, and composeTablePattern — the base contract a static data table binds to (its table role and name, its rows, column headers, row headers, and data cells), and the seam through which a Table module adds the semantics it brings, such as sort state from the sort module
 * @position Pattern contract; bound by Table (`spec:AST-020/FR15`: Table plays the table role, so it adopts the pattern's role, name, and row and cell roles; the APG Table pattern defines no keyboard interaction, so nothing is adopted there). Each Table module owns its own contract and is composed in only for the states that use it
 */

import type {Harness, Subject} from '../harness';
import {
  definePattern,
  type ApgRequirement,
  type Expectation,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/table/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};

/** An APG Table pattern requirement, for the base and for module contracts. */
export const tableApgRequirement = (requirement: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'table',
  requirement,
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
});
const APG_ROLE = tableApgRequirement('The table container has role table.');
const APG_ROWS = tableApgRequirement(
  'Each row container has role row and is either a DOM descendant of or owned by the table element or an element with role rowgroup.',
);
const APG_CELLS = tableApgRequirement(
  'Each cell is either a DOM descendant of or owned by a row element and has one of the following roles: columnheader if the cell contains a title or header information for the column. rowheader if the cell contains title or header information for the row. cell if the cell does not contain column or row header information.',
);
const APG_NAME = tableApgRequirement(
  'If there is an element in the user interface that serves as a label for the table, aria-labelledby is set on the table element with a value that refers to the labelling element. Otherwise, a label is specified for the table element using aria-label.',
);

/** AST-020 FR15, which adopts the APG Table pattern for Table and its modules. */
export const TABLE_AST_020_FR15: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-020',
  clause: 'FR15',
  url: 'https://github.com/facebook/astryx/blob/878fad9d7ac23cd3f4c5def64595abd770bb01a3/docs/specs/AST-020/spec.md#L83-L92',
  requirement:
    "Where a component part already plays an APG pattern's role, Astryx adopts that pattern's required parts for it: the role, the accessible name, the state and relationship properties, and activation by Tab plus Enter or Space.",
};

/**
 * What a binding knows about one table (the subject). The binding also
 * designates related subjects: `row-<i>` for `rows` rows,
 * `column-header-<i>` for each entry of `columnHeaders`, `row-header-<i>` for
 * each entry of `rowHeaders`, and `cell-<i>` for `cells` ordinary data cells.
 * Every designated header and cell sits in one of the designated rows.
 */
export interface TableStateFacts {
  /** The accessible name the binding declares, or null when it declares none. */
  readonly label: string | null;
  /** How many rows the binding designates. */
  readonly rows: number;
  /**
   * The accessible name the binding declares for each designated column
   * header, in order. A header that holds a control (a sort button) computes
   * its name from that control, so the binding declares that name.
   */
  readonly columnHeaders: readonly string[];
  /** The accessible name the binding declares for each designated row header, in order. */
  readonly rowHeaders: readonly string[];
  /** How many ordinary data cells the binding designates. */
  readonly cells: number;
}

/**
 * The semantics one Table module adds to the base table contract. A module
 * owns its facts and expectations (ids under `table.`); a binding composes it
 * only for the states rendered with that module.
 */
export interface TableModuleContract<ModuleFacts> {
  /** The module, e.g. `useTableSortable`, for report headers. */
  readonly module: string;
  /** What the module adds, in one clause, appended to the base scope. */
  readonly scope: string;
  readonly expectations: readonly Expectation<TableStateFacts & ModuleFacts>[];
}

function describeRole(role: string | null): string {
  return role == null ? 'no role' : `"${role}"`;
}

function describeName(name: string): string {
  return name === '' ? 'no name' : `"${name}"`;
}

/**
 * Every designated header must compute the expected role and title and sit in
 * the table's accessibility subtree, so the table's own structure carries it.
 */
async function expectHeaders(
  harness: Harness,
  table: Subject,
  prefix: string,
  role: 'columnheader' | 'rowheader',
  titles: readonly string[],
): Promise<void> {
  for (const [index, title] of titles.entries()) {
    const header = await harness.related(`${prefix}-${index}`);
    const computed = await header.computed();
    if (computed.role !== role) {
      throw new Error(
        `the "${title}" header is exposed as ${describeRole(computed.role)}, not as a ${role}`,
      );
    }
    if (computed.name !== title) {
      throw new Error(
        `the "${title}" ${role} computes ${describeName(computed.name)} instead`,
      );
    }
    if (!(await harness.containsSemantically(table, header))) {
      throw new Error(
        `the "${title}" ${role} is not part of the table's accessibility subtree`,
      );
    }
  }
}

const TABLE_BASE: PatternContract<TableStateFacts> = {
  pattern: 'table',
  url: APG_URL,
  scope:
    "A static data table's role and name and the roles of its rows, column headers, row headers, and data cells. Table modules add their own semantics through composeTablePattern; interactive content inside cells binds its own patterns.",
  expectations: [
    {
      id: 'table.role.exposed',
      outcome:
        'The browser exposes the table as a table, so people can move through it by row and column and hear where they are.',
      sources: [WCAG_1_3_1, APG_ROLE],
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates a table',
        test: () => true,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({subject}) => {
        const {role} = await subject.computed();
        if (role !== 'table') {
          throw new Error(
            `the browser exposes ${describeRole(role)} instead of a table`,
          );
        }
      },
    },
    {
      id: 'table.name.exposed',
      outcome:
        'When the binding declares a label, the table computes exactly that name, so people can tell which table they are in.',
      sources: [TABLE_AST_020_FR15, APG_NAME],
      wcagOutcome:
        'Supports WCAG 2.2 1.3.1 Info and Relationships and 2.4.6 Headings and Labels by keeping the table’s purpose programmatically available.',
      covers: ['2.4.6-headings-and-labels', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding declares a label for the table',
        test: facts => facts.label != null,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({subject, facts}) => {
        const {name} = await subject.computed();
        if (name !== facts.label) {
          throw new Error(
            `the table should be named "${facts.label}", but the browser computes ${describeName(name)}`,
          );
        }
      },
    },
    {
      id: 'table.rows.exposed',
      outcome:
        'Each row is a row inside the table and holds the headers and cells shown in it, so people can move row by row and hear each row’s values together.',
      sources: [WCAG_1_3_1, APG_ROWS],
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates rows',
        test: facts => facts.rows > 0,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({harness, subject, facts}) => {
        const rows: Subject[] = [];
        for (let index = 0; index < facts.rows; index += 1) {
          const row = await harness.related(`row-${index}`);
          const {role} = await row.computed();
          if (role !== 'row') {
            throw new Error(
              `row ${index + 1} is exposed as ${describeRole(role)}, not as a row`,
            );
          }
          if (!(await harness.containsSemantically(subject, row))) {
            throw new Error(
              `row ${index + 1} is not part of the table's accessibility subtree`,
            );
          }
          rows.push(row);
        }
        const parts = [
          ...facts.columnHeaders.map(
            (title, index) =>
              [
                `column-header-${index}`,
                `the "${title}" column header`,
              ] as const,
          ),
          ...facts.rowHeaders.map(
            (title, index) =>
              [`row-header-${index}`, `the "${title}" row header`] as const,
          ),
          ...Array.from(
            {length: facts.cells},
            (_, index) => [`cell-${index}`, `data cell ${index + 1}`] as const,
          ),
        ];
        for (const [relation, description] of parts) {
          const part = await harness.related(relation);
          let inRow = false;
          for (const row of rows) {
            if (await harness.containsSemantically(row, part)) {
              inRow = true;
              break;
            }
          }
          if (!inRow) {
            throw new Error(`${description} sits in no row of the table`);
          }
        }
      },
    },
    {
      id: 'table.column-headers.exposed',
      outcome:
        'Each column title is a column header inside the table with the name the binding declares, so people hear which column a value belongs to.',
      sources: [WCAG_1_3_1, APG_CELLS],
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates column headers',
        test: facts => facts.columnHeaders.length > 0,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({harness, subject, facts}) => {
        await expectHeaders(
          harness,
          subject,
          'column-header',
          'columnheader',
          facts.columnHeaders,
        );
      },
    },
    {
      id: 'table.row-headers.exposed',
      outcome:
        'Each row title is a row header inside the table with the name the binding declares, so people hear which row a value belongs to.',
      sources: [WCAG_1_3_1, APG_CELLS],
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates row headers',
        test: facts => facts.rowHeaders.length > 0,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({harness, subject, facts}) => {
        await expectHeaders(
          harness,
          subject,
          'row-header',
          'rowheader',
          facts.rowHeaders,
        );
      },
    },
    {
      id: 'table.cells.exposed',
      outcome:
        'Each data value is an ordinary cell inside the table, so it is announced with its headers rather than as a header or loose text.',
      sources: [WCAG_1_3_1, APG_CELLS],
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates data cells',
        test: facts => facts.cells > 0,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({harness, subject, facts}) => {
        for (let index = 0; index < facts.cells; index += 1) {
          const cell = await harness.related(`cell-${index}`);
          const {role} = await cell.computed();
          if (role !== 'cell') {
            throw new Error(
              `data cell ${index + 1} is exposed as ${describeRole(role)}, not as a cell`,
            );
          }
          if (!(await harness.containsSemantically(subject, cell))) {
            throw new Error(
              `data cell ${index + 1} is not part of the table's accessibility subtree`,
            );
          }
        }
      },
    },
  ],
  exemptions: {
    '1.1.1-non-text-content': {
      owner: 'Caller cell content and the Icon component',
      verifiedBy: 'Content review, Icon tests, and the repository axe audit',
      reason:
        'A table adds no informative non-text content of its own; sort and expansion glyphs are decorative Icon output and cell images belong to their content owners.',
    },
    '1.3.1-info-and-relationships': {
      owner:
        'Caller content and the Table modules that add rows or cells (row expansion, grouped rows, tree, row index)',
      verifiedBy:
        'Each module’s own tests and later bindings of those modules to this contract',
      reason:
        'This contract encodes the table, row, header, and cell roles and the table name; a composed module encodes what it adds, such as sort state. Captions and descriptions, cell spans, column and row counts and indexes, detail and group rows, and header association in tables with irregular headers are not encoded here.',
      coversRemainderOnly: true,
    },
    '1.3.2-meaningful-sequence': {
      owner: 'The binding and caller data order',
      verifiedBy: 'Table structure tests and rendered review',
      reason:
        'Row and column order follow the caller’s data and column definitions; the table semantics expose that order as rendered.',
    },
    '1.3.5-identify-input-purpose': {
      owner: 'Form controls placed in cells',
      verifiedBy: 'Their own contracts and form review',
      reason: 'A table collects no information about the user.',
    },
    '1.4.1-use-of-color': {
      owner: 'The binding, row-status module, and the active theme',
      verifiedBy: 'Rendered review and the repository visual gate',
      reason:
        'Striping, hover, dividers, and status color are paint outcomes outside this semantic contract.',
    },
    '1.4.3-contrast-minimum': {
      owner: 'Caller content and the active theme',
      verifiedBy: 'Rendered contrast audit',
      reason: 'Text contrast depends on resolved colors and backdrop.',
    },
    '1.4.11-non-text-contrast': {
      owner: 'The binding and the active theme',
      verifiedBy: 'Rendered divider and control contrast review',
      reason: 'Dividers and control boundaries are paint outcomes.',
    },
    '2.1.1-keyboard': {
      owner:
        'The Table Scroll region (component:Table FR1) and the pattern owners of controls placed in cells',
      verifiedBy:
        'The Table scroll real-browser spec and each control’s own contract',
      reason:
        'The APG Table pattern defines no keyboard interaction: a table is not a widget and its cells are not focusable. Keyboard reach to overflowing content belongs to the Scroll region, and controls in cells keep their own keys.',
    },
    '2.1.2-no-keyboard-trap': {
      owner: 'The Scroll region and controls placed in cells',
      verifiedBy: 'Their contracts and real-browser keyboard review',
      reason: 'The table itself takes no focus and cannot trap it.',
    },
    '2.4.2-page-titled': {
      owner: 'The page',
      verifiedBy: 'Page-level title review',
      reason: 'A table does not own the document title.',
    },
    '2.4.3-focus-order': {
      owner: 'The Scroll region and controls placed in cells',
      verifiedBy: 'Real-browser keyboard-order review',
      reason:
        'Each control inside a table is its own stop in the page Tab sequence, in DOM order; the table adds no stop of its own.',
    },
    '2.4.4-link-purpose': {
      owner: 'The link pattern and caller content',
      verifiedBy: 'Link contract bindings plus content review',
      reason: 'A table contains links but does not define their purpose.',
    },
    '2.4.6-headings-and-labels': {
      owner: 'Caller-provided table labels and column titles',
      verifiedBy: 'Content review of each table label and header',
      reason:
        'This contract proves the table computes the declared name, not that the caller supplies one or that its wording describes the data.',
      coversRemainderOnly: true,
    },
    '2.4.7-focus-visible': {
      owner: 'The Scroll region, controls in cells, and the active theme',
      verifiedBy: 'Rendered keyboard-focus review',
      reason: 'The table and its cells are not focusable.',
    },
    '2.4.11-focus-not-obscured': {
      owner: 'The sticky-columns module, the Scroll region, and the page',
      verifiedBy: 'Constrained-viewport and sticky-column browser review',
      reason:
        'Whether a sticky header or column hides a focused control depends on layout, not table semantics.',
    },
    '2.5.2-pointer-cancellation': {
      owner: 'Controls placed in cells',
      verifiedBy: 'Their pointer activation tests',
      reason: 'A table has no pointer action of its own.',
    },
    '2.5.3-label-in-name': {
      owner: 'Controls placed in cells',
      verifiedBy: 'Their visible-label versus computed-name checks',
      reason:
        'A table is not a labelled user-interface component; label-in-name applies to the controls inside it.',
    },
    '2.5.8-target-size': {
      owner: 'Controls placed in cells',
      verifiedBy: 'Rendered target geometry review',
      reason: 'A table has no pointer target of its own.',
    },
    '3.1.1-language-of-page': {
      owner: 'The page and localization provider',
      verifiedBy: 'Document-language checks',
      reason: 'A table does not own the document language.',
    },
    '3.2.2-on-input': {
      owner: 'Controls placed in cells',
      verifiedBy: 'Role-specific interaction tests',
      reason: 'A table has no input event.',
    },
    '3.2.4-consistent-identification': {
      owner: 'The design system and caller content',
      verifiedBy: 'Cross-page review of repeated tables',
      reason:
        'Consistency is a property of repeated pages and tables, not one isolated binding.',
    },
    '3.3.1-error-identification': {
      owner: 'The composing form and the row-status module',
      verifiedBy: 'Form-level and row-status review',
      reason: 'A table defines no validation error state.',
    },
    '3.3.2-labels-or-instructions': {
      owner: 'Form controls placed in cells',
      verifiedBy: 'Form-level label and instruction review',
      reason: 'A table is not a form input.',
    },
    '4.1.2-name-role-value': {
      owner:
        'The button pattern (sort control), the checkbox pattern (selection), and the row-expansion module',
      verifiedBy:
        'Their reusable contracts and the Table module tests named in component:Table',
      reason:
        'A table and its cells are structure rather than user-interface components; their roles and name are encoded here under 1.3.1 and AST-020 FR15, while the sort, selection, and expansion controls inside them keep their own patterns.',
    },
    '4.1.3-status-messages': {
      owner: 'The status-message pattern and caller content',
      verifiedBy:
        'Status-message tests and AST-009 when spoken timing is claimed',
      reason:
        'Rendering or re-sorting a table is not a status message; any announcement of a change belongs to its owner.',
    },
    'apg-interaction': {
      owner:
        'Caller content, the row-index module, and each Table module that adds rows or cells',
      verifiedBy:
        'Module tests and later bindings of those modules to this contract',
      reason:
        'The APG Table pattern defines no keyboard interaction. Its aria-describedby caption reference, aria-colcount, aria-rowcount, aria-colindex, aria-rowindex, aria-colspan, aria-rowspan, and aria-owns guidance is not encoded here.',
      coversRemainderOnly: true,
    },
    'forced-colors': {
      owner: 'The binding and the active theme',
      verifiedBy: 'Rendered forced-colors review',
      reason: 'Semantic exposure does not prove forced-colors paint.',
    },
    'reduced-motion': {
      owner: 'The binding and its modules',
      verifiedBy: 'Component motion tests and rendered review',
      reason: 'Table semantics add no motion.',
    },
    'at-facing-strings': {
      owner: 'The binding’s localization and caller-provided labels',
      verifiedBy:
        'Catalog checks and localized component tests; AST-009 for speech claims',
      reason:
        'The contract verifies deterministic computed names without claiming spoken wording, order, or timing.',
    },
  },
};

/** The base table contract: role, name, rows, headers, and cells. */
export const TABLE_PATTERN: PatternContract<TableStateFacts> =
  definePattern<TableStateFacts>(TABLE_BASE);

/**
 * The base table contract plus one module's semantics, for the states a
 * binding renders with that module. The result is still the `table` pattern,
 * so module expectation ids keep their `table.` prefix.
 */
export function composeTablePattern<ModuleFacts>(
  module: TableModuleContract<ModuleFacts>,
): PatternContract<TableStateFacts & ModuleFacts> {
  return definePattern<TableStateFacts & ModuleFacts>({
    ...TABLE_BASE,
    scope: `${TABLE_BASE.scope} With ${module.module}: ${module.scope}`,
    expectations: [...TABLE_BASE.expectations, ...module.expectations],
  });
}
