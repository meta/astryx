// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file grid.fixtures.ts
 * @input Plain HTML 3×3 grids (one script implements the data-grid keyboard model with a roving tabindex; the DOM lane never runs it), conforming and deliberately violating
 * @output GRID_FIXTURES, the subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for grid.jsdom.test.ts and grid.chromium.spec.ts
 */

import type {GridStateFacts} from './grid';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
/** The start cell is the middle cell (row 2, column 2) so every neighbour exists. */
export const RELATION_SELECTORS = {
  start: '[data-cell="2-2"] > button',
  startCell: '[data-cell="2-2"]',
  next: '[data-cell="2-3"] > button',
  previous: '[data-cell="2-1"] > button',
  below: '[data-cell="3-2"] > button',
  above: '[data-cell="1-2"] > button',
  rowStart: '[data-cell="2-1"] > button',
  rowEnd: '[data-cell="2-3"] > button',
} as const;

export interface GridFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: GridStateFacts;
  readonly html: string;
}

const SCRIPT = `<script>
(() => {
  const grid = document.querySelector('[${SUBJECT_ATTRIBUTE}]');
  const rtl = grid.closest('[dir="rtl"]') != null && !window.__gridNoRtl;
  const buttons = () => Array.from(grid.querySelectorAll('[data-cell] > button'));
  const at = (r, c) => grid.querySelector('[data-cell="' + r + '-' + c + '"] > button');
  const move = (from, to) => {
    if (!to) return;
    buttons().forEach(b => b.tabIndex = -1);
    to.tabIndex = 0;
    to.focus();
  };
  grid.addEventListener('keydown', e => {
    const b = e.target.closest('[data-cell] > button');
    if (!b) return;
    const [r, c] = b.parentElement.dataset.cell.split('-').map(Number);
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const step = window.__gridArrowSkips ? 2 : 1;
    let target = null;
    if (e.key === forward) target = at(r, c + step);
    else if (e.key === back) target = at(r, c - step);
    else if (e.key === 'ArrowDown') target = at(r + step, c);
    else if (e.key === 'ArrowUp') target = at(r - step, c);
    else if (e.key === 'Home') target = at(r, window.__gridHomeOff ? 2 : 1);
    else if (e.key === 'End') target = at(r, 3);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!window.__gridEnterInert) b.parentElement.setAttribute('aria-selected', 'true');
      return;
    } else return;
    e.preventDefault();
    move(b, target);
  });
})();
</script>`;

function grid({
  role = 'grid',
  label = 'October 2026' as string | null,
  headers = true,
  tabStops = 1,
  multiselectable = false,
  selected = [] as readonly string[],
  cellRole = 'gridcell',
  strayChild = false,
  rtl = false,
}: {
  role?: string;
  label?: string | null;
  headers?: boolean;
  tabStops?: number;
  multiselectable?: boolean;
  selected?: readonly string[];
  cellRole?: string;
  strayChild?: boolean;
  rtl?: boolean;
} = {}): string {
  const header = headers
    ? `<div role="row"><div role="columnheader">A</div><div role="columnheader">B</div><div role="columnheader">C</div></div>`
    : '';
  let stops = 0;
  const rows = [1, 2, 3]
    .map(r => {
      const cells = [1, 2, 3]
        .map(c => {
          const id = `${r}-${c}`;
          const isStop =
            stops < tabStops && (tabStops === 1 ? id === '2-2' : true);
          if (isStop) {
            stops += 1;
          }
          const sel = selected.includes(id) ? ' aria-selected="true"' : '';
          return `<div role="${cellRole}" data-cell="${id}"${sel}><button type="button" tabindex="${isStop ? 0 : -1}">${id}</button></div>`;
        })
        .join('');
      return `<div role="row">${cells}</div>`;
    })
    .join('');
  const stray = strayChild ? '<div>Not a row</div>' : '';
  return `<div${rtl ? ' dir="rtl"' : ''}><div ${SUBJECT_ATTRIBUTE} role="${role}"${label == null ? '' : ` aria-label="${label}"`}${multiselectable ? ' aria-multiselectable="true"' : ''}>${header}${rows}${stray}</div></div>${SCRIPT}`;
}

const ALL_NEIGHBOURS = [
  'next',
  'previous',
  'below',
  'above',
  'rowStart',
  'rowEnd',
] as const;

const facts = (overrides: Partial<GridStateFacts> = {}): GridStateFacts => ({
  hasColumnHeaders: true,
  rtl: false,
  multiselectable: false,
  selectedCount: 0,
  enterSelectsStart: true,
  neighbours: ALL_NEIGHBOURS,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const GRID_FIXTURES: readonly GridFixture[] = [
  {
    id: 'conforming-grid',
    summary:
      'a named 3×3 grid with a header row, one Tab stop and Enter selecting the focused cell',
    facts: facts(),
    html: grid(),
  },
  {
    id: 'conforming-rtl',
    summary:
      'the same grid on a right-to-left page: ArrowLeft moves forward in reading order',
    facts: facts({rtl: true}),
    html: grid({rtl: true}),
  },
  {
    id: 'conforming-multiselect',
    summary: 'a multi-selection grid with two selected cells',
    facts: facts({multiselectable: true, selectedCount: 2}),
    html: grid({multiselectable: true, selected: ['1-1', '1-2']}),
  },
  {
    id: 'conforming-no-headers',
    summary: 'a grid whose weekday names live outside it',
    facts: facts({hasColumnHeaders: false}),
    html: grid({headers: false}),
  },
  {
    id: 'violating-role-table',
    summary: 'a grid exposed as a table',
    facts: facts(),
    html: grid({role: 'table'}),
  },
  {
    id: 'violating-no-name',
    summary: 'a grid with no accessible name',
    facts: facts(),
    html: grid({label: null}),
  },
  {
    id: 'violating-cell-role',
    summary: 'cells exposed as plain cells, not gridcells',
    facts: facts(),
    html: grid({cellRole: 'cell'}),
  },
  {
    id: 'violating-stray-child',
    summary: 'a grid with a direct child that is not a row',
    facts: facts(),
    html: grid({strayChild: true}),
  },
  {
    id: 'violating-two-tab-stops',
    summary: 'a grid with two cells in the Tab order',
    facts: facts(),
    html: grid({tabStops: 2}),
  },
  {
    id: 'violating-unmarked-selection',
    summary: 'a grid that claims two selected cells but marks none',
    facts: facts({multiselectable: true, selectedCount: 2}),
    html: grid({multiselectable: true}),
  },
  {
    id: 'violating-arrow-skips',
    summary: 'a grid whose arrows move two cells at a time',
    facts: facts(),
    html: flag('__gridArrowSkips', grid()),
  },
  {
    id: 'violating-rtl-not-reversed',
    summary: 'a right-to-left grid whose arrows still follow left-to-right',
    facts: facts({rtl: true}),
    html: flag('__gridNoRtl', grid({rtl: true})),
  },
  {
    id: 'violating-home-off',
    summary: 'a grid whose Home does not reach the first cell of the row',
    facts: facts(),
    html: flag('__gridHomeOff', grid()),
  },
  {
    id: 'violating-enter-inert',
    summary: 'a grid whose Enter does not select the focused cell',
    facts: facts(),
    html: flag('__gridEnterInert', grid()),
  },
];

export function fixture(id: string): GridFixture {
  const found = GRID_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown grid fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = GRID_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const GRID_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'grid.container.role-and-name': ['violating-role-table', 'violating-no-name'],
  'grid.structure.rows-and-cells': [
    'violating-cell-role',
    'violating-stray-child',
  ],
  'grid.focus.single-tab-stop': ['violating-two-tab-stops'],
  'grid.selection.exposed': ['violating-unmarked-selection'],
  'grid.keys.arrows': ['violating-arrow-skips', 'violating-rtl-not-reversed'],
  'grid.keys.home-end': ['violating-home-off'],
  'grid.keys.enter-activates': ['violating-enter-inert'],
};
