// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Plain-HTML positive and mutation fixtures for the Table contract. */

import type {TableStateFacts} from './table';

export const TABLE_SUBJECT_SELECTOR = '[data-a11y-table]';
export const TABLE_COLUMN_HEADER_SELECTOR = '[data-a11y-table-column-header]';
export const TABLE_ROW_SELECTOR = '[data-a11y-table-row]';
export const TABLE_ROW_HEADER_SELECTOR = '[data-a11y-table-row-header]';
export const TABLE_CELL_SELECTOR = '[data-a11y-table-cell]';

export interface TableFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: TableStateFacts;
  readonly html: string;
}

const COLUMNS = ['Name', 'Role', 'Location'] as const;
const ROWS = [
  ['Ada', 'Engineer', 'London'],
  ['Grace', 'Admiral', 'Arlington'],
] as const;

interface Options {
  /** The table element's role attribute, or null for the native role. */
  readonly role?: string | null;
  /** `aria-label` on the table, or null for none. */
  readonly label?: string | null;
  /** Name the table from a visible heading through `aria-labelledby`. */
  readonly labelledBy?: string;
  /** An explicit role that overrides the column header cells' native role. */
  readonly columnHeaderRole?: string;
  /** An `aria-label` that replaces the second column header's name. */
  readonly columnHeaderRename?: string;
  /** An explicit role that overrides the first body row's native role. */
  readonly rowRole?: string;
  /** Render each body row's first cell as a row header. */
  readonly rowHeaders?: boolean;
  /** Element used for row header cells. */
  readonly rowHeaderTag?: 'th' | 'td';
  /** An `aria-label` that replaces the first row header's name. */
  readonly rowHeaderRename?: string;
  /** Render the designated data cell as a column header instead. */
  readonly cellAsHeader?: boolean;
  /** Designate a data cell that sits outside the table. */
  readonly cellOutside?: boolean;
  /**
   * Move one designated part into a second, separately labelled data table,
   * keeping its role and name, so only its place in the subject table is wrong.
   */
  readonly otherTable?: 'row' | 'column-header' | 'row-header' | 'cell';
}

function attr(name: string, value: string | null | undefined): string {
  return value == null ? '' : `${name}="${value}"`;
}

function html(options: Options = {}): string {
  const role = options.role ?? null;
  const label = options.label === undefined ? 'Team members' : options.label;
  const rowHeaderTag = options.rowHeaderTag ?? 'th';
  const heading =
    options.labelledBy == null
      ? ''
      : `<h2 id="a11y-table-heading">${options.labelledBy}</h2>`;
  const headers = COLUMNS.map((column, index) => {
    const role = attr('role', options.columnHeaderRole);
    const rename =
      index === 1 ? attr('aria-label', options.columnHeaderRename) : '';
    const designated =
      index === 2 && options.otherTable === 'column-header'
        ? ''
        : 'data-a11y-table-column-header';
    return `<th ${designated} scope="col" ${role} ${rename}>${column}</th>`;
  }).join('');
  const body = ROWS.map((row, rowIndex) => {
    const cells = row
      .map((value, cellIndex) => {
        if (options.rowHeaders && cellIndex === 0) {
          const scope = rowHeaderTag === 'th' ? 'scope="row"' : '';
          const rename =
            rowIndex === 0 ? attr('aria-label', options.rowHeaderRename) : '';
          const designated =
            rowIndex === 1 && options.otherTable === 'row-header'
              ? ''
              : 'data-a11y-table-row-header';
          return `<${rowHeaderTag} ${designated} ${scope} ${rename}>${value}</${rowHeaderTag}>`;
        }
        const designated =
          rowIndex === 0 &&
          cellIndex === 1 &&
          !options.cellOutside &&
          options.otherTable !== 'cell';
        if (designated && options.cellAsHeader) {
          return `<th data-a11y-table-cell scope="col">${value}</th>`;
        }
        return `<td ${designated ? 'data-a11y-table-cell' : ''}>${value}</td>`;
      })
      .join('');
    const role = rowIndex === 0 ? attr('role', options.rowRole) : '';
    const designated =
      rowIndex === 1 && options.otherTable === 'row'
        ? ''
        : 'data-a11y-table-row';
    return `<tr ${designated} ${role}>${cells}</tr>`;
  }).join('');
  const outside = options.cellOutside
    ? '<div data-a11y-table-cell>Engineer</div>'
    : '';
  const other = options.otherTable;
  // The second table keeps a header cell so the browser treats it as a data
  // table rather than a layout table; its moved part keeps its role and name.
  const otherTable =
    other == null
      ? ''
      : `
    <table aria-label="Other team">
      <thead><tr>${
        other === 'column-header'
          ? '<th data-a11y-table-column-header scope="col">Location</th>'
          : '<th scope="col">Team</th>'
      }<th scope="col">Note</th></tr></thead>
      <tbody><tr ${other === 'row' ? 'data-a11y-table-row' : ''}>${
        other === 'row-header'
          ? '<th data-a11y-table-row-header scope="row">Grace</th>'
          : '<td>Other</td>'
      }${
        other === 'cell'
          ? '<td data-a11y-table-cell>Engineer</td>'
          : '<td>Note</td>'
      }</tr></tbody>
    </table>`;
  return `
    ${heading}
    <table data-a11y-table ${attr('role', role)} ${attr('aria-label', label)} ${
      options.labelledBy == null ? '' : 'aria-labelledby="a11y-table-heading"'
    }>
      <thead><tr data-a11y-table-row>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${outside}
    ${otherTable}
  `;
}

function facts(overrides: Partial<TableStateFacts> = {}): TableStateFacts {
  return {
    label: 'Team members',
    columnHeaders: [...COLUMNS],
    rows: 3,
    rowHeaders: [],
    cells: 1,
    ...overrides,
  };
}

const ROW_HEADERS = ROWS.map(row => row[0]);

export const TABLE_FIXTURES: readonly TableFixture[] = [
  {
    id: 'conforming-labelled',
    summary: 'a labelled data table with column headers and data cells',
    facts: facts(),
    html: html(),
  },
  {
    id: 'conforming-labelledby-row-headers',
    summary: 'a table named by a visible heading, with a row header per row',
    facts: facts({label: 'Crew roster', rowHeaders: ROW_HEADERS}),
    html: html({label: null, labelledBy: 'Crew roster', rowHeaders: true}),
  },
  {
    id: 'conforming-unlabelled',
    summary: 'a table whose binding declares no label',
    facts: facts({label: null}),
    html: html({label: null}),
  },
  {
    id: 'violating-role-grid',
    summary: 'a static table that claims the interactive grid role',
    facts: facts(),
    html: html({role: 'grid'}),
  },
  {
    id: 'violating-role-presentation',
    // Unlabelled: a global ARIA attribute such as aria-label makes the browser
    // ignore a presentational role, so a labelled table keeps its semantics.
    summary:
      'an unlabelled table whose semantics are removed with role="presentation"',
    facts: facts(),
    html: html({role: 'presentation', label: null}),
  },
  {
    id: 'violating-name-missing',
    summary: 'a table that drops its declared label',
    facts: facts(),
    html: html({label: null}),
  },
  {
    id: 'violating-name-wrong',
    summary: 'a table exposing a different label',
    facts: facts(),
    html: html({label: 'Members'}),
  },
  {
    id: 'violating-column-header-cell',
    summary:
      'column titles whose header role is overridden to an ordinary cell',
    facts: facts(),
    html: html({columnHeaderRole: 'cell'}),
  },
  {
    id: 'violating-column-header-name',
    summary: 'a column header whose computed name differs from its title',
    facts: facts(),
    html: html({columnHeaderRename: 'Column 2'}),
  },
  {
    id: 'violating-row-group',
    summary: 'a body row whose row role is overridden to a group',
    facts: facts(),
    html: html({rowRole: 'group'}),
  },
  {
    id: 'violating-row-other-table',
    summary: 'a designated row that belongs to a second table',
    facts: facts(),
    html: html({otherTable: 'row'}),
  },
  {
    id: 'violating-column-header-other-table',
    summary: 'a correctly named column header that belongs to a second table',
    facts: facts(),
    html: html({otherTable: 'column-header'}),
  },
  {
    id: 'violating-row-header-other-table',
    summary: 'a correctly named row header that belongs to a second table',
    facts: facts({rowHeaders: ROW_HEADERS}),
    html: html({rowHeaders: true, otherTable: 'row-header'}),
  },
  {
    id: 'violating-cell-other-table',
    summary: 'a data cell that belongs to a second table',
    facts: facts(),
    html: html({otherTable: 'cell'}),
  },
  {
    id: 'violating-row-header-td',
    summary: 'row titles rendered as ordinary data cells',
    facts: facts({rowHeaders: ROW_HEADERS}),
    html: html({rowHeaders: true, rowHeaderTag: 'td'}),
  },
  {
    id: 'violating-row-header-name',
    summary: 'a row header whose computed name differs from its title',
    facts: facts({rowHeaders: ROW_HEADERS}),
    html: html({rowHeaders: true, rowHeaderRename: 'Row 1'}),
  },
  {
    id: 'violating-cell-as-header',
    summary: 'a data value marked up as a column header',
    facts: facts(),
    html: html({cellAsHeader: true}),
  },
  {
    id: 'violating-cell-outside',
    summary: 'a data value rendered outside the table it belongs to',
    facts: facts(),
    html: html({cellOutside: true}),
  },
];

export const CONFORMING_TABLE_FIXTURES = TABLE_FIXTURES.filter(fixture =>
  fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const TABLE_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'table.role.exposed': ['violating-role-grid', 'violating-role-presentation'],
  'table.name.exposed': ['violating-name-missing', 'violating-name-wrong'],
  'table.column-headers.exposed': [
    'violating-column-header-cell',
    'violating-column-header-name',
    'violating-column-header-other-table',
  ],
  'table.rows.exposed': [
    'violating-row-group',
    'violating-row-other-table',
    'violating-cell-outside',
  ],
  'table.row-headers.exposed': [
    'violating-row-header-td',
    'violating-row-header-name',
    'violating-row-header-other-table',
  ],
  'table.cells.exposed': [
    'violating-cell-as-header',
    'violating-cell-outside',
    'violating-cell-other-table',
  ],
};

export function tableFixture(id: string): TableFixture {
  const fixture = TABLE_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Table fixture "${id}"`);
  }
  return fixture;
}
