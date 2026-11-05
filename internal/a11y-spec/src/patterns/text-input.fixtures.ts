// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file text-input.fixtures.ts
 * @input Uses ./text-input (TextInputStateFacts)
 * @output TEXT_INPUT_FIXTURES — native conforming and deliberately violating
 *   fixtures — plus TEXT_INPUT_MUTATIONS, which maps each expectation to proof
 * @position Contract self-test fixtures; no Astryx component is used here.
 */

import type {TextInputStateFacts} from './text-input';

export const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface TextInputFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: TextInputStateFacts;
  readonly html: string;
}

const DEFAULT_FACTS: TextInputStateFacts = {
  role: 'textbox',
  multiline: false,
  value: '',
  editable: true,
  focusable: true,
  disabled: false,
  readOnly: false,
  required: false,
  invalid: false,
  description: null,
  errorMessage: null,
};

function facts(
  overrides: Partial<TextInputStateFacts> = {},
): TextInputStateFacts {
  return {...DEFAULT_FACTS, ...overrides};
}

export const TEXT_INPUT_FIXTURES: readonly TextInputFixture[] = [
  {
    id: 'conforming-single-line',
    summary: 'a named native single-line text input',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text">`,
  },
  {
    id: 'conforming-multi-line',
    summary: 'a named native multi-line text area',
    facts: facts({multiline: true, value: 'Existing note'}),
    html: `<label for="fx">Notes</label><textarea id="fx" ${SUBJECT_ATTRIBUTE}>Existing note</textarea>`,
  },
  {
    id: 'conforming-described',
    summary: 'a native text input with supporting text attached',
    facts: facts({description: 'Use your public display name.'}),
    html: `<label for="fx">Name</label><span id="hint">Use your public display name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-describedby="hint">`,
  },
  {
    id: 'conforming-disabled',
    summary: 'a natively disabled text input outside the tab sequence',
    facts: facts({
      value: 'Fixed value',
      editable: false,
      focusable: false,
      disabled: true,
    }),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" disabled>`,
  },
  {
    id: 'conforming-focusable-disabled',
    summary: 'an aria-disabled text input kept focusable for its reason',
    facts: facts({
      value: 'Fixed value',
      editable: false,
      disabled: true,
      description: 'Managed by your administrator.',
    }),
    html: `<label for="fx">Name</label><span id="hint">Managed by your administrator.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" aria-disabled="true" readonly aria-describedby="hint">`,
  },
  {
    id: 'conforming-read-only',
    summary: 'a native read-only text input that stays focusable',
    facts: facts({
      value: 'Fixed value',
      editable: false,
      readOnly: true,
    }),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" readonly>`,
  },
  {
    id: 'conforming-required',
    summary: 'a required text input with its obligation exposed',
    facts: facts({required: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-required="true">`,
  },
  {
    id: 'conforming-invalid',
    summary: 'an invalid text input with textual error feedback attached',
    facts: facts({
      invalid: true,
      description: 'Enter a valid name.',
      errorMessage: 'Enter a valid name.',
    }),
    html: `<label for="fx">Name</label><span id="error">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-describedby="error">`,
  },
  {
    id: 'conforming-invalid-aria-errormessage',
    summary:
      'an invalid text input using the standards-defined error relationship',
    facts: facts({
      invalid: true,
      errorMessage: 'Enter a valid name.',
    }),
    html: `<label for="fx">Name</label><span id="error">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="error">`,
  },
  {
    id: 'violating-generic-role',
    summary: 'an editable generic element that never exposes the textbox role',
    facts: facts(),
    html: `<div ${SUBJECT_ATTRIBUTE} contenteditable="true">Name</div>`,
  },
  {
    id: 'violating-value-mismatch',
    summary: 'a text input whose exposed value differs from the rendered value',
    facts: facts({value: 'Expected value'}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Wrong value">`,
  },
  {
    id: 'violating-multiline-mismatch',
    summary: 'a single-line input declared as the multi-line binding state',
    facts: facts({multiline: true}),
    html: `<label for="fx">Notes</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text">`,
  },
  {
    id: 'violating-unnamed',
    summary: 'a native text input with no accessible name',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="text">`,
  },
  {
    id: 'violating-name-mismatch',
    summary: 'a text input whose aria-label replaces its visible label',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-label="Search">`,
  },
  {
    id: 'violating-dangling-description',
    summary: 'a text input described by an id that resolves to nothing',
    facts: facts({description: 'Use your public display name.'}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-describedby="hint">`,
  },
  {
    id: 'violating-empty-description',
    summary: 'a text input described by an element that renders no text',
    facts: facts({description: 'Use your public display name.'}),
    html: `<label for="fx">Name</label><span id="hint"></span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-describedby="hint">`,
  },
  {
    id: 'violating-disabled-unexposed',
    summary: 'an unavailable text input that does not expose disabled state',
    facts: facts({value: 'Fixed value', editable: false, disabled: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" readonly>`,
  },
  {
    id: 'violating-disabled-overexposed',
    summary: 'an available text input falsely exposed as disabled',
    facts: facts({editable: false, focusable: false}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" disabled>`,
  },
  {
    id: 'violating-readonly-unexposed',
    summary: 'a read-only text input without a read-only declaration',
    facts: facts({value: 'Fixed value', editable: false, readOnly: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" onbeforeinput="event.preventDefault()">`,
  },
  {
    id: 'violating-readonly-overexposed',
    summary: 'an editable text input falsely exposed as read-only',
    facts: facts({value: 'Fixed value'}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" readonly>`,
  },
  {
    id: 'violating-required-unexposed',
    summary: 'a required text input with no required-state exposure',
    facts: facts({required: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text">`,
  },
  {
    id: 'violating-required-overexposed',
    summary: 'an optional text input falsely exposed as required',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-required="true">`,
  },
  {
    id: 'violating-invalid-unexposed',
    summary:
      'an invalid text input with feedback but no invalid-state exposure',
    facts: facts({
      invalid: true,
      description: 'Enter a valid name.',
      errorMessage: 'Enter a valid name.',
    }),
    html: `<label for="fx">Name</label><span id="error">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-describedby="error">`,
  },
  {
    id: 'violating-invalid-overexposed',
    summary: 'a valid text input falsely exposed as invalid',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true">`,
  },
  {
    id: 'violating-error-without-text',
    summary: 'an invalid text input that supplies no textual error description',
    facts: facts({invalid: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true">`,
  },
  {
    id: 'violating-hidden-unrelated-error',
    summary: 'matching hidden text that is not related to the invalid control',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span hidden>Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true">`,
  },
  {
    id: 'violating-visible-unrelated-error',
    summary: 'matching visible text that is not related to the invalid control',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span>Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true">`,
  },
  {
    id: 'violating-multi-id-errormessage',
    summary:
      'an aria-errormessage value containing more than its one allowed id',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span id="other">Other error.</span><span id="error">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="other error">`,
  },
  {
    id: 'violating-hidden-related-error',
    summary: 'an aria-errormessage target hidden while the control is invalid',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span id="error" hidden>Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="error">`,
  },
  {
    id: 'violating-transparent-related-error',
    summary: 'a related error whose text is painted transparent',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span id="error" style="color: transparent">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="error">`,
  },
  {
    id: 'violating-clipped-related-error',
    summary: 'a related error clipped completely out of view',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><span id="error" style="position: absolute; clip-path: inset(100%)">Enter a valid name.</span><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="error">`,
  },
  {
    id: 'violating-hidden-descendant-related-error',
    summary:
      'a visible relationship target whose expected error words are hidden in a descendant',
    facts: facts({invalid: true, errorMessage: 'Enter a valid name.'}),
    html: `<label for="fx">Name</label><div id="error"><span>General guidance</span><span hidden>Enter a valid name.</span></div><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" aria-invalid="true" aria-errormessage="error">`,
  },
  {
    id: 'violating-editing-inert',
    summary: 'an apparently editable text input that refuses keyboard changes',
    facts: facts({value: 'Start'}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Start" readonly>`,
  },
  {
    id: 'violating-unreachable',
    summary: 'a focusable text input removed from the tab sequence',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" tabindex="-1">`,
  },
  {
    id: 'violating-keyboard-trap',
    summary: 'a text input that swallows the Tab key',
    facts: facts(),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" onkeydown="if (event.key === 'Tab') event.preventDefault()">`,
  },
  {
    id: 'violating-inoperable-edits',
    summary:
      'a read-only binding state whose native control still accepts text',
    facts: facts({value: 'Fixed value', editable: false, readOnly: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value">`,
  },
  {
    id: 'violating-focusable-disabled-edits',
    summary: 'a focusable aria-disabled text input that still accepts text',
    facts: facts({value: 'Fixed value', editable: false, disabled: true}),
    html: `<label for="fx">Name</label><input id="fx" ${SUBJECT_ATTRIBUTE} type="text" value="Fixed value" aria-disabled="true">`,
  },
  {
    id: 'violating-placeholder-only-label',
    summary:
      'a text input that uses disappearing placeholder text as its only label',
    facts: facts(),
    html: `<input ${SUBJECT_ATTRIBUTE} type="text" placeholder="Name">`,
  },
];

export const CONFORMING_FIXTURES = [
  'conforming-single-line',
  'conforming-multi-line',
  'conforming-described',
  'conforming-disabled',
  'conforming-focusable-disabled',
  'conforming-read-only',
  'conforming-required',
  'conforming-invalid',
  'conforming-invalid-aria-errormessage',
] as const;

export const TEXT_INPUT_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'text-input.role.exposed': ['violating-generic-role'],
    'text-input.value.exposed': ['violating-value-mismatch'],
    'text-input.multiline.exposed': ['violating-multiline-mismatch'],
    'text-input.name.exposed': ['violating-unnamed'],
    'text-input.name.matches-visible-label': ['violating-name-mismatch'],
    'text-input.description.resolvable': ['violating-dangling-description'],
    'text-input.description.exposed': ['violating-empty-description'],
    'text-input.disabled.exposed': ['violating-disabled-unexposed'],
    'text-input.disabled.not-exposed': ['violating-disabled-overexposed'],
    'text-input.readonly.exposed': ['violating-readonly-unexposed'],
    'text-input.readonly.not-exposed': ['violating-readonly-overexposed'],
    'text-input.required.exposed': ['violating-required-unexposed'],
    'text-input.required.not-exposed': ['violating-required-overexposed'],
    'text-input.invalid.exposed': ['violating-invalid-unexposed'],
    'text-input.invalid.not-exposed': ['violating-invalid-overexposed'],
    'text-input.error.identified-in-text': [
      'violating-error-without-text',
      'violating-hidden-unrelated-error',
      'violating-visible-unrelated-error',
      'violating-multi-id-errormessage',
    ],
    'text-input.error.related-text-visible': [
      'violating-hidden-related-error',
      'violating-transparent-related-error',
      'violating-clipped-related-error',
      'violating-hidden-descendant-related-error',
    ],
    'text-input.editing.keyboard-round-trip': ['violating-editing-inert'],
    'text-input.focus.reachable-and-escapable': [
      'violating-unreachable',
      'violating-keyboard-trap',
    ],
    'text-input.editing.inoperable': ['violating-inoperable-edits'],
    'text-input.editing.disabled-reason-inert': [
      'violating-focusable-disabled-edits',
    ],
    'text-input.label.persistently-associated': [
      'violating-placeholder-only-label',
    ],
  };

export function fixture(id: string): TextInputFixture {
  const found = TEXT_INPUT_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown text-input fixture "${id}"`);
  }
  return found;
}
