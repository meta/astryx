// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toggle-button.fixtures.ts
 * @input Uses ToggleButtonStateFacts from ./toggle-button
 * @output Plain-HTML conforming and deliberately violating toggle-button fixtures
 * @position Contract mutation proof shared by jsdom and Chromium.
 */

import type {ToggleButtonStateFacts} from './toggle-button';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface ToggleButtonFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: ToggleButtonStateFacts;
  readonly html: string;
}

const CONFORMING_FACTS: ToggleButtonStateFacts = {
  pressed: false,
  operable: true,
  focusable: true,
  unavailable: false,
  described: false,
};

function facts(
  overrides: Partial<ToggleButtonStateFacts> = {},
): ToggleButtonStateFacts {
  return {...CONFORMING_FACTS, ...overrides};
}

const TOGGLE = `this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')`;
const TOGGLE_UNLESS_DISABLED = `if (this.getAttribute('aria-disabled') !== 'true') { ${TOGGLE}; }`;

function nativeToggle({
  pressed = false,
  label = 'Bold',
  attributes = '',
  onclick = TOGGLE_UNLESS_DISABLED,
}: {
  pressed?: boolean;
  label?: string;
  attributes?: string;
  onclick?: string;
} = {}): string {
  return `<button type="button" ${SUBJECT_ATTRIBUTE} aria-pressed="${pressed}"${attributes ? ` ${attributes}` : ''}${onclick ? ` onclick="${onclick}"` : ''}>${label}</button>`;
}

export const TOGGLE_BUTTON_FIXTURES: readonly ToggleButtonFixture[] = [
  {
    id: 'conforming-unpressed',
    summary: 'a named toggle button that starts unpressed',
    facts: facts(),
    html: nativeToggle(),
  },
  {
    id: 'conforming-pressed',
    summary: 'the same toggle button starting pressed',
    facts: facts({pressed: true}),
    html: nativeToggle({pressed: true}),
  },
  {
    id: 'conforming-icon-only',
    summary:
      'a toggle button named for assistive technology with no visible words',
    facts: facts(),
    // A drawn icon, not a letter: a visible "B" would be words a person can
    // read, which the accessible name "Bold" does not contain.
    html: nativeToggle({
      label:
        '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M4 2h5a3 3 0 0 1 0 6H4zm0 6h6a3 3 0 0 1 0 6H4z"></path></svg>',
      attributes: 'aria-label="Bold"',
    }),
  },
  {
    id: 'conforming-described',
    summary: 'a toggle button with supporting text attached as its description',
    facts: facts({described: true}),
    html:
      '<p id="hint">Applies bold formatting to the selection.</p>' +
      nativeToggle({attributes: 'aria-describedby="hint"'}),
  },
  {
    id: 'conforming-disabled',
    summary: 'a natively disabled toggle button',
    facts: facts({operable: false, focusable: false, unavailable: true}),
    html: nativeToggle({attributes: 'disabled', onclick: ''}),
  },
  {
    id: 'conforming-focusable-disabled',
    summary:
      'an aria-disabled toggle button that keeps its explanation reachable',
    facts: facts({operable: false, unavailable: true, described: true}),
    html:
      '<p id="hint">Formatting is locked.</p>' +
      nativeToggle({
        attributes: 'aria-disabled="true" aria-describedby="hint"',
      }),
  },
  {
    id: 'violating-role',
    summary: 'a persistent control exposed as a switch instead of a button',
    facts: facts({operable: false, focusable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="switch" aria-checked="false" aria-pressed="false">Bold</div>`,
  },
  {
    id: 'violating-unnamed',
    summary: 'a toggle button with no accessible name',
    facts: facts({operable: false}),
    html: nativeToggle({label: '', onclick: ''}),
  },
  {
    id: 'violating-name-mismatch',
    summary: 'a visible label replaced by a different accessible name',
    facts: facts(),
    html: nativeToggle({attributes: 'aria-label="Formatting"'}),
  },
  {
    id: 'violating-state-missing',
    summary: 'a button that omits its persistent pressed state',
    facts: facts({operable: false}),
    html: `<button type="button" ${SUBJECT_ATTRIBUTE}>Bold</button>`,
  },
  {
    id: 'violating-state-opposite',
    summary: 'a rendered pressed state exposed as unpressed',
    facts: facts({pressed: true, operable: false}),
    html: nativeToggle({pressed: false, onclick: ''}),
  },
  {
    id: 'violating-dangling-description',
    summary: 'a description relationship that resolves to nothing',
    facts: facts({described: true}),
    html: nativeToggle({attributes: 'aria-describedby="missing"'}),
  },
  {
    id: 'violating-empty-description',
    summary: 'a description target with no exposed text',
    facts: facts({described: true}),
    html:
      '<p id="hint"></p>' +
      nativeToggle({attributes: 'aria-describedby="hint"'}),
  },
  {
    id: 'violating-unavailable-unexposed',
    summary: 'an inoperable toggle button exposed as available',
    facts: facts({operable: false, unavailable: true}),
    html: nativeToggle({onclick: ''}),
  },
  {
    id: 'violating-inert',
    summary: 'a toggle button that never changes state',
    facts: facts(),
    html: nativeToggle({onclick: ''}),
  },
  {
    id: 'violating-one-way',
    summary: 'a toggle button that becomes pressed and cannot be unpressed',
    facts: facts(),
    html: nativeToggle({onclick: `this.setAttribute('aria-pressed', 'true')`}),
  },
  {
    id: 'violating-enter-blocked',
    summary:
      'a toggle button that blocks Enter while accepting pointer and Space',
    facts: facts(),
    html: nativeToggle({
      attributes: `onkeydown="if (event.key === 'Enter') event.preventDefault()"`,
    }),
  },
  {
    id: 'violating-space-blocked',
    summary:
      'a toggle button that blocks Space while accepting pointer and Enter',
    facts: facts(),
    html: nativeToggle({
      attributes: `onkeydown="if (event.key === ' ') event.preventDefault()"`,
    }),
  },
  {
    id: 'violating-label-changes',
    summary: 'a toggle button whose label describes the next action',
    facts: facts(),
    html: nativeToggle({
      label: 'Turn on bold',
      onclick: `const next = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', String(next)); this.textContent = next ? 'Turn off bold' : 'Turn on bold'`,
    }),
  },
  {
    id: 'violating-down-event-toggle',
    summary: 'a toggle button that changes on pointer-down',
    facts: facts(),
    html: nativeToggle({attributes: `onpointerdown="${TOGGLE}"`, onclick: ''}),
  },
  {
    id: 'violating-focus-moves',
    summary: 'a toggle button that moves focus after changing state',
    facts: facts(),
    html: nativeToggle({
      onclick: `${TOGGLE}; document.getElementById('after').focus()`,
    }),
  },
  {
    id: 'violating-unreachable',
    summary: 'a toggle button removed from the tab sequence',
    facts: facts(),
    html: nativeToggle({attributes: 'tabindex="-1"'}),
  },
  {
    id: 'violating-keyboard-trap',
    summary: 'a toggle button that prevents Tab from leaving',
    facts: facts(),
    html: nativeToggle({
      attributes: `onkeydown="if (event.key === 'Tab') event.preventDefault()"`,
    }),
  },
  {
    id: 'violating-disabled-operable',
    summary: 'an aria-disabled toggle button that still changes state',
    facts: facts({operable: false, unavailable: true}),
    html: nativeToggle({attributes: 'aria-disabled="true"', onclick: TOGGLE}),
  },
];

export function fixture(id: string): ToggleButtonFixture {
  const found = TOGGLE_BUTTON_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown toggle-button fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  TOGGLE_BUTTON_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const TOGGLE_BUTTON_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'toggle-button.role.exposed': ['violating-role'],
  'toggle-button.name.exposed': ['violating-unnamed'],
  'toggle-button.name.matches-visible-label': ['violating-name-mismatch'],
  'toggle-button.state.exposed': [
    'violating-state-missing',
    'violating-state-opposite',
  ],
  'toggle-button.description.resolvable': ['violating-dangling-description'],
  'toggle-button.description.exposed': ['violating-empty-description'],
  'toggle-button.unavailable.exposed': ['violating-unavailable-unexposed'],
  'toggle-button.state.pointer-round-trip': [
    'violating-inert',
    'violating-one-way',
  ],
  'toggle-button.state.enter-round-trip': [
    'violating-enter-blocked',
    'violating-one-way',
  ],
  'toggle-button.state.space-round-trip': [
    'violating-space-blocked',
    'violating-one-way',
  ],
  'toggle-button.name.stable-across-change': ['violating-label-changes'],
  'toggle-button.state.survives-an-aborted-press': [
    'violating-down-event-toggle',
  ],
  'toggle-button.focus.stays-on-change': [
    'violating-focus-moves',
    'violating-inert',
  ],
  'toggle-button.focus.reachable-and-escapable': [
    'violating-unreachable',
    'violating-keyboard-trap',
  ],
  'toggle-button.state.inoperable': ['violating-disabled-operable'],
};
