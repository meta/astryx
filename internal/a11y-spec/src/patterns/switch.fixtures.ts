// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switch.fixtures.ts
 * @input Uses ./switch (SwitchStateFacts)
 * @output SWITCH_FIXTURES — hand-written switches, one conforming per state and
 *   one deliberately violating per expectation — and SWITCH_MUTATIONS, which
 *   says which fixture each expectation must fail against.
 * @position The contract's own proof (AST-020 FR11). Used by the jsdom self-test
 *   and by the Chromium self-test, so the same positive and negative fixtures
 *   run at both layers.
 *
 * These are plain HTML on purpose. They prove the CONTRACT — that each
 * expectation passes when the outcome is present and fails when it is removed —
 * so they must not depend on any Astryx component. A component binding proves
 * something different: that the component delivers the outcome.
 *
 * Each fixture marks its control with `data-a11y-subject`. A binding designates
 * its subject rather than the contract hunting for one by role, so removing the
 * role flips exactly the role expectation instead of making every expectation
 * fail at once (which would prove nothing about any of them).
 *
 * SYNC: A new expectation in ./switch.ts needs a row in SWITCH_MUTATIONS, and
 *   the self-tests fail until it has one.
 */

import type {SwitchStateFacts} from './switch';

/** The attribute a fixture marks its control with. */
const SUBJECT_ATTRIBUTE = 'data-a11y-subject';

/** How a lane finds the control a fixture designates. */
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface SwitchFixture {
  readonly id: string;
  /** What this fixture is, in one line, for the test name. */
  readonly summary: string;
  /** What the fixture declares itself to be. */
  readonly facts: SwitchStateFacts;
  readonly html: string;
}

const CONFORMING_FACTS: SwitchStateFacts = {
  checked: false,
  operable: true,
  focusable: true,
  disabled: false,
  described: false,
  required: false,
  invalid: false,
};

function facts(overrides: Partial<SwitchStateFacts> = {}): SwitchStateFacts {
  return {...CONFORMING_FACTS, ...overrides};
}

/** A native checkbox promoted to a switch — the APG's own HTML-checkbox example. */
function nativeSwitch(attributes = ''): string {
  return (
    '<label for="fx">Notifications</label>' +
    `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch"${attributes ? ` ${attributes}` : ''}>`
  );
}

/** A div-based switch, so a fixture can withhold behaviour a native input has. */
function divSwitch(attributes: string, body = 'Notifications'): string {
  return `<div ${SUBJECT_ATTRIBUTE} role="switch" ${attributes}>${body}</div>`;
}

const TOGGLE_ON_CLICK = `onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"`;
const TOGGLE_ON_SPACE = `onkeydown="if (event.key === ' ') { event.preventDefault(); this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); }"`;
/** Changes on the way down, where a press can no longer be taken back. */
const TOGGLE_ON_POINTER_DOWN = `onpointerdown="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"`;

export const SWITCH_FIXTURES: readonly SwitchFixture[] = [
  // ---- conforming, one per representative state ---------------------------
  {
    id: 'conforming-off',
    summary: 'a labelled native checkbox promoted to a switch, off',
    facts: facts(),
    html: nativeSwitch(),
  },
  {
    id: 'conforming-on',
    summary: 'the same switch, on',
    facts: facts({checked: true}),
    html: nativeSwitch('checked'),
  },
  {
    id: 'conforming-described',
    summary: 'a switch with supporting text attached as its description',
    facts: facts({described: true}),
    html:
      '<p id="hint">Sends a notification for every mention.</p>' +
      nativeSwitch('aria-describedby="hint"'),
  },
  {
    id: 'conforming-label-hidden',
    summary:
      'a switch named for assistive technology with nothing rendered visibly',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch" aria-label="Notifications">`,
  },
  {
    id: 'conforming-label-sr-only',
    summary:
      'a switch whose label is present but clipped away by the sr-only recipe',
    facts: facts(),
    html:
      '<label for="fx" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch" aria-label="Notifications">`,
  },
  {
    id: 'conforming-label-decoratively-clipped',
    summary:
      'a readable label that happens to carry a decorative clip-path — visible, and it must not read as hidden',
    facts: facts(),
    html:
      '<label for="fx" style="clip-path:circle(60%)">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch">`,
  },
  {
    id: 'conforming-label-hidden-by-ancestor',
    summary:
      'a label inside a hidden wrapper: nothing is readable, and the name comes from aria-label',
    facts: facts(),
    html:
      '<div style="visibility:hidden"><label for="fx">Notifications</label></div>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch" aria-label="Notifications">`,
  },
  {
    id: 'conforming-disabled',
    summary: 'a natively disabled switch',
    facts: facts({disabled: true, operable: false, focusable: false}),
    html: nativeSwitch('disabled'),
  },
  {
    id: 'conforming-pending',
    summary:
      'a switch that refuses its own change without being disabled — the case where "cannot be changed" and "reported disabled" come apart',
    facts: facts({operable: false}),
    html: nativeSwitch(
      `onclick="event.preventDefault()" onkeydown="if (event.key === ' ') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'conforming-required',
    summary: 'a required switch',
    facts: facts({required: true}),
    html: nativeSwitch('required'),
  },
  {
    id: 'conforming-invalid',
    summary: 'a switch reported as being in error',
    facts: facts({invalid: true}),
    html: nativeSwitch('aria-invalid="true"'),
  },

  // ---- one deliberate violation per expectation ---------------------------
  {
    id: 'violating-unnamed',
    summary: 'a switch with no label at all',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch">`,
  },
  {
    id: 'violating-name-mismatch',
    summary: 'a switch whose aria-label replaces the visible label',
    facts: facts(),
    html: nativeSwitch('aria-label="Toggle"'),
  },
  {
    id: 'violating-label-changes',
    summary:
      'a switch whose label reads as the action, so it flips when the state does',
    facts: facts(),
    html: divSwitch(
      `tabindex="0" aria-checked="false" onclick="const on = this.getAttribute('aria-checked') !== 'true'; this.setAttribute('aria-checked', String(on)); this.textContent = on ? 'Turn off notifications' : 'Turn on notifications';" onkeydown="if (event.key === ' ') { event.preventDefault(); this.click(); }"`,
      'Turn on notifications',
    ),
  },
  {
    id: 'violating-down-event-toggle',
    summary:
      'a switch that changes on the way down, so a slip cannot be taken back',
    facts: facts(),
    html: divSwitch(
      `tabindex="0" aria-checked="false" ${TOGGLE_ON_POINTER_DOWN} ${TOGGLE_ON_SPACE}`,
    ),
  },
  {
    id: 'violating-focus-moves-on-change',
    summary:
      'a switch that throws focus somewhere else the moment it is changed',
    facts: facts(),
    html: nativeSwitch(`onchange="document.getElementById('after').focus()"`),
  },
  {
    id: 'violating-checkbox-role',
    summary: 'a checkbox that was never promoted to a switch',
    facts: facts(),
    html:
      '<label for="fx">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox">`,
  },
  {
    id: 'violating-generic-element',
    summary: 'a plain element with neither the role nor any state',
    facts: facts({operable: false, focusable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} tabindex="0">Notifications</div>`,
  },
  {
    id: 'violating-state-mismatch',
    summary: 'a switch rendered on while reporting itself off',
    facts: facts({checked: true, operable: false, focusable: false}),
    html: divSwitch('tabindex="0" aria-checked="false"'),
  },
  {
    id: 'violating-dangling-description',
    summary: 'a switch described by an id that resolves to nothing',
    facts: facts({described: true}),
    html: nativeSwitch('aria-describedby="hint"'),
  },
  {
    id: 'violating-empty-description',
    summary: 'a switch described by an element that renders no text',
    facts: facts({described: true}),
    html: '<p id="hint"></p>' + nativeSwitch('aria-describedby="hint"'),
  },
  {
    id: 'violating-inert',
    summary: 'a switch that never changes state',
    // Same markup as violating-state-mismatch, different declaration: there,
    // the binding says the switch renders ON and the markup says off, which is
    // an exposure failure. Here it says off and means off, so the failure is
    // that pressing it does nothing. One inert control, two separate outcomes.
    facts: facts(),
    html: divSwitch('tabindex="0" aria-checked="false"'),
  },
  {
    id: 'violating-one-way',
    summary: 'a switch that turns on and cannot be turned back off',
    facts: facts(),
    html: divSwitch(
      `tabindex="0" aria-checked="false" onclick="this.setAttribute('aria-checked', 'true')" onkeydown="if (event.key === ' ') { event.preventDefault(); this.setAttribute('aria-checked', 'true'); }"`,
    ),
  },
  {
    id: 'violating-pointer-only',
    summary: 'a switch that answers a pointer but ignores the keyboard',
    facts: facts(),
    html: divSwitch(`tabindex="0" aria-checked="false" ${TOGGLE_ON_CLICK}`),
  },
  {
    id: 'violating-unreachable',
    summary: 'a switch that is not in the tab sequence',
    facts: facts(),
    html: divSwitch(
      `aria-checked="false" ${TOGGLE_ON_CLICK} ${TOGGLE_ON_SPACE}`,
    ),
  },
  {
    id: 'violating-keyboard-trap',
    summary: 'a switch that swallows the Tab that would leave it',
    facts: facts(),
    html: nativeSwitch(
      `onkeydown="if (event.key === 'Tab') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'violating-disabled-unexposed',
    summary:
      'a switch that blocks its own change without saying it is disabled',
    facts: facts({disabled: true, operable: false}),
    html: nativeSwitch(`onclick="event.preventDefault()"`),
  },
  {
    id: 'violating-disabled-operable',
    summary: 'a switch marked disabled that still changes state',
    facts: facts({disabled: true, operable: false}),
    html: nativeSwitch('aria-disabled="true"'),
  },
  {
    id: 'violating-required-unexposed',
    summary: 'a switch that must be on but never says so',
    facts: facts({required: true}),
    html: nativeSwitch(),
  },
  {
    id: 'violating-invalid-unexposed',
    summary: 'a switch in error that never says so',
    facts: facts({invalid: true}),
    html: nativeSwitch(),
  },
];

export function fixture(id: string): SwitchFixture {
  const found = SWITCH_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown switch fixture "${id}"`);
  }
  return found;
}

/** The conforming fixtures every expectation must pass against (AST-020 FR11). */
export const CONFORMING_FIXTURES: readonly string[] = SWITCH_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

/**
 * For each expectation, the fixtures that remove its outcome. Every expectation
 * needs at least one, and the self-tests fail when one is missing — that is how
 * "the contract can actually fail" stops being a claim (AST-020 FR11).
 */
export const SWITCH_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'switch.description.resolvable': ['violating-dangling-description'],
  'switch.role.exposed': [
    'violating-checkbox-role',
    'violating-generic-element',
  ],
  'switch.name.exposed': ['violating-unnamed'],
  'switch.state.exposed': [
    'violating-state-mismatch',
    'violating-generic-element',
  ],
  'switch.description.exposed': ['violating-empty-description'],
  'switch.disabled.exposed': ['violating-disabled-unexposed'],
  'switch.required.declared': ['violating-required-unexposed'],
  'switch.invalid.exposed': ['violating-invalid-unexposed'],
  'switch.name.stable-across-change': ['violating-label-changes'],
  'switch.name.matches-visible-label': ['violating-name-mismatch'],
  'switch.state.survives-an-aborted-press': ['violating-down-event-toggle'],
  'switch.state.keeps-focus-on-change': [
    'violating-focus-moves-on-change',
    // A switch that never changes cannot show that focus survives a change.
    'violating-inert',
  ],
  'switch.state.pointer-round-trip': ['violating-inert', 'violating-one-way'],
  'switch.state.space-round-trip': [
    'violating-pointer-only',
    'violating-one-way',
  ],
  'switch.focus.reachable-and-escapable': [
    'violating-unreachable',
    'violating-keyboard-trap',
  ],
  'switch.state.inoperable': ['violating-disabled-operable'],
};
