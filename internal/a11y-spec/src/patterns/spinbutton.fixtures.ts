// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Plain-HTML positive and mutation fixtures for the Spinbutton contract. */

import type {SpinbuttonStateFacts} from './spinbutton';

export const SPINBUTTON_SUBJECT_SELECTOR = '[data-a11y-subject]';

export interface SpinbuttonFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: SpinbuttonStateFacts;
  readonly html: string;
}

function facts(
  overrides: Partial<SpinbuttonStateFacts> = {},
): SpinbuttonStateFacts {
  return {
    value: 5,
    min: 1,
    max: 9,
    valueText: null,
    disabled: false,
    readOnly: false,
    focusable: true,
    stepUpValue: 6,
    stepDownValue: 4,
    ...overrides,
  };
}

interface Options {
  readonly role?: string;
  readonly label?: boolean;
  readonly value?: number | null;
  readonly displayValue?: string | null;
  readonly min?: number | null;
  readonly max?: number | null;
  readonly valueText?: string | null;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly tabIndex?: number;
  readonly trapTab?: boolean;
  readonly brokenUp?: boolean;
  readonly brokenDown?: boolean;
}

function html(options: Options = {}): string {
  const value = options.value === undefined ? 5 : options.value;
  const displayValue =
    options.displayValue === undefined
      ? value == null
        ? null
        : String(value)
      : options.displayValue;
  const min = options.min === undefined ? 1 : options.min;
  const max = options.max === undefined ? 9 : options.max;
  const valueText = options.valueText === undefined ? null : options.valueText;
  const role = options.role ?? 'spinbutton';
  const label = options.label ?? true;
  return `
    <button type="button">Before</button>
    ${label ? '<label for="amount">Quantity</label>' : ''}
    <input data-a11y-subject id="amount" type="text" role="${role}"
      ${displayValue == null ? '' : `value="${displayValue}"`}
      ${value == null ? '' : `aria-valuenow="${value}"`}
      ${min == null ? '' : `aria-valuemin="${min}"`}
      ${max == null ? '' : `aria-valuemax="${max}"`}
      ${valueText == null ? '' : `aria-valuetext="${valueText}"`}
      ${options.disabled ? 'disabled' : ''}
      ${options.readOnly ? 'readonly aria-readonly="true"' : ''}
      ${options.tabIndex == null ? '' : `tabindex="${options.tabIndex}"`}
      onkeydown="
        if (event.key === 'Tab' && ${options.trapTab ? 'true' : 'false'}) event.preventDefault();
        if (event.key === 'ArrowUp' && ${options.brokenUp ? 'false' : 'true'}) { this.value = '6'; this.setAttribute('aria-valuenow', '6'); }
        if (event.key === 'ArrowDown' && ${options.brokenDown ? 'false' : 'true'}) { this.value = '4'; this.setAttribute('aria-valuenow', '4'); }
      " />
    <button type="button">After</button>
  `;
}

export const SPINBUTTON_FIXTURES: readonly SpinbuttonFixture[] = [
  {
    id: 'conforming-value',
    summary: 'a labelled bounded spinbutton',
    facts: facts(),
    html: html(),
  },
  {
    id: 'conforming-formatted',
    summary: 'a formatted spinbutton value',
    facts: facts({valueText: '5 GB', stepUpValue: null, stepDownValue: null}),
    html: html({displayValue: '5 GB', valueText: '5 GB'}),
  },
  {
    id: 'conforming-empty',
    summary: 'an empty spinbutton',
    facts: facts({
      value: null,
      min: null,
      max: null,
      stepUpValue: null,
      stepDownValue: null,
    }),
    html: html({value: null, min: null, max: null}),
  },
  {
    id: 'conforming-disabled',
    summary: 'a disabled spinbutton',
    facts: facts({
      disabled: true,
      focusable: false,
      stepUpValue: null,
      stepDownValue: null,
    }),
    html: html({disabled: true}),
  },
  {
    id: 'conforming-readonly',
    summary: 'a read-only spinbutton',
    facts: facts({readOnly: true, stepUpValue: null, stepDownValue: null}),
    html: html({readOnly: true}),
  },
  {
    id: 'violating-role',
    summary: 'a textbox instead of a spinbutton',
    facts: facts(),
    html: html({role: 'textbox'}),
  },
  {
    id: 'violating-name',
    summary: 'an unnamed spinbutton',
    facts: facts(),
    html: html({label: false}),
  },
  {
    id: 'violating-label',
    summary: 'a spinbutton without a persistent label',
    facts: facts(),
    html: html({label: false}),
  },
  {
    id: 'violating-value',
    summary: 'a stale exposed value',
    facts: facts(),
    html: html({value: 4}),
  },
  {
    id: 'violating-empty-value',
    summary: 'an empty binding with stale aria-valuenow',
    facts: facts({
      value: null,
      min: null,
      max: null,
      stepUpValue: null,
      stepDownValue: null,
    }),
    html: html({value: 5, min: null, max: null}),
  },
  {
    id: 'violating-bounds',
    summary: 'incorrect exposed bounds',
    facts: facts(),
    html: html({min: 0, max: 10}),
  },
  {
    id: 'violating-value-text',
    summary: 'incorrect formatted value text',
    facts: facts({valueText: '5 GB', stepUpValue: null, stepDownValue: null}),
    html: html({displayValue: 'five', valueText: 'five'}),
  },
  {
    id: 'violating-disabled',
    summary: 'an available control declared disabled',
    facts: facts({disabled: true, stepUpValue: null, stepDownValue: null}),
    html: html(),
  },
  {
    id: 'violating-false-disabled',
    summary: 'a disabled control declared available',
    facts: facts({stepUpValue: null, stepDownValue: null}),
    html: html({disabled: true}),
  },
  {
    id: 'violating-readonly',
    summary: 'an editable control declared read-only',
    facts: facts({readOnly: true, stepUpValue: null, stepDownValue: null}),
    html: html(),
  },
  {
    id: 'violating-unreachable',
    summary: 'a spinbutton outside the tab sequence',
    facts: facts(),
    html: html({tabIndex: -1}),
  },
  {
    id: 'violating-trap',
    summary: 'a spinbutton that traps Tab',
    facts: facts(),
    html: html({trapTab: true}),
  },
  {
    id: 'violating-arrow-up',
    summary: 'a spinbutton that ignores Up Arrow',
    facts: facts(),
    html: html({brokenUp: true}),
  },
  {
    id: 'violating-arrow-down',
    summary: 'a spinbutton that ignores Down Arrow',
    facts: facts(),
    html: html({brokenDown: true}),
  },
];

export const CONFORMING_SPINBUTTON_FIXTURES = SPINBUTTON_FIXTURES.filter(
  fixture => fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const SPINBUTTON_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'spinbutton.identity.exposed': ['violating-role', 'violating-name'],
    'spinbutton.label.persistently-associated': ['violating-label'],
    'spinbutton.value.exposed': ['violating-value'],
    'spinbutton.value.empty': ['violating-empty-value'],
    'spinbutton.bounds.exposed': ['violating-bounds'],
    'spinbutton.value-text.exposed': ['violating-value-text'],
    'spinbutton.disabled.exposed': ['violating-disabled'],
    'spinbutton.available.not-disabled': ['violating-false-disabled'],
    'spinbutton.readonly.exposed': ['violating-readonly'],
    'spinbutton.keyboard.reachable-and-escapable': [
      'violating-unreachable',
      'violating-trap',
    ],
    'spinbutton.keyboard.arrow-up': ['violating-arrow-up'],
    'spinbutton.keyboard.arrow-down': ['violating-arrow-down'],
  };

export function spinbuttonFixture(id: string): SpinbuttonFixture {
  const fixture = SPINBUTTON_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Spinbutton fixture "${id}"`);
  }
  return fixture;
}
