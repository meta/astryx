// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file progressbar.fixtures.ts
 * @input Plain HTML progress indicators, conforming and deliberately violating
 * @output PROGRESSBAR_FIXTURES, the subject selector, and the expectation → violating-fixture map
 * @position Contract self-test data for progressbar.jsdom.test.ts and progressbar.chromium.spec.ts
 */

import type {ProgressbarStateFacts} from './progressbar';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface ProgressbarFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: ProgressbarStateFacts;
  readonly html: string;
}

interface Bar {
  readonly role?: string;
  readonly label?: string | null;
  readonly value?: number | null;
  readonly min?: number;
  readonly max?: number;
  readonly valueText?: string | null;
  /** Markup placed inside the progress bar's subtree. */
  readonly inside?: string;
  /** Markup placed beside the progress bar, outside its subtree. */
  readonly beside?: string;
}

function bar({
  role = 'progressbar',
  label = 'Upload',
  value = 40,
  min = 0,
  max = 100,
  valueText = null,
  inside = '',
  beside = '',
}: Bar = {}): string {
  const values =
    value == null
      ? ''
      : ` aria-valuenow="${value}" aria-valuemin="${min}" aria-valuemax="${max}"`;
  const text = valueText == null ? '' : ` aria-valuetext="${valueText}"`;
  const name = label == null ? '' : ' aria-labelledby="label"';
  return `<div><span id="label">${label ?? ''}</span><div ${SUBJECT_ATTRIBUTE} role="${role}"${name}${values}${text} style="width:200px;height:8px;background:#ddd"><div style="width:40%;height:8px;background:#333"></div>${inside}</div>${beside}</div>`;
}

const facts = (
  overrides: Partial<ProgressbarStateFacts> = {},
): ProgressbarStateFacts => ({
  name: 'Upload',
  value: 40,
  min: 0,
  max: 100,
  valueText: null,
  ...overrides,
});

const MARK =
  '<span tabindex="0" style="display:inline-block;width:8px;height:8px">•</span>';

export const PROGRESSBAR_FIXTURES: readonly ProgressbarFixture[] = [
  {
    id: 'conforming-determinate',
    summary: 'a progress bar at 40 of 0–100',
    facts: facts(),
    html: bar(),
  },
  {
    id: 'conforming-formatted',
    summary: 'a progress bar that speaks its value as formatted text',
    facts: facts({value: 3, max: 5, valueText: '3 GB / 5 GB', name: 'Disk'}),
    html: bar({value: 3, max: 5, valueText: '3 GB / 5 GB', label: 'Disk'}),
  },
  {
    id: 'conforming-complete',
    summary: 'a progress bar at its maximum',
    facts: facts({value: 100, valueText: '100%'}),
    html: bar({value: 100, valueText: '100%'}),
  },
  {
    id: 'conforming-indeterminate',
    summary: 'a progress bar whose progress is unknown claims no value',
    facts: facts({value: null, name: 'Loading data'}),
    html: bar({value: null, label: 'Loading data'}),
  },
  {
    id: 'conforming-native-indeterminate',
    summary: 'a native progress element with no value',
    facts: facts({value: null, name: 'Loading data'}),
    html: `<div><label for="native">Loading data</label><progress ${SUBJECT_ATTRIBUTE} id="native"></progress></div>`,
  },
  {
    id: 'conforming-focusable-mark-beside',
    summary:
      'a progress bar whose focusable target mark sits beside it, outside its subtree',
    facts: facts({value: 50, valueText: '50%'}),
    html: bar({value: 50, valueText: '50%', beside: MARK}),
  },
  {
    id: 'violating-meter',
    summary: 'progress exposed as a meter',
    facts: facts(),
    html: bar({role: 'meter'}),
  },
  {
    id: 'violating-status',
    summary: 'progress exposed as a status with no progress role',
    facts: facts(),
    html: bar({role: 'status'}),
  },
  {
    id: 'violating-unnamed',
    summary: 'a progress bar with no accessible name',
    facts: facts(),
    html: bar({label: null}),
  },
  {
    id: 'violating-wrong-name',
    summary: 'a progress bar named for a different operation',
    facts: facts({name: 'Download'}),
    html: bar(),
  },
  {
    id: 'violating-wrong-value',
    summary: 'a progress bar whose exposed value disagrees with its progress',
    facts: facts(),
    html: bar({value: 41}),
  },
  {
    id: 'violating-no-value',
    summary: 'a progress bar that knows its progress but exposes no value',
    facts: facts(),
    html: bar({value: null}),
  },
  {
    id: 'violating-wrong-range',
    summary: 'a progress bar whose exposed maximum disagrees with its range',
    facts: facts({max: 200}),
    html: bar(),
  },
  {
    id: 'violating-indeterminate-claims-zero',
    summary: 'an indeterminate progress bar that claims 0 of 100',
    facts: facts({value: null, name: 'Loading data'}),
    html: bar({value: 0, label: 'Loading data'}),
  },
  {
    id: 'violating-indeterminate-claims-text',
    summary: 'an indeterminate progress bar that speaks a percentage',
    facts: facts({value: null, name: 'Loading data'}),
    html: bar({value: null, valueText: '0%', label: 'Loading data'}),
  },
  {
    id: 'violating-valuetext-missing',
    summary: 'a formatted progress bar that exposes only the number',
    facts: facts({value: 3, max: 5, valueText: '3 GB / 5 GB', name: 'Disk'}),
    html: bar({value: 3, max: 5, label: 'Disk'}),
  },
  {
    id: 'violating-valuetext-stale',
    summary:
      'a progress bar whose value text disagrees with its formatted value',
    facts: facts({value: 50, valueText: '50%'}),
    html: bar({value: 50, valueText: '40%'}),
  },
  {
    id: 'violating-focusable-mark-inside',
    summary:
      'a focusable target mark inside the progress bar, where the platform hides it',
    facts: facts({value: 50, valueText: '50%'}),
    html: bar({value: 50, valueText: '50%', inside: MARK}),
  },
  {
    id: 'violating-button-inside',
    summary: 'a button rendered inside the progress bar',
    facts: facts(),
    html: bar({inside: '<button type="button">Cancel</button>'}),
  },
];

export function fixture(id: string): ProgressbarFixture {
  const found = PROGRESSBAR_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown progressbar fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  PROGRESSBAR_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const PROGRESSBAR_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'progressbar.identity.role-and-name': [
    'violating-meter',
    'violating-status',
    'violating-unnamed',
    'violating-wrong-name',
  ],
  'progressbar.determinate.value-and-range': [
    'violating-wrong-value',
    'violating-no-value',
    'violating-wrong-range',
  ],
  'progressbar.indeterminate.no-value-claimed': [
    'violating-indeterminate-claims-zero',
    'violating-indeterminate-claims-text',
  ],
  'progressbar.value.text-exposed': [
    'violating-valuetext-missing',
    'violating-valuetext-stale',
  ],
  'progressbar.subtree.no-focusable-descendants': [
    'violating-focusable-mark-inside',
    'violating-button-inside',
  ],
};
