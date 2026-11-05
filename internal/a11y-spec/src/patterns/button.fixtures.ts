// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file button.fixtures.ts
 * @input Uses ./button (ButtonStateFacts)
 * @output BUTTON_FIXTURES — hand-written buttons, one conforming per state and
 *   one deliberately violating per expectation — and BUTTON_MUTATIONS, which
 *   says which fixture each expectation must fail against.
 * @position The contract's own proof (AST-020 FR11). Read by the jsdom
 *   self-test and the Chromium self-test, so the same positive and negative
 *   fixtures run at every layer that can see them.
 *
 * These are plain HTML on purpose. They prove the CONTRACT — that each
 * expectation passes when the outcome is present and fails when it is removed —
 * so they must not depend on any Astryx component. A component binding proves
 * something different: that the component delivers the outcome.
 *
 * Every fixture counts its own activations on `window.__activations`, because a
 * button's action leaves no trace on the button. That counter is what the
 * contract reads through the binding's `activations()` seam.
 *
 * SYNC: A new expectation in ./button.ts needs a row in BUTTON_MUTATIONS, and
 *   the self-tests fail until it has one.
 */

import type {ButtonStateFacts} from './button';

/** The attribute a fixture marks its control with. */
const SUBJECT_ATTRIBUTE = 'data-a11y-subject';

/** How a lane finds the control a fixture designates. */
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface ButtonFixture {
  readonly id: string;
  /** What this fixture is, in one line, for the test name. */
  readonly summary: string;
  /** What the fixture declares itself to be. */
  readonly facts: ButtonStateFacts;
  readonly html: string;
}

const CONFORMING_FACTS: ButtonStateFacts = {
  operable: true,
  focusable: true,
  unavailable: false,
  described: false,
};

function facts(overrides: Partial<ButtonStateFacts> = {}): ButtonStateFacts {
  return {...CONFORMING_FACTS, ...overrides};
}

/** Count an activation the way a binding's own handler would. */
const COUNT = `window.__activations = (window.__activations || 0) + 1`;

/**
 * A native button — the platform's own, which the APG prefers.
 *
 * The counting handler comes FIRST and is opt-out, because HTML keeps the first
 * of a duplicated attribute: a fixture that supplies its own `onclick` must say
 * `counts: false`, or its handler would be silently discarded and the fixture
 * would quietly stop testing what it claims to.
 */
function nativeButton(
  attributes = '',
  {
    label = 'Save changes',
    counts = true,
  }: {label?: string; counts?: boolean} = {},
): string {
  const onClick = counts ? ` onclick="${COUNT}"` : '';
  return `<button type="button" ${SUBJECT_ATTRIBUTE}${onClick}${attributes ? ` ${attributes}` : ''}>${label}</button>`;
}

/** A div promoted to a button, so a fixture can withhold what a native one gives. */
function divButton(attributes: string, label = 'Save changes'): string {
  return `<div ${SUBJECT_ATTRIBUTE} role="button" ${attributes}>${label}</div>`;
}

/** The APG's own div-button recipe: click plus both activation keys. */
const DIV_BUTTON_BEHAVIOUR = `tabindex="0" onclick="${COUNT}" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${COUNT}; }"`;

export const BUTTON_FIXTURES: readonly ButtonFixture[] = [
  // ---- conforming, one per representative state ---------------------------
  {
    id: 'conforming-native',
    summary: 'a native button labelled by its own text',
    facts: facts(),
    html: nativeButton(),
  },
  {
    id: 'conforming-div',
    summary:
      "a div promoted to a button, with the APG's own keyboard recipe — the case a native element does not cover for free",
    facts: facts(),
    html: divButton(DIV_BUTTON_BEHAVIOUR),
  },
  {
    id: 'conforming-icon-only',
    summary: 'a button with no text, named by aria-label',
    facts: facts(),
    html: `<button type="button" ${SUBJECT_ATTRIBUTE} onclick="${COUNT}" aria-label="Delete conversation"><span aria-hidden="true">🗑</span></button>`,
  },
  {
    id: 'conforming-described',
    summary: 'a button with supporting text attached as its description',
    facts: facts({described: true}),
    html:
      '<p id="hint">This cannot be undone.</p>' +
      nativeButton('aria-describedby="hint"'),
  },
  {
    id: 'conforming-unavailable-native',
    summary: 'a natively disabled button, out of the tab sequence',
    facts: facts({operable: false, focusable: false, unavailable: true}),
    html: nativeButton('disabled'),
  },
  {
    id: 'conforming-unavailable-focusable',
    summary:
      'a button kept focusable while unavailable, the way a reason stays discoverable — announced unavailable, and it refuses to act',
    facts: facts({operable: false, unavailable: true}),
    html: nativeButton(
      `aria-disabled="true" onclick="event.preventDefault(); return false;" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); }"`,
      {counts: false},
    ),
  },
  {
    id: 'conforming-busy',
    summary:
      'a button waiting on the action it started: still focusable, reported busy, and refusing a second press',
    facts: facts({operable: false}),
    html: nativeButton(
      `aria-busy="true" aria-disabled="true" onclick="event.preventDefault(); return false;" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); }"`,
      {counts: false},
    ),
  },

  // ---- one deliberate violation per expectation ---------------------------
  {
    id: 'violating-generic-element',
    summary: 'a plain element with no role at all',
    facts: facts({operable: false, focusable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE}>Save changes</div>`,
  },
  {
    id: 'violating-link-role',
    summary:
      'an anchor doing a button\u2019s job, so it is announced as a link and promises navigation it does not do',
    facts: facts(),
    html: `<a href="#" ${SUBJECT_ATTRIBUTE} onclick="event.preventDefault(); ${COUNT}">Save changes</a>`,
  },
  {
    id: 'violating-unnamed',
    summary: 'an icon-only button with nothing to name it',
    facts: facts(),
    html: `<button type="button" ${SUBJECT_ATTRIBUTE} onclick="${COUNT}"><span aria-hidden="true">🗑</span></button>`,
  },
  {
    id: 'violating-name-mismatch',
    summary:
      'a button whose aria-label replaces the words a person can read, so speaking them reaches nothing',
    facts: facts(),
    html: nativeButton('aria-label="Submit"'),
  },
  {
    id: 'violating-dangling-description',
    summary: 'a button described by an id that resolves to nothing',
    facts: facts({described: true}),
    html: nativeButton('aria-describedby="hint"'),
  },
  {
    id: 'violating-empty-description',
    summary: 'a button described by an element that renders no text',
    facts: facts({described: true}),
    html: '<p id="hint"></p>' + nativeButton('aria-describedby="hint"'),
  },
  {
    id: 'violating-inert',
    summary: 'a button that does nothing when it is pressed',
    facts: facts(),
    html: divButton('tabindex="0"'),
  },
  {
    id: 'violating-pointer-only',
    summary: 'a button that answers a pointer but ignores the keyboard',
    facts: facts(),
    html: divButton(`tabindex="0" onclick="${COUNT}"`),
  },
  {
    id: 'violating-enter-only',
    summary:
      'a button that answers Enter but not Space — the half of the keyboard a div-button usually forgets',
    facts: facts(),
    html: divButton(
      `tabindex="0" onclick="${COUNT}" onkeydown="if (event.key === 'Enter') { event.preventDefault(); ${COUNT}; }"`,
    ),
  },
  {
    id: 'violating-space-only',
    summary: 'a button that answers Space but not Enter',
    facts: facts(),
    html: divButton(
      `tabindex="0" onclick="${COUNT}" onkeydown="if (event.key === ' ') { event.preventDefault(); ${COUNT}; }"`,
    ),
  },
  {
    id: 'violating-unreachable',
    summary: 'a button that is not in the tab sequence',
    facts: facts(),
    html: divButton(
      `onclick="${COUNT}" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${COUNT}; }"`,
    ),
  },
  {
    id: 'violating-keyboard-trap',
    summary: 'a button that swallows the Tab that would leave it',
    facts: facts(),
    html: nativeButton(
      `onkeydown="if (event.key === 'Tab') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'violating-down-event-activation',
    summary:
      'a button that acts on the way down, so a press slid off cannot be taken back',
    facts: facts(),
    html: divButton(
      `tabindex="0" onpointerdown="${COUNT}" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${COUNT}; }"`,
    ),
  },
  {
    id: 'violating-unavailable-unexposed',
    summary:
      'a button that refuses to act without ever saying it is unavailable',
    facts: facts({operable: false, unavailable: true}),
    html: nativeButton('onclick="event.preventDefault(); return false;"', {
      counts: false,
    }),
  },
  {
    id: 'violating-unavailable-still-acts',
    summary: 'a button marked unavailable that runs its action anyway',
    facts: facts({operable: false, unavailable: true}),
    html: nativeButton(`aria-disabled="true"`),
  },
  {
    id: 'violating-unavailable-acts-on-key',
    summary:
      'a button marked unavailable that refuses a click but still runs on Enter or Space — the half a pointer-only check would miss',
    facts: facts({operable: false, unavailable: true}),
    html: nativeButton(
      `aria-disabled="true" onclick="event.preventDefault(); return false;" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${COUNT}; }"`,
      {counts: false},
    ),
  },
  {
    id: 'violating-unavailable-unfocusable',
    summary:
      'a button declared focusable so its reason stays reachable, but natively disabled — so it cannot take focus at all, the reason is unreadable, and its refusal is unverifiable',
    facts: facts({operable: false, unavailable: true}),
    // `tabindex="-1"` would NOT do: it removes a control from the tab sequence
    // while leaving it programmatically focusable, so `focus()` still succeeds.
    // The native attribute is what actually refuses focus — and it is what the
    // real components do, which is why this shape is worth a fixture.
    html: nativeButton('disabled aria-disabled="true"', {counts: false}),
  },
  {
    id: 'violating-busy-unfocusable',
    summary:
      'a button that goes natively disabled while busy, so focus is dropped mid-task and Tab can no longer reach it',
    facts: facts({operable: false}),
    html: nativeButton('aria-busy="true" disabled'),
  },
];

export function fixture(id: string): ButtonFixture {
  const found = BUTTON_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown button fixture "${id}"`);
  }
  return found;
}

/** The conforming fixtures every expectation must pass against (AST-020 FR11). */
export const CONFORMING_FIXTURES: readonly string[] = BUTTON_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

/**
 * For each expectation, the fixtures that remove its outcome. Every expectation
 * needs at least one, and the self-tests fail when one is missing — that is how
 * "the contract can actually fail" stops being a claim (AST-020 FR11).
 */
export const BUTTON_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'button.role.exposed': ['violating-generic-element', 'violating-link-role'],
  'button.name.exposed': ['violating-unnamed'],
  'button.name.matches-visible-label': ['violating-name-mismatch'],
  'button.description.resolvable': ['violating-dangling-description'],
  'button.description.exposed': ['violating-empty-description'],
  'button.action.runs-on-pointer': ['violating-inert'],
  'button.action.runs-on-enter': [
    'violating-inert',
    'violating-pointer-only',
    'violating-space-only',
  ],
  'button.action.runs-on-space': [
    'violating-inert',
    'violating-pointer-only',
    'violating-enter-only',
  ],
  'button.action.survives-an-aborted-press': [
    'violating-down-event-activation',
  ],
  'button.focus.reachable-and-escapable': [
    'violating-unreachable',
    'violating-keyboard-trap',
    // Natively disabled while busy: out of the tab sequence exactly when the
    // user most needs to get back to it. This is the shape of a real defect in
    // two shipped components, recorded in Button.a11y.known-failures.ts.
    'violating-busy-unfocusable',
  ],
  'button.unavailable.exposed': ['violating-unavailable-unexposed'],
  'button.unavailable.inert': [
    'violating-unavailable-still-acts',
    'violating-unavailable-acts-on-key',
    'violating-unavailable-unfocusable',
  ],
};
