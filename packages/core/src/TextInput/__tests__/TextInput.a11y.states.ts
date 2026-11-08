// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInput.a11y.states.ts
 * @input Uses TextInputStateFacts from @astryxdesign/a11y-spec
 * @output TEXT_INPUT_BINDING_STATES — the AST-021 state inventory for the native
 *   role-bearing controls rendered by TextInput and TextArea — plus explicit
 *   exclusions for adjacent parts and states owned elsewhere
 * @position Data-only binding inventory. JSX lives in TextInput.a11y.renders.tsx.
 */

import type {TextInputStateFacts} from '@astryxdesign/a11y-spec';

export type TextInputBinding = 'TextInput' | 'TextArea';
export type TextInputBindingRow = (typeof TEXT_INPUT_BINDING_STATES)[number];
export type TextInputStateId = (typeof TEXT_INPUT_BINDING_STATES)[number]['id'];

export interface TextInputBindingState {
  readonly id: string;
  readonly binding: TextInputBinding;
  readonly summary: string;
  readonly facts: TextInputStateFacts;
  readonly visibleLabel: string | null;
  readonly storyId: string;
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

const areaFacts = (
  overrides: Partial<TextInputStateFacts> = {},
): TextInputStateFacts => facts({multiline: true, ...overrides});

export const TEXT_INPUT_BINDING_EXCLUSIONS = [
  {
    owner: 'TextInput type=email',
    reason:
      'The native email control has the same textbox role, naming, state, focus, and text-editing contract as the bound single-line state; email parsing and browser validation remain component-local.',
  },
  {
    owner: 'TextInput type=password',
    reason:
      'The password state is bound for persistent naming, state, focus, and editing. HTML-AAM defines no corresponding ARIA role and its protected value mapping is platform-specific, so role, multiline, and exact-value expectations are inapplicable.',
  },
  {
    owner: 'TextInput and TextArea loading',
    reason:
      'Loading changes aria-busy and spinner composition, but no current Astryx record adopts aria-busy as a reusable native text-input requirement. Existing busy, callback, and optimistic-value tests remain local.',
  },
  {
    owner: 'TextInput clear button and status tooltip buttons',
    reason:
      'Those are separate role-bearing button parts. The Button pattern and component-local composition tests own them; this binding targets only the native textbox.',
  },
  {
    owner: 'TextArea character-count announcements',
    reason:
      'Static counter association is covered through the textbox description. Speech, timing, and repetition remain under AST-009 and TextArea local tests.',
  },
  {
    owner: 'FileInput',
    reason:
      'FileInput uses the native file-upload model and is intentionally outside the text-input pattern.',
  },
  {
    owner: 'ChatComposerInput combobox mode',
    reason:
      'When trigger-menu behavior is present the role-bearing editor adopts combobox semantics and belongs to the Combobox pattern.',
  },
  {
    owner: 'CodeEditor',
    reason:
      'No current component, family, or system record adopts the Lab CodeEditor into the native text-input model.',
  },
] as const;

export const TEXT_INPUT_BINDING_STATES = [
  {
    id: 'input-empty-placeholder',
    binding: 'TextInput',
    summary:
      'an empty editable single-line control with a visible label and placeholder',
    facts: facts(),
    visibleLabel: 'Name',
    storyId: 'a11y-text-input-pattern--input-empty-placeholder',
  },
  {
    id: 'input-valued',
    binding: 'TextInput',
    summary: 'an editable single-line control with an existing value',
    facts: facts({value: 'Ada Lovelace'}),
    visibleLabel: 'Name',
    storyId: 'a11y-text-input-pattern--input-valued',
  },
  {
    id: 'input-hidden-label',
    binding: 'TextInput',
    summary: 'a single-line control named by a visually hidden label',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-text-input-pattern--input-hidden-label',
  },
  {
    id: 'input-described',
    binding: 'TextInput',
    summary: 'a single-line control with helper text',
    facts: facts({description: 'Use the name shown on your profile.'}),
    visibleLabel: 'Display name',
    storyId: 'a11y-text-input-pattern--input-described',
  },
  {
    id: 'input-optional',
    binding: 'TextInput',
    summary: 'an optional single-line control',
    facts: facts(),
    visibleLabel: 'Nickname',
    storyId: 'a11y-text-input-pattern--input-optional',
  },
  {
    id: 'input-required',
    binding: 'TextInput',
    summary: 'a required single-line control',
    facts: facts({required: true}),
    visibleLabel: 'Username',
    storyId: 'a11y-text-input-pattern--input-required',
  },
  {
    id: 'input-error',
    binding: 'TextInput',
    summary: 'an invalid single-line control with textual error feedback',
    facts: facts({
      value: 'invalid@',
      invalid: true,
      description: 'Enter a valid email address.',
      errorMessage: 'Enter a valid email address.',
    }),
    visibleLabel: 'Email',
    storyId: 'a11y-text-input-pattern--input-error',
  },
  {
    id: 'input-error-without-message',
    binding: 'TextInput',
    summary: 'an invalid single-line control with no textual error feedback',
    facts: facts({value: 'invalid@', invalid: true}),
    visibleLabel: 'Email',
    storyId: 'a11y-text-input-pattern--input-error-without-message',
  },
  {
    id: 'input-warning-detached',
    binding: 'TextInput',
    summary: 'a valid single-line control with detached warning text',
    facts: facts({
      value: 'user123',
      description: 'This username may be taken.',
    }),
    visibleLabel: 'Username',
    storyId: 'a11y-text-input-pattern--input-warning-detached',
  },
  {
    id: 'input-success-tooltip',
    binding: 'TextInput',
    summary: 'a valid single-line control described by tooltip status text',
    facts: facts({
      value: 'validuser',
      description: 'Username is available.',
    }),
    visibleLabel: 'Username',
    storyId: 'a11y-text-input-pattern--input-success-tooltip',
  },
  {
    id: 'input-disabled',
    binding: 'TextInput',
    summary: 'a natively disabled single-line control outside the tab sequence',
    facts: facts({
      value: 'Locked',
      editable: false,
      focusable: false,
      disabled: true,
    }),
    visibleLabel: 'Owner',
    storyId: 'a11y-text-input-pattern--input-disabled',
  },
  {
    id: 'input-disabled-with-message',
    binding: 'TextInput',
    summary: 'an unavailable single-line control kept focusable for its reason',
    facts: facts({
      value: 'alice@example.com',
      editable: false,
      disabled: true,
      description: 'You need the Editor role to change this.',
    }),
    visibleLabel: 'Owner',
    storyId: 'a11y-text-input-pattern--input-disabled-with-message',
  },
  {
    id: 'input-read-only',
    binding: 'TextInput',
    summary: 'a read-only single-line control that stays focusable',
    facts: facts({
      value: 'ACCT-4417-9920',
      editable: false,
      readOnly: true,
    }),
    visibleLabel: 'Account number',
    storyId: 'a11y-text-input-pattern--input-read-only',
  },
  {
    id: 'input-password',
    binding: 'TextInput',
    summary: 'a password control whose protected value remains browser-owned',
    facts: facts({role: null, value: null}),
    visibleLabel: 'Password',
    storyId: 'a11y-text-input-pattern--input-password',
  },
  {
    id: 'input-group-described',
    binding: 'TextInput',
    summary: 'a grouped single-line control named and described by InputGroup',
    facts: facts({description: 'Enter the amount in USD.'}),
    visibleLabel: 'Price',
    storyId: 'a11y-text-input-pattern--input-group-described',
  },
  {
    id: 'textarea-empty-placeholder',
    binding: 'TextArea',
    summary: 'an empty editable multi-line control with a placeholder',
    facts: areaFacts(),
    visibleLabel: 'Description',
    storyId: 'a11y-text-input-pattern--textarea-empty-placeholder',
  },
  {
    id: 'textarea-valued',
    binding: 'TextArea',
    summary: 'an editable multi-line control with an existing value',
    facts: areaFacts({value: 'Existing notes'}),
    visibleLabel: 'Notes',
    storyId: 'a11y-text-input-pattern--textarea-valued',
  },
  {
    id: 'textarea-hidden-label',
    binding: 'TextArea',
    summary: 'a multi-line control named by a visually hidden label',
    facts: areaFacts(),
    visibleLabel: null,
    storyId: 'a11y-text-input-pattern--textarea-hidden-label',
  },
  {
    id: 'textarea-described',
    binding: 'TextArea',
    summary: 'a multi-line control with helper text',
    facts: areaFacts({description: 'Summarize the change.'}),
    visibleLabel: 'Description',
    storyId: 'a11y-text-input-pattern--textarea-described',
  },
  {
    id: 'textarea-optional',
    binding: 'TextArea',
    summary: 'an optional multi-line control',
    facts: areaFacts(),
    visibleLabel: 'Additional notes',
    storyId: 'a11y-text-input-pattern--textarea-optional',
  },
  {
    id: 'textarea-required',
    binding: 'TextArea',
    summary: 'a required multi-line control',
    facts: areaFacts({required: true}),
    visibleLabel: 'Feedback',
    storyId: 'a11y-text-input-pattern--textarea-required',
  },
  {
    id: 'textarea-error',
    binding: 'TextArea',
    summary: 'an invalid multi-line control with textual error feedback',
    facts: areaFacts({
      value: 'Too short',
      invalid: true,
      description: 'Description must be at least 50 characters.',
      errorMessage: 'Description must be at least 50 characters.',
    }),
    visibleLabel: 'Description',
    storyId: 'a11y-text-input-pattern--textarea-error',
  },
  {
    id: 'textarea-error-without-message',
    binding: 'TextArea',
    summary: 'an invalid multi-line control with no textual error feedback',
    facts: areaFacts({value: 'Invalid', invalid: true}),
    visibleLabel: 'Description',
    storyId: 'a11y-text-input-pattern--textarea-error-without-message',
  },
  {
    id: 'textarea-warning-detached',
    binding: 'TextArea',
    summary: 'a valid multi-line control with detached warning text',
    facts: areaFacts({
      value: 'Review this text',
      description: 'Content may need review.',
    }),
    visibleLabel: 'Content',
    storyId: 'a11y-text-input-pattern--textarea-warning-detached',
  },
  {
    id: 'textarea-success-tooltip',
    binding: 'TextArea',
    summary: 'a valid multi-line control described by tooltip status text',
    facts: areaFacts({
      value: 'Complete description',
      description: 'Description looks good.',
    }),
    visibleLabel: 'Description',
    storyId: 'a11y-text-input-pattern--textarea-success-tooltip',
  },
  {
    id: 'textarea-disabled',
    binding: 'TextArea',
    summary: 'a natively disabled multi-line control outside the tab sequence',
    facts: areaFacts({
      value: 'Locked notes',
      editable: false,
      focusable: false,
      disabled: true,
    }),
    visibleLabel: 'Notes',
    storyId: 'a11y-text-input-pattern--textarea-disabled',
  },
  {
    id: 'textarea-disabled-with-message',
    binding: 'TextArea',
    summary: 'an unavailable multi-line control kept focusable for its reason',
    facts: areaFacts({
      value: 'Locked notes',
      editable: false,
      disabled: true,
      description: 'Notes are locked after submission.',
    }),
    visibleLabel: 'Notes',
    storyId: 'a11y-text-input-pattern--textarea-disabled-with-message',
  },
  {
    id: 'textarea-read-only',
    binding: 'TextArea',
    summary: 'a read-only multi-line control that stays focusable',
    facts: areaFacts({
      value: 'Generated by the importer.',
      editable: false,
      readOnly: true,
    }),
    visibleLabel: 'Import summary',
    storyId: 'a11y-text-input-pattern--textarea-read-only',
  },
  {
    id: 'textarea-over-limit',
    binding: 'TextArea',
    summary:
      'a multi-line control invalid because its character count is over the limit',
    facts: areaFacts({
      value: 'abcdef',
      invalid: true,
      description: '6/5',
      errorMessage: '6/5',
    }),
    visibleLabel: 'Summary',
    storyId: 'a11y-text-input-pattern--textarea-over-limit',
  },
] as const satisfies ReadonlyArray<TextInputBindingState>;
