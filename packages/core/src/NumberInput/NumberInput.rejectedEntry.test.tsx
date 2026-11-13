// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NumberInput.rejectedEntry.test.tsx
 * @input Uses vitest, @testing-library/react, NumberInput, InputGroup
 * @output Tests for rejected typed entries: when a rejection shows, its
 *   message, invalid state and announcement, the caller status that wins,
 *   onEntryErrorChange, and what a form posts while a rejected draft stays
 * @position Testing; validates NumberInput.tsx rejected-entry behavior
 *
 * SYNC: When NumberInput.tsx changes how it rejects a draft, update these tests
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {InputGroup} from '../InputGroup';
import {InputGroupText} from '../InputGroup/InputGroupText';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {
  NumberInput,
  type NumberInputEntryError,
  type NumberInputProps,
  type NumberInputStatus,
} from './NumberInput';

const MESSAGE = 'Invalid number';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  __resetLiveRegionsForTest();
});

/**
 * Records each text that the shared assertive live region shows, where Field
 * announces an error status.
 */
function recordAssertiveAnnouncements(): string[] {
  const texts: string[] = [];
  let last = '';
  const observer = new MutationObserver(() => {
    const text =
      document.querySelector('[data-astryx-live-region="assertive"]')
        ?.textContent ?? '';
    if (text !== last) {
      last = text;
      if (text) {
        texts.push(text);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  cleanups.push(() => observer.disconnect());
  return texts;
}

/** Waits long enough for a late announcement to show. */
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 50));
}

type FieldProps = Partial<Omit<NumberInputProps, 'onChange' | 'hasClear'>> & {
  onChange?: (value: number) => void;
};

function field(props: FieldProps = {}) {
  const {onChange = () => {}, ...rest} = props;
  return <NumberInput label="Seats" value={7} {...rest} onChange={onChange} />;
}

function getInput() {
  return screen.getByRole('spinbutton');
}

/** Types the text one character at a time, as a person does. */
function typeEach(input: HTMLElement, text: string, onEach: () => void) {
  for (let end = 1; end <= text.length; end++) {
    fireEvent.change(input, {target: {value: text.slice(0, end)}});
    onEach();
  }
}

function getAlert(container: HTMLElement) {
  return within(container).getByRole('alert');
}

describe('NumberInput rejected entry', () => {
  describe('while typing', () => {
    it.each<[string, string, FieldProps]>([
      ['a lone minus', '-', {}],
      ['unreadable text', '1a', {}],
      ['a fraction when integer-only', '1.5', {isIntegerOnly: true}],
      ['a number past max', '150', {max: 100}],
      ['a number under min', '1', {min: 10}],
      ['any number when min is above max', '5', {min: 10, max: 1}],
    ])('marks, shows, and announces nothing for %s', async (_, text, props) => {
      const announced = recordAssertiveAnnouncements();
      const {container} = render(field(props));
      const input = getInput();
      fireEvent.focus(input);
      typeEach(input, text, () => {
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
        expect(getAlert(container)).toHaveTextContent('');
      });
      expect(input).toHaveValue(text);
      await settle();
      expect(announced).toEqual([]);
    });
  });

  describe('at commit', () => {
    it.each<[string, string, FieldProps, 'Enter' | 'blur']>([
      ['unreadable text', '1a', {}, 'Enter'],
      ['unreadable text', '1a', {}, 'blur'],
      ['a lone minus', '-', {}, 'blur'],
      ['a fraction when integer-only', '1.5', {isIntegerOnly: true}, 'Enter'],
      ['a fraction when integer-only', '1.5', {isIntegerOnly: true}, 'blur'],
      ['a number when min is above max', '5', {min: 10, max: 1}, 'Enter'],
      ['a number when min is above max', '5', {min: 10, max: 1}, 'blur'],
    ])(
      'keeps %s with its message, invalid state, and one announcement on %s',
      async (_, text, props, trigger) => {
        const announced = recordAssertiveAnnouncements();
        const onChange = vi.fn();
        const {container} = render(field({...props, onChange}));
        const input = getInput();
        fireEvent.focus(input);
        fireEvent.change(input, {target: {value: text}});
        if (trigger === 'Enter') {
          fireEvent.keyDown(input, {key: 'Enter'});
        } else {
          fireEvent.blur(input);
        }

        expect(input).toHaveValue(text);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const message = screen.getByText(MESSAGE);
        const messageID = message.closest('[id]')!.id;
        expect(input.getAttribute('aria-describedby')!.split(' ')).toContain(
          messageID,
        );
        expect(getAlert(container)).toHaveTextContent('');
        expect(onChange).not.toHaveBeenCalled();
        await waitFor(() => {
          expect(announced).toEqual([MESSAGE]);
        });
        await settle();
        expect(announced).toEqual([MESSAGE]);
      },
    );

    it('clamps a number past an ordinary bound and reveals nothing', async () => {
      const announced = recordAssertiveAnnouncements();
      const onChange = vi.fn();
      render(field({max: 100, onChange}));
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '150'}});
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith(100);
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
      await settle();
      expect(announced).toEqual([]);
    });

    it('shows the message in the detached and tooltip placements', () => {
      const {rerender} = render(field({statusVariant: 'detached'}));
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      fireEvent.blur(input);
      expect(screen.getByText(MESSAGE)).toBeInTheDocument();

      rerender(field({statusVariant: 'tooltip'}));
      expect(input).toHaveAttribute('aria-invalid', 'true');
      const describedBy = input.getAttribute('aria-describedby')!.split(' ');
      expect(
        describedBy.some(
          id => document.getElementById(id)?.textContent === MESSAGE,
        ),
      ).toBe(true);
    });
  });

  describe('after a shown rejection', () => {
    function rejected(props: FieldProps = {}) {
      const announced = recordAssertiveAnnouncements();
      const utils = render(field(props));
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      fireEvent.keyDown(input, {key: 'Enter'});
      return {...utils, input, announced};
    }

    it('keeps the rejection without a new announcement while edits stay wrong', async () => {
      const {input, announced} = rejected();
      await waitFor(() => {
        expect(announced).toEqual([MESSAGE]);
      });
      fireEvent.change(input, {target: {value: '1ab'}});
      fireEvent.change(input, {target: {value: '-'}});
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(MESSAGE)).toBeInTheDocument();

      // The next commit with the same message announces nothing new.
      fireEvent.keyDown(input, {key: 'Enter'});
      await settle();
      expect(announced).toEqual([MESSAGE]);
    });

    it.each([
      ['valid', '12'],
      ['empty', ''],
      ['a number past a bound', '1000'],
    ])('clears at once when an edit makes the draft %s', (_, text) => {
      const {input} = rejected({max: 100});
      fireEvent.change(input, {target: {value: text}});
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });

    it('announces a new rejection once after the last one cleared', async () => {
      const {input, announced} = rejected();
      await waitFor(() => {
        expect(announced).toEqual([MESSAGE]);
      });
      fireEvent.change(input, {target: {value: '12'}});
      fireEvent.change(input, {target: {value: '12x'}});
      expect(input).not.toHaveAttribute('aria-invalid');
      fireEvent.blur(input);
      await waitFor(() => {
        expect(announced).toEqual([MESSAGE, MESSAGE]);
      });
    });

    it('gives way to a new value from the caller', () => {
      const {input, rerender} = rejected();
      rerender(field({value: 9}));
      expect(input).toHaveValue('9');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });

    it.each(['Enter', 'blur'] as const)(
      'keeps the draft when the caller changes its value at the %s that shows it',
      trigger => {
        function Restoring() {
          const [value, setValue] = useState<number | null>(7);
          const restore = () => setValue(null);
          return field({
            value,
            onKeyDown: event => {
              if (event.key === 'Enter') {
                restore();
              }
            },
            onBlur: restore,
          });
        }
        render(<Restoring />);
        const input = getInput();
        fireEvent.focus(input);
        fireEvent.change(input, {target: {value: '1a'}});
        if (trigger === 'Enter') {
          fireEvent.keyDown(input, {key: 'Enter'});
        } else {
          fireEvent.blur(input);
        }
        expect(input).toHaveValue('1a');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).not.toHaveAttribute('aria-valuenow');
      },
    );

    it('ends with an arrow step, which commits from the committed value', () => {
      const onChange = vi.fn();
      const {input} = rejected({onChange});
      fireEvent.keyDown(input, {key: 'ArrowUp'});
      expect(onChange).toHaveBeenCalledWith(8);
      expect(input).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('while disabled', () => {
    it('drops the draft and its rejection, which do not return once editable', () => {
      const {rerender} = render(field());
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      fireEvent.blur(input);
      expect(input).toHaveAttribute('aria-invalid', 'true');

      rerender(field({isDisabled: true}));
      expect(input).toHaveValue('7');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();

      rerender(field());
      expect(input).toHaveValue('7');
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('drops a draft in progress, so its commit reveals nothing', () => {
      const {rerender} = render(field());
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      rerender(field({isDisabled: true}));
      fireEvent.blur(input);
      rerender(field());
      expect(input).toHaveValue('7');
      expect(input).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('inside an InputGroup', () => {
    function grouped(props: FieldProps = {}) {
      return (
        <InputGroup label="Booking">
          <InputGroupText>Seats</InputGroupText>
          {field({isLabelHidden: true, ...props})}
        </InputGroup>
      );
    }

    it('announces the rejection through the field alert and shows no message of its own', () => {
      const {container} = render(grouped());
      const input = getInput();
      const alert = getAlert(container);
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      expect(alert).toHaveTextContent('');
      fireEvent.blur(input);

      expect(alert).toHaveTextContent(MESSAGE);
      expect(alert.textContent).toBe(MESSAGE);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(container.querySelector('.astryx-field-status')).toBeNull();
    });

    it('announces the app error with the callback, and the field message without it', () => {
      const status = {type: 'error' as const, message: 'Pick 1 to 40 seats'};
      const {container, rerender} = render(
        grouped({status, onEntryErrorChange: () => {}}),
      );
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '1a'}});
      fireEvent.blur(input);
      expect(getAlert(container).textContent).toBe('Pick 1 to 40 seats');

      rerender(grouped({status}));
      expect(getAlert(container).textContent).toBe(MESSAGE);
    });
  });
});

describe('NumberInput rejected entry and a caller status', () => {
  function reject(input: HTMLElement, text = '1a') {
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: text}});
    fireEvent.blur(input);
  }

  it('shows an app error in place of the field message and announces the rejection once through the alert', async () => {
    const announced = recordAssertiveAnnouncements();
    const status = {type: 'error' as const, message: 'Pick 1 to 40 seats'};
    const {container} = render(field({status}));
    await waitFor(() => {
      expect(announced).toEqual(['Pick 1 to 40 seats']);
    });
    const input = getInput();
    const alert = getAlert(container);
    reject(input);

    expect(container.querySelector('.astryx-field-status')!.textContent).toBe(
      'Pick 1 to 40 seats',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(alert.textContent).toBe(MESSAGE);

    // The alert keeps its text while the rejection stands.
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1ab'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(alert.textContent).toBe(MESSAGE);
    await settle();
    expect(announced).toEqual(['Pick 1 to 40 seats']);
  });

  it.each<[string, NumberInputStatus]>([
    ['warning', {type: 'warning' as const, message: 'Few seats left'}],
    ['success', {type: 'success' as const, message: 'Seats held'}],
    ['message-less error', {type: 'error' as const}],
  ])('never hides a rejection behind a %s status', async (_, status) => {
    const announced = recordAssertiveAnnouncements();
    const {container} = render(field({status}));
    const input = getInput();
    reject(input);

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    if (status.message != null) {
      expect(screen.queryByText(status.message)).not.toBeInTheDocument();
    }
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(getAlert(container)).toHaveTextContent('');
    await waitFor(() => {
      expect(announced).toContain(MESSAGE);
    });
    await settle();
    expect(announced.filter(text => text === MESSAGE)).toHaveLength(1);

    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '12'}});
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    if (status.message != null) {
      expect(screen.getByText(status.message)).toBeInTheDocument();
    }
  });

  /** A form that words its own number errors from the reported kind. */
  function WordedNumberInput({
    wording,
    onEntryErrorChange,
    status,
    ...props
  }: FieldProps & {
    wording: (error: NumberInputEntryError) => string | undefined;
  }) {
    const [entryError, setEntryError] = useState<NumberInputEntryError | null>(
      null,
    );
    const message = entryError != null ? wording(entryError) : undefined;
    return field({
      ...props,
      status: message != null ? {type: 'error', message} : status,
      onEntryErrorChange: error => {
        onEntryErrorChange?.(error);
        setEntryError(error);
      },
    });
  }

  it('with the callback, shows and announces the app error once', async () => {
    const announced = recordAssertiveAnnouncements();
    const {container} = render(
      <WordedNumberInput
        isIntegerOnly
        wording={error =>
          error.kind === 'fractional'
            ? 'Enter a whole number of seats'
            : undefined
        }
      />,
    );
    const input = getInput();
    reject(input, '2.5');

    expect(
      screen.getByText('Enter a whole number of seats'),
    ).toBeInTheDocument();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(getAlert(container)).toHaveTextContent('');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => {
      expect(announced).toEqual(['Enter a whole number of seats']);
    });
    await settle();
    expect(announced).toEqual(['Enter a whole number of seats']);
  });

  it('with the callback, announces an unchanged app error once through the alert', async () => {
    const announced = recordAssertiveAnnouncements();
    const {container} = render(
      field({
        status: {type: 'error', message: 'Required'},
        onEntryErrorChange: () => {},
      }),
    );
    await waitFor(() => {
      expect(announced).toEqual(['Required']);
    });
    const input = getInput();
    const alert = getAlert(container);
    reject(input);
    expect(alert.textContent).toBe('Required');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '12'}});
    expect(alert).toHaveTextContent('');
    await settle();
    expect(announced).toEqual(['Required']);
  });

  it('with the callback, leaves the alert empty when the app error changes as the rejection starts', () => {
    const {container} = render(
      <WordedNumberInput
        status={{type: 'error', message: 'Required'}}
        wording={() => 'Enter digits only'}
      />,
    );
    reject(getInput());
    expect(screen.getByText('Enter digits only')).toBeInTheDocument();
    expect(getAlert(container)).toHaveTextContent('');
  });

  it('with the callback, shows the app error that new rules ask for, in place of the field message', async () => {
    const announced = recordAssertiveAnnouncements();
    const worded = (props: FieldProps) => (
      <WordedNumberInput
        {...props}
        wording={error =>
          error.kind === 'outOfRange' ? 'Fix the seat range' : undefined
        }
      />
    );
    const {rerender} = render(worded({isIntegerOnly: true}));
    reject(getInput(), '2.5');
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    await waitFor(() => {
      expect(announced).toEqual([MESSAGE]);
    });

    rerender(worded({min: 10, max: 1}));
    expect(screen.getByText('Fix the seat range')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(announced).toEqual([MESSAGE, 'Fix the seat range']);
    });
    await settle();
    expect(announced).toEqual([MESSAGE, 'Fix the seat range']);
  });
});

describe('NumberInput onEntryErrorChange', () => {
  it.each<[string, string, FieldProps, NumberInputEntryError]>([
    ['unreadable', '1a', {}, {kind: 'unreadable', text: '1a'}],
    [
      'fractional',
      '1.5',
      {isIntegerOnly: true},
      {kind: 'fractional', text: '1.5', value: 1.5},
    ],
    [
      'outOfRange',
      ' 5 ',
      {min: 10, max: 1},
      {kind: 'outOfRange', text: ' 5 ', value: 5},
    ],
  ])(
    'reports a %s rejection at commit, not while typing',
    (_, text, props, expected) => {
      const onEntryErrorChange = vi.fn();
      render(field({...props, onEntryErrorChange}));
      const input = getInput();
      fireEvent.focus(input);
      typeEach(input, text, () => {
        expect(onEntryErrorChange).not.toHaveBeenCalled();
      });
      fireEvent.keyDown(input, {key: 'Enter'});
      expect(onEntryErrorChange.mock.calls).toEqual([[expected]]);
    },
  );

  it('reports a rejection that a commit changes, and null when an edit makes the draft valid or empty', () => {
    const onEntryErrorChange = vi.fn();
    render(field({onEntryErrorChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    fireEvent.change(input, {target: {value: '1ab'}});
    expect(onEntryErrorChange).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '12'}});
    fireEvent.change(input, {target: {value: 'x'}});
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: ''}});
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'unreadable', text: '1a'}],
      [{kind: 'unreadable', text: '1ab'}],
      [null],
      [{kind: 'unreadable', text: 'x'}],
      [null],
    ]);
  });

  it('reports null when a new value replaces the draft', () => {
    const onEntryErrorChange = vi.fn();
    const {rerender} = render(field({onEntryErrorChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    rerender(field({onEntryErrorChange, value: 9}));
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'unreadable', text: '1a'}],
      [null],
    ]);
  });

  it('reports a rejection that new rules change or end', () => {
    const onEntryErrorChange = vi.fn();
    const {rerender} = render(field({min: 10, max: 1, onEntryErrorChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1.5'}});
    fireEvent.blur(input);
    rerender(field({min: 10, max: 1, isIntegerOnly: true, onEntryErrorChange}));
    rerender(field({min: 20, max: 1, isIntegerOnly: true, onEntryErrorChange}));
    rerender(field({min: 10, max: 1, onEntryErrorChange}));
    rerender(field({min: 1, max: 10, onEntryErrorChange}));
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'outOfRange', text: '1.5', value: 1.5}],
      [{kind: 'fractional', text: '1.5', value: 1.5}],
      [{kind: 'outOfRange', text: '1.5', value: 1.5}],
      [null],
    ]);
    // The draft stays until the person commits or edits it.
    expect(input).toHaveValue('1.5');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('reports null when a new value replaces the draft in the same update as new rules', () => {
    const onEntryErrorChange = vi.fn();
    const {rerender} = render(field({min: 10, max: 1, onEntryErrorChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1.5'}});
    fireEvent.blur(input);
    rerender(
      field({
        value: 9,
        min: 10,
        max: 1,
        isIntegerOnly: true,
        onEntryErrorChange,
      }),
    );
    expect(input).toHaveValue('9');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'outOfRange', text: '1.5', value: 1.5}],
      [null],
    ]);
  });

  it('reports null when disabling drops the draft, and nothing once editable', () => {
    const onEntryErrorChange = vi.fn();
    const {rerender} = render(field({onEntryErrorChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    rerender(field({onEntryErrorChange, isDisabled: true}));
    rerender(field({onEntryErrorChange}));
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'unreadable', text: '1a'}],
      [null],
    ]);
  });

  it('does not report an unchanged rejection again', () => {
    const onEntryErrorChange = vi.fn();
    const withPlaceholder = (placeholder: string) =>
      field({
        placeholder,
        // A new function on every render.
        onEntryErrorChange: error => {
          onEntryErrorChange(error);
        },
      });
    const {rerender} = render(withPlaceholder('One'));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.keyDown(input, {key: 'Enter'});
    rerender(withPlaceholder('Two'));
    expect(onEntryErrorChange).toHaveBeenCalledTimes(1);
  });

  it('reports null when the field unmounts during a rejection, and nothing without one', () => {
    const onEntryErrorChange = vi.fn();
    const first = render(field({onEntryErrorChange}));
    fireEvent.focus(getInput());
    fireEvent.change(getInput(), {target: {value: '1a'}});
    fireEvent.blur(getInput());
    first.unmount();
    expect(onEntryErrorChange.mock.calls).toEqual([
      [{kind: 'unreadable', text: '1a'}],
      [null],
    ]);

    const quiet = vi.fn();
    const second = render(field({onEntryErrorChange: quiet}));
    fireEvent.focus(getInput());
    fireEvent.change(getInput(), {target: {value: '12'}});
    fireEvent.blur(getInput());
    second.unmount();
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe('NumberInput form value while a rejected draft stays', () => {
  function formData(container: HTMLElement) {
    return [...new FormData(container.querySelector('form')!).entries()];
  }

  function inForm(props: FieldProps = {}, locale = 'en-US') {
    return (
      <InternationalizationProvider locale={locale}>
        <form>{field({htmlName: 'seats', ...props})}</form>
      </InternationalizationProvider>
    );
  }

  it('posts the committed number from a hidden input after blur keeps a draft', () => {
    const {container} = render(inForm({value: 2.5}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);

    expect(input).not.toHaveAttribute('name');
    expect(formData(container)).toEqual([['seats', '2.5']]);
  });

  it('posts the committed number as the field shows it, plain at rest and locale-formatted while focused', () => {
    const {container} = render(inForm({value: 2.5}, 'de-DE'));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    expect(formData(container)).toEqual([['seats', '2.5']]);

    fireEvent.focus(input);
    expect(formData(container)).toEqual([['seats', '2,5']]);
  });

  it('posts an empty value for an empty committed value', () => {
    const {container} = render(inForm({value: null}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    expect(formData(container)).toEqual([['seats', '']]);
  });

  it('gives the name back to the visible input once the person edits the draft', () => {
    const {container} = render(inForm());
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1ab'}});

    expect(input).toHaveAttribute('name', 'seats');
    expect(formData(container)).toEqual([['seats', '1ab']]);
  });

  it('gives the name back to the visible input when a new value replaces the draft', () => {
    const {container, rerender} = render(inForm());
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    rerender(inForm({value: 9}));

    expect(input).toHaveAttribute('name', 'seats');
    expect(formData(container)).toEqual([['seats', '9']]);
  });

  it('gives the name back to the visible input when a new value replaces a draft that new rules accepted', () => {
    const onChange = vi.fn();
    const {container, rerender} = render(inForm({min: 10, max: 1, onChange}));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1.5'}});
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');

    rerender(inForm({min: 1, max: 10, onChange}));
    expect(input).toHaveValue('1.5');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(formData(container)).toEqual([['seats', '7']]);

    rerender(inForm({min: 1, max: 10, onChange, value: 9}));
    expect(input).toHaveValue('9');
    expect(input).toHaveAttribute('aria-valuenow', '9');
    expect(input).toHaveAttribute('name', 'seats');
    expect(formData(container)).toEqual([['seats', '9']]);

    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('posts the typed text of a draft that Enter keeps, as before', () => {
    const {container} = render(inForm());
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(input).toHaveAttribute('name', 'seats');
    expect(formData(container)).toEqual([['seats', '1a']]);
  });

  it('with formatValue, posts the raw committed number from its one hidden input', () => {
    const {container} = render(
      inForm({value: 1234, formatValue: number => `$${number}`}),
    );
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '1a'}});
    fireEvent.blur(input);
    expect(formData(container)).toEqual([['seats', '1234']]);
    fireEvent.focus(input);
    expect(formData(container)).toEqual([['seats', '1234']]);
  });
});
