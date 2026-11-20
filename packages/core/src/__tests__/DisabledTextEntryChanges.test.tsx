// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DisabledTextEntryChanges.test.tsx
 * @input Uses vitest, @testing-library/react, user-event, and the five text
 *   entry fields: TextInput, TextArea, NumberInput, Typeahead and Tokenizer
 * @output Pins spec:AST-085 FR2 (a paste or a drop changes nothing) and FR3
 *   (no value is submitted) for each field, disabled without a reason and
 *   disabled with a reason
 * @position Shared contract test across the text entry fields
 */

import type {ReactElement} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {NumberInput} from '../NumberInput';
import {TextArea} from '../TextArea';
import {TextInput} from '../TextInput';
import {Tokenizer} from '../Tokenizer';
import {Typeahead} from '../Typeahead';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

const people: SearchableItem[] = [
  {id: '1', label: 'Alice'},
  {id: '2', label: 'Bob'},
];

const peopleSource: SearchSource = {
  search: (query: string) =>
    people.filter(p => p.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => people,
};

const REASON = 'You need the Editor role to change this';

interface Field {
  name: string;
  role: 'textbox' | 'spinbutton' | 'combobox';
  // Renders the disabled field with a change spy, and with or without a
  // reason. `htmlName` is null for a field that has no form value.
  render: (props: {
    onChange: () => void;
    disabledMessage?: string;
  }) => ReactElement;
  htmlName: string | null;
  // The field's value before any interaction, as the input shows it.
  shownValue: string;
}

const fields: Field[] = [
  {
    name: 'TextInput',
    role: 'textbox',
    htmlName: 'owner',
    shownValue: 'alice',
    render: props => (
      <TextInput
        label="Owner"
        isRequired
        htmlName="owner"
        value="alice"
        isDisabled
        {...props}
      />
    ),
  },
  {
    name: 'TextArea',
    role: 'textbox',
    htmlName: 'notes',
    shownValue: 'Draft',
    render: props => (
      <TextArea
        label="Notes"
        isRequired
        htmlName="notes"
        value="Draft"
        isDisabled
        {...props}
      />
    ),
  },
  {
    name: 'NumberInput',
    role: 'spinbutton',
    htmlName: 'seats',
    shownValue: '4',
    render: props => (
      <NumberInput
        label="Seats"
        isRequired
        htmlName="seats"
        value={4}
        isDisabled
        {...props}
      />
    ),
  },
  {
    // Typeahead has no form value of its own: its input holds the query.
    name: 'Typeahead',
    role: 'combobox',
    htmlName: null,
    shownValue: '',
    render: props => (
      <Typeahead
        label="Assignee"
        isRequired
        searchSource={peopleSource}
        value={null}
        isDisabled
        {...props}
      />
    ),
  },
  {
    name: 'Tokenizer',
    role: 'combobox',
    htmlName: 'reviewers',
    shownValue: '',
    render: props => (
      <Tokenizer
        label="Reviewers"
        htmlName="reviewers"
        searchSource={peopleSource}
        value={[people[0]]}
        isRequired
        isDisabled
        {...props}
      />
    ),
  },
];

const states = [
  {label: 'disabled without a reason', disabledMessage: undefined},
  {label: 'disabled with a reason', disabledMessage: REASON},
] as const;

describe('a disabled text entry field changes nothing and submits nothing (spec:AST-085 FR2, FR3)', () => {
  for (const field of fields) {
    for (const state of states) {
      describe(`${field.name}, ${state.label}`, () => {
        it('ignores a paste', async () => {
          const user = userEvent.setup();
          const onChange = vi.fn();
          render(
            field.render({onChange, disabledMessage: state.disabledMessage}),
          );
          const input = screen.getByRole<HTMLInputElement>(field.role);
          await user.click(input);
          await user.paste('Bob');
          expect(input).toHaveValue(field.shownValue);
          expect(onChange).not.toHaveBeenCalled();
        });

        it('ignores a drop, and the input refuses dropped text natively', () => {
          const onChange = vi.fn();
          render(
            field.render({onChange, disabledMessage: state.disabledMessage}),
          );
          const input = screen.getByRole<HTMLInputElement>(field.role);
          const dataTransfer = {
            types: ['text/plain'],
            getData: () => 'Bob',
            dropEffect: 'copy',
            effectAllowed: 'all',
            files: [],
            items: [],
          };
          fireEvent.dragEnter(input, {dataTransfer});
          fireEvent.dragOver(input, {dataTransfer});
          fireEvent.drop(input, {dataTransfer});
          expect(input).toHaveValue(field.shownValue);
          expect(onChange).not.toHaveBeenCalled();
          // A disabled field stays focusable: it is read-only, never natively
          // disabled, and a browser inserts no dropped or pasted text into a
          // read-only input.
          expect(input.readOnly).toBe(true);
          expect(input.disabled).toBe(false);
        });

        // A required disabled field must not block submission (FR3). No
        // field renders a native required attribute today, so this guards a
        // future one.
        it('adds nothing to form data, and a required one does not block submission', () => {
          const {container} = render(
            <form>
              {field.render({
                onChange: () => {},
                disabledMessage: state.disabledMessage,
              })}
            </form>,
          );
          const form = container.querySelector('form')!;
          expect([...new FormData(form).keys()]).toEqual([]);
          expect(form.checkValidity()).toBe(true);
        });
      });
    }
  }
});
