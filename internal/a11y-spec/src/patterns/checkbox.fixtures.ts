// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file checkbox.fixtures.ts
 * @input Uses ./checkbox (CheckboxStateFacts)
 * @output CHECKBOX_FIXTURES — hand-written checkboxes, one conforming per state and
 *   one deliberately violating per expectation — and CHECKBOX_MUTATIONS, which
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
 * SYNC: A new expectation in ./checkbox.ts needs a row in CHECKBOX_MUTATIONS, and
 *   the self-tests fail until it has one.
 */

import type {CheckboxStateFacts} from './checkbox';

/** The attribute a fixture marks its control with. */
const SUBJECT_ATTRIBUTE = 'data-a11y-subject';

/** How a lane finds the control a fixture designates. */
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface CheckboxFixture {
  readonly id: string;
  /** What this fixture is, in one line, for the test name. */
  readonly summary: string;
  /** What the fixture declares itself to be. */
  readonly facts: CheckboxStateFacts;
  readonly html: string;
}

const CONFORMING_FACTS: CheckboxStateFacts = {
  role: 'checkbox',
  checked: false,
  operable: true,
  focusable: true,
  disabled: false,
  description: null,
  readOnly: false,
  required: false,
  invalid: false,
};

function facts(
  overrides: Partial<CheckboxStateFacts> = {},
): CheckboxStateFacts {
  return {...CONFORMING_FACTS, ...overrides};
}

/** A native checkbox promoted to a checkbox — the APG's own HTML-checkbox example. */
function nativeCheckbox(attributes = ''): string {
  return (
    '<label for="fx">Notifications</label>' +
    `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox"${attributes ? ` ${attributes}` : ''}>`
  );
}

/** A div-based checkbox, so a fixture can withhold behaviour a native input has. */
function divCheckbox(attributes: string, body = 'Notifications'): string {
  return `<div ${SUBJECT_ATTRIBUTE} role="checkbox" ${attributes}>${body}</div>`;
}

const TOGGLE_ON_CLICK = `onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"`;
const TOGGLE_ON_SPACE = `onkeydown="if (event.key === ' ') { event.preventDefault(); this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); }"`;
/** Changes on the way down, where a press can no longer be taken back. */
const TOGGLE_ON_POINTER_DOWN = `onpointerdown="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"`;

export const CHECKBOX_FIXTURES: readonly CheckboxFixture[] = [
  // ---- conforming, one per representative state ---------------------------
  {
    id: 'conforming-menuitem',
    summary:
      'a menu checkbox item whose composite owns keyboard navigation and focus',
    facts: facts({
      role: 'menuitemcheckbox',
      focusable: false,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="menuitemcheckbox" tabindex="-1" aria-checked="false" ${TOGGLE_ON_CLICK}>Notifications</div>`,
  },
  {
    id: 'conforming-off',
    summary: 'a labelled native checkbox, unchecked',
    facts: facts(),
    html: nativeCheckbox(),
  },
  {
    id: 'conforming-on',
    summary: 'the same checkbox, on',
    facts: facts({checked: true}),
    html: nativeCheckbox('checked'),
  },
  {
    id: 'conforming-mixed',
    summary:
      'a tri-state checkbox, partially checked, that resolves to checked and then unchecked',
    facts: facts({checked: 'mixed'}),
    html: divCheckbox(
      `tabindex="0" aria-checked="mixed" onclick="const state = this.getAttribute('aria-checked'); this.setAttribute('aria-checked', state === 'mixed' ? 'true' : state === 'true' ? 'false' : 'true')" onkeydown="if (event.key === ' ') { event.preventDefault(); this.click(); }"`,
    ),
  },
  {
    id: 'conforming-described',
    summary: 'a checkbox with supporting text attached as its description',
    facts: facts({description: 'Sends a notification for every mention.'}),
    html:
      '<p id="hint">Sends a notification for every mention.</p>' +
      nativeCheckbox('aria-describedby="hint"'),
  },
  {
    id: 'conforming-label-hidden',
    summary:
      'a checkbox named for assistive technology with nothing rendered visibly',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox" aria-label="Notifications">`,
  },
  {
    id: 'conforming-label-sr-only',
    summary:
      'a checkbox whose label is present but clipped away by the sr-only recipe',
    facts: facts(),
    html:
      '<label for="fx" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox" aria-label="Notifications">`,
  },
  {
    id: 'conforming-label-decoratively-clipped',
    summary:
      'a readable label that happens to carry a decorative clip-path — visible, and it must not read as hidden',
    facts: facts(),
    html:
      '<label for="fx" style="clip-path:circle(60%)">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox">`,
  },
  {
    id: 'conforming-label-pointer-transparent',
    summary:
      'a readable label that ignores pointer input so its containing row can receive the click',
    facts: facts(),
    html:
      '<label for="fx" style="pointer-events:none">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox">`,
  },
  {
    id: 'conforming-label-pointer-transparent-and-clipped',
    summary:
      'a fully clipped label that also ignores pointer input, so it remains invisible',
    facts: facts(),
    html:
      '<label for="fx" style="pointer-events:none;clip-path:inset(100%)">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox" aria-label="Notification setting">`,
  },
  {
    id: 'conforming-label-hidden-by-ancestor',
    summary:
      'a label inside a hidden wrapper: nothing is readable, and the name comes from aria-label',
    facts: facts(),
    html:
      '<div style="visibility:hidden"><label for="fx">Notifications</label></div>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox" aria-label="Notifications">`,
  },
  {
    id: 'conforming-disabled',
    summary: 'a natively disabled checkbox',
    facts: facts({disabled: true, operable: false, focusable: false}),
    html: nativeCheckbox('disabled'),
  },
  {
    id: 'conforming-focusable-disabled',
    summary:
      'an unavailable checkbox that stays in the tab sequence and refuses both pointer and keyboard changes',
    facts: facts({disabled: true, operable: false, focusable: true}),
    html: nativeCheckbox(
      `aria-disabled="true" onclick="event.preventDefault()" onkeydown="if (event.key === ' ') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'conforming-pending',
    summary:
      'a checkbox that refuses its own change without being disabled — the case where "cannot be changed" and "reported disabled" come apart',
    facts: facts({operable: false}),
    html: nativeCheckbox(
      `onclick="event.preventDefault()" onkeydown="if (event.key === ' ') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'conforming-readonly',
    summary: 'a read-only checkbox that stays focusable and does not change',
    facts: facts({readOnly: true, operable: false}),
    html: nativeCheckbox(
      `aria-readonly="true" onclick="event.preventDefault()" onkeydown="if (event.key === ' ') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'conforming-required',
    summary: 'a required checkbox',
    facts: facts({required: true, invalid: true}),
    html: nativeCheckbox('required'),
  },
  {
    id: 'conforming-invalid',
    summary: 'a checkbox reported as being in error',
    facts: facts({invalid: true}),
    html: nativeCheckbox('aria-invalid="true"'),
  },

  // ---- one deliberate violation per expectation ---------------------------
  {
    id: 'violating-unnamed',
    summary: 'a checkbox with no label at all',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="checkbox" role="checkbox">`,
  },
  {
    id: 'violating-name-mismatch',
    summary: 'a checkbox whose aria-label replaces the visible label',
    facts: facts(),
    html: nativeCheckbox('aria-label="Toggle"'),
  },
  {
    id: 'violating-down-event-toggle',
    summary:
      'a checkbox that changes on the way down, so a slip cannot be taken back',
    facts: facts(),
    html: divCheckbox(
      `tabindex="0" aria-checked="false" ${TOGGLE_ON_POINTER_DOWN} ${TOGGLE_ON_SPACE}`,
    ),
  },
  {
    id: 'violating-focus-moves-on-change',
    summary:
      'a checkbox that throws focus somewhere else the moment it is changed',
    facts: facts(),
    html: nativeCheckbox(`onchange="document.getElementById('after').focus()"`),
  },
  {
    id: 'violating-checkbox-role',
    summary: 'a switch that exposes the wrong widget role',
    facts: facts(),
    html:
      '<label for="fx">Notifications</label>' +
      `<input id="fx" ${SUBJECT_ATTRIBUTE} type="checkbox" role="switch">`,
  },
  {
    id: 'violating-generic-element',
    summary: 'a plain element with neither the role nor any state',
    facts: facts({operable: false, focusable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} tabindex="0">Notifications</div>`,
  },
  {
    id: 'violating-state-mismatch',
    summary: 'a checkbox rendered on while reporting itself off',
    facts: facts({checked: true, operable: false, focusable: false}),
    html: divCheckbox('tabindex="0" aria-checked="false"'),
  },
  {
    id: 'violating-mixed-state-mismatch',
    summary: 'a partially checked checkbox reported as unchecked',
    facts: facts({checked: 'mixed', operable: false, focusable: false}),
    html: divCheckbox('tabindex="0" aria-checked="false"'),
  },
  {
    id: 'violating-dangling-description',
    summary: 'a checkbox described by an id that resolves to nothing',
    facts: facts({description: 'Sends a notification for every mention.'}),
    html: nativeCheckbox('aria-describedby="hint"'),
  },
  {
    id: 'violating-empty-description',
    summary: 'a checkbox described by an element that renders no text',
    facts: facts({description: 'Sends a notification for every mention.'}),
    html: '<p id="hint"></p>' + nativeCheckbox('aria-describedby="hint"'),
  },
  {
    id: 'violating-wrong-description',
    summary: 'a checkbox pointing at unrelated nonempty text',
    facts: facts({description: 'Sends a notification for every mention.'}),
    html:
      '<p id="hint">This text describes a different control.</p>' +
      nativeCheckbox('aria-describedby="hint"'),
  },
  {
    id: 'violating-inert',
    summary: 'a checkbox that never changes state',
    // Same markup as violating-state-mismatch, different declaration: there,
    // the binding says the checkbox renders ON and the markup says off, which is
    // an exposure failure. Here it says off and means off, so the failure is
    // that pressing it does nothing. One inert control, two separate outcomes.
    facts: facts(),
    html: divCheckbox('tabindex="0" aria-checked="false"'),
  },
  {
    id: 'violating-wrong-start-first-noop',
    summary:
      'a checkbox rendered checked despite an unchecked declaration, whose first activation does nothing and second activation unchecks it',
    facts: facts(),
    html: divCheckbox(
      `tabindex="0" aria-checked="true" onclick="const count = Number(this.dataset.activations || '0') + 1; this.dataset.activations = String(count); if (count === 2) { this.setAttribute('aria-checked', 'false'); }" onkeydown="if (event.key === ' ') { event.preventDefault(); this.click(); }"`,
    ),
  },
  {
    id: 'violating-one-way',
    summary: 'a checkbox that turns on and cannot be turned back off',
    facts: facts(),
    html: divCheckbox(
      `tabindex="0" aria-checked="false" onclick="this.setAttribute('aria-checked', 'true')" onkeydown="if (event.key === ' ') { event.preventDefault(); this.setAttribute('aria-checked', 'true'); }"`,
    ),
  },
  {
    id: 'violating-pointer-only',
    summary: 'a checkbox that answers a pointer but ignores the keyboard',
    facts: facts(),
    html: divCheckbox(`tabindex="0" aria-checked="false" ${TOGGLE_ON_CLICK}`),
  },
  {
    id: 'violating-pointer-only-unfocusable',
    summary:
      'an operable checkbox whose facts try to opt out of direct keyboard focus',
    facts: facts({focusable: false}),
    html: divCheckbox(`aria-checked="false" ${TOGGLE_ON_CLICK}`),
  },
  {
    id: 'violating-unreachable',
    summary: 'a checkbox that is not in the tab sequence',
    facts: facts(),
    html: divCheckbox(
      `aria-checked="false" ${TOGGLE_ON_CLICK} ${TOGGLE_ON_SPACE}`,
    ),
  },
  {
    id: 'violating-declared-unavailable-unreachable',
    summary:
      'an unavailable checkbox whose binding promises focusability but whose native disabled state removes it from the tab sequence',
    facts: facts({disabled: true, operable: false, focusable: true}),
    html: nativeCheckbox('disabled'),
  },
  {
    id: 'violating-keyboard-trap',
    summary: 'a checkbox that swallows the Tab that would leave it',
    facts: facts(),
    html: nativeCheckbox(
      `onkeydown="if (event.key === 'Tab') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'violating-disabled-overexposed',
    summary: 'an available checkbox falsely exposed as disabled',
    facts: facts({focusable: false, operable: false}),
    html: nativeCheckbox('disabled'),
  },
  {
    id: 'violating-disabled-unexposed',
    summary:
      'a checkbox that blocks its own change without saying it is disabled',
    facts: facts({disabled: true, operable: false}),
    html: nativeCheckbox(`onclick="event.preventDefault()"`),
  },
  {
    id: 'violating-disabled-operable',
    summary: 'a checkbox marked disabled that still changes state',
    facts: facts({disabled: true, operable: false}),
    html: nativeCheckbox('aria-disabled="true"'),
  },
  {
    id: 'violating-disabled-keyboard-operable',
    summary:
      'a checkbox that refuses pointer activation while its unavailable state still changes with Space',
    facts: facts({disabled: true, operable: false}),
    html: divCheckbox(
      `tabindex="0" aria-checked="false" aria-disabled="true" onclick="event.preventDefault()" ${TOGGLE_ON_SPACE}`,
    ),
  },
  {
    id: 'violating-required-unexposed',
    summary: 'a checkbox that must be on but never says so',
    facts: facts({required: true}),
    html: nativeCheckbox(),
  },
  {
    id: 'violating-readonly-unexposed',
    summary: 'a read-only checkbox with no read-only declaration',
    facts: facts({readOnly: true, operable: false}),
    html: nativeCheckbox(
      `onclick="event.preventDefault()" onkeydown="if (event.key === ' ') { event.preventDefault(); }"`,
    ),
  },
  {
    id: 'violating-readonly-overexposed',
    summary: 'an editable checkbox falsely declared read-only',
    facts: facts(),
    html: nativeCheckbox('aria-readonly="true"'),
  },
  {
    id: 'violating-required-overexposed',
    summary: 'an optional checkbox falsely declared required',
    facts: facts({checked: true}),
    html: nativeCheckbox('checked required'),
  },
  {
    id: 'violating-invalid-overexposed',
    summary: 'a valid checkbox falsely exposed as invalid',
    facts: facts(),
    html: nativeCheckbox('aria-invalid="true"'),
  },
  {
    id: 'violating-invalid-unexposed',
    summary: 'a checkbox in error that never says so',
    facts: facts({invalid: true}),
    html: nativeCheckbox(),
  },
];

export function fixture(id: string): CheckboxFixture {
  const found = CHECKBOX_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown checkbox fixture "${id}"`);
  }
  return found;
}

/** The conforming fixtures every expectation must pass against (AST-020 FR11). */
export const CONFORMING_FIXTURES: readonly string[] = CHECKBOX_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

/**
 * For each expectation, the fixtures that remove its outcome. Every expectation
 * needs at least one, and the self-tests fail when one is missing — that is how
 * "the contract can actually fail" stops being a claim (AST-020 FR11).
 */
export const CHECKBOX_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'checkbox.description.resolvable': [
    'violating-dangling-description',
    'violating-wrong-description',
  ],
  'checkbox.role.exposed': [
    'violating-checkbox-role',
    'violating-generic-element',
  ],
  'checkbox.name.exposed': ['violating-unnamed'],
  'checkbox.state.exposed': [
    'violating-state-mismatch',
    'violating-mixed-state-mismatch',
    'violating-generic-element',
  ],
  'checkbox.description.exposed': [
    'violating-empty-description',
    'violating-wrong-description',
  ],
  'checkbox.disabled.exposed': ['violating-disabled-unexposed'],
  'checkbox.disabled.not-exposed': ['violating-disabled-overexposed'],
  'checkbox.readonly.declared': ['violating-readonly-unexposed'],
  'checkbox.readonly.not-declared': ['violating-readonly-overexposed'],
  'checkbox.required.declared': ['violating-required-unexposed'],
  'checkbox.required.not-declared': ['violating-required-overexposed'],
  'checkbox.invalid.exposed': ['violating-invalid-unexposed'],
  'checkbox.invalid.not-exposed': ['violating-invalid-overexposed'],
  'checkbox.name.matches-visible-label': ['violating-name-mismatch'],
  'checkbox.state.survives-an-aborted-press': ['violating-down-event-toggle'],
  'checkbox.state.keeps-focus-on-change': [
    'violating-focus-moves-on-change',
    'violating-inert',
    'violating-pointer-only-unfocusable',
  ],
  'checkbox.state.pointer-round-trip': [
    'violating-inert',
    'violating-wrong-start-first-noop',
    'violating-one-way',
  ],
  'checkbox.state.space-round-trip': [
    'violating-pointer-only',
    'violating-pointer-only-unfocusable',
    'violating-wrong-start-first-noop',
    'violating-one-way',
  ],
  'checkbox.focus.reachable-and-escapable': [
    'violating-unreachable',
    'violating-pointer-only-unfocusable',
    'violating-keyboard-trap',
  ],
  'checkbox.focus.declared-inoperable-reachable': [
    'violating-declared-unavailable-unreachable',
  ],
  'checkbox.state.inoperable': [
    'violating-disabled-operable',
    'violating-disabled-keyboard-operable',
  ],
};

const MUTATION_FAILURES: Readonly<Record<string, string>> = {
  'checkbox.description.resolvable:violating-dangling-description':
    'aria-describedby points at "hint", which resolves to nothing',
  'checkbox.description.resolvable:violating-wrong-description':
    'the binding expects the description "Sends a notification for every mention.", but aria-describedby resolves to "This text describes a different control."',
  'checkbox.role.exposed:violating-checkbox-role':
    'this binding adopts the checkbox role, but the browser reports "switch"',
  'checkbox.role.exposed:violating-generic-element':
    'this binding adopts the checkbox role, but the browser reports "generic"',
  'checkbox.name.exposed:violating-unnamed':
    'the browser computes no accessible name for this checkbox, so the accessibility node does not identify the choice',
  'checkbox.state.exposed:violating-state-mismatch':
    'this state renders checked but the browser reports it as unchecked',
  'checkbox.state.exposed:violating-mixed-state-mismatch':
    'this state renders partially checked but the browser reports it as unchecked',
  'checkbox.state.exposed:violating-generic-element':
    'the browser accessibility node exposes no checked state for this checkbox',
  'checkbox.description.exposed:violating-empty-description':
    'the binding expects the description "Sends a notification for every mention.", but the browser computes no accessible description',
  'checkbox.description.exposed:violating-wrong-description':
    'the binding expects the description "Sends a notification for every mention.", but the browser computes "This text describes a different control."',
  'checkbox.disabled.exposed:violating-disabled-unexposed':
    'the binding declares this state unavailable, but the browser reports the checkbox as available, so the user is invited to change something that will not change',
  'checkbox.disabled.not-exposed:violating-disabled-overexposed':
    'this state is available, but the browser exposes the checkbox as disabled',
  'checkbox.readonly.declared:violating-readonly-unexposed':
    'this state is read-only, but the checkbox does not declare aria-readonly="true"',
  'checkbox.readonly.not-declared:violating-readonly-overexposed':
    'this state is editable, but the checkbox declares aria-readonly="true"',
  'checkbox.required.declared:violating-required-unexposed':
    'this state is required, but the checkbox declares neither the native required attribute nor aria-required="true", so user agents receive no required-state declaration',
  'checkbox.required.not-declared:violating-required-overexposed':
    'this state is not required, but the checkbox exposes a required declaration',
  'checkbox.invalid.exposed:violating-invalid-unexposed':
    'this state is in error, but the browser does not report the checkbox as invalid, so the error is only visible to people who can see the message',
  'checkbox.invalid.not-exposed:violating-invalid-overexposed':
    'this state is not invalid, but the browser exposes the checkbox as invalid',
  'checkbox.name.matches-visible-label:violating-name-mismatch':
    'the visible label reads "Notifications" but the browser computes the accessible name as "Toggle", so speaking the visible label does not reach this control',
  'checkbox.state.survives-an-aborted-press:violating-down-event-toggle':
    'pressing the checkbox and releasing away from it still turned it checked: the change happens on the way down, so a press cannot be taken back',
  'checkbox.state.keeps-focus-on-change:violating-focus-moves-on-change':
    'changing the checkbox to checked moved focus off it, so the user is somewhere else without having asked to be',
  'checkbox.state.keeps-focus-on-change:violating-inert':
    'pressing Space left the checkbox unchecked, so nothing changed and this expectation has no change to judge',
  'checkbox.state.keeps-focus-on-change:violating-pointer-only-unfocusable':
    'the checkbox did not take focus, so this state cannot be changed from the keyboard at all',
  'checkbox.state.pointer-round-trip:violating-inert':
    'clicking the checkbox left the checkbox unchecked: it cannot be changed to checked',
  'checkbox.state.pointer-round-trip:violating-wrong-start-first-noop':
    'the binding declares unchecked, but the browser starts checked',
  'checkbox.state.pointer-round-trip:violating-one-way':
    'clicking the checkbox changed the checkbox to checked, but doing it again left it checked instead of returning it to unchecked: the change only goes one way',
  'checkbox.state.space-round-trip:violating-pointer-only':
    'pressing Space on the focused checkbox left the checkbox unchecked: it cannot be changed to checked',
  'checkbox.state.space-round-trip:violating-pointer-only-unfocusable':
    'the checkbox did not take focus, so Space never reaches it',
  'checkbox.state.space-round-trip:violating-wrong-start-first-noop':
    'the binding declares unchecked, but the browser starts checked',
  'checkbox.state.space-round-trip:violating-one-way':
    'pressing Space on the focused checkbox changed the checkbox to checked, but doing it again left it checked instead of returning it to unchecked: the change only goes one way',
  'checkbox.focus.reachable-and-escapable:violating-unreachable':
    '10 presses of Tab from the start of the document never reached the checkbox, so a keyboard user cannot get to this setting',
  'checkbox.focus.reachable-and-escapable:violating-pointer-only-unfocusable':
    '10 presses of Tab from the start of the document never reached the checkbox, so a keyboard user cannot get to this setting',
  'checkbox.focus.reachable-and-escapable:violating-keyboard-trap':
    'Tab did not move focus off the checkbox, so a keyboard user is stuck on it',
  'checkbox.focus.declared-inoperable-reachable:violating-declared-unavailable-unreachable':
    '10 presses of Tab from the start of the document never reached the checkbox, so a keyboard user cannot get to this setting',
  'checkbox.state.inoperable:violating-disabled-operable':
    'the user is not meant to be able to change this state, but clicking the checkbox turned it checked',
  'checkbox.state.inoperable:violating-disabled-keyboard-operable':
    'the user is not meant to be able to change this state, but pressing Space on the checkbox turned it checked',
};

export function expectedMutationFailure(
  expectation: string,
  target: string,
): string {
  const detail = MUTATION_FAILURES[`${expectation}:${target}`];
  if (detail == null) {
    throw new Error(
      `no expected failure detail for ${expectation} against ${target}`,
    );
  }
  return detail;
}
