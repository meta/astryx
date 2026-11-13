// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeInput.fr10.test.tsx
 * @input Uses vitest, Testing Library, TimeInput, FormLayout, and the input-family FR10 test helpers
 * @output Tests that every TimeInput surface takes no root styling and routes
 *   base props, container*, and control* to their FR10 targets
 * @position Colocated test for family:input-fields FR10
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {TimeInput, type TimeInputProps} from './TimeInput';
import type {ISOTimeString} from '../utils';
import {FormLayout} from '../FormLayout';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';

const SURFACES = [
  ['typed', 'text-input', 'input[type="text"]'],
  ['native', 'native', 'input[type="time"]'],
  ['touch', 'bottom-sheet', 'input[role="combobox"]'],
] as const;

// The touch surface's wheels measure themselves and its sheet is a
// modal <dialog>; jsdom implements neither.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function control(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el == null) {
    throw new Error(`no control matching ${selector}`);
  }
  return el;
}

describe('TimeInput FR10 styling contract', () => {
  it('has no root styling props and has the container* and control* parts', () => {
    expectFieldInputProps<TimeInputProps>();
  });

  it('rejects root xstyle, className, and style at compile time', () => {
    const typeOnly = () => (
      <>
        {/* Control: the same element without root styling compiles. */}
        <TimeInput label="L" controlClassName="x" containerClassName="y" />
        {/* @ts-expect-error -- root className is not a TimeInput prop (FR10) */}
        <TimeInput label="L" className="x" />
        {/* @ts-expect-error -- root style is not a TimeInput prop (FR10) */}
        <TimeInput label="L" style={{margin: 1}} />
        {/* @ts-expect-error -- root xstyle is not a TimeInput prop (FR10) */}
        <TimeInput label="L" xstyle={{}} />
      </>
    );
    void typeOnly;
  });
});

for (const [surface, presentation, selector] of SURFACES) {
  describe(`${surface} surface`, () => {
    describeFieldInputParts('TimeInput', {
      renderMember: props => (
        <TimeInput label="Start" presentation={presentation} {...props} />
      ),
      getControl: () => control(selector),
      inGroup: true,
    });
  });

  describe(`TimeInput (${surface}) FR10 details`, () => {
    it('names the control from its label when the caller sets id', () => {
      render(
        <TimeInput label="Start" presentation={presentation} id="start" />,
      );
      expect(control(selector).id).toBe('start');
      expect(document.querySelector('label[for="start"]')).not.toBeNull();
    });

    it("adds a caller's aria-describedby to the component's own", () => {
      render(
        <TimeInput
          label="Start"
          description="Local time"
          presentation={presentation}
          aria-describedby="caller-desc"
        />,
      );
      const ids = control(selector)
        .getAttribute('aria-describedby')
        ?.split(' ');
      expect(ids).toContain('caller-desc');
      expect(ids?.length).toBeGreaterThan(1);
    });

    it('keeps component-only props off the control', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <TimeInput
          label="Start"
          presentation={presentation}
          hasSeconds
          hourFormat="24h"
          increment={5}
          hasAutoFocus
          hasClear
          size="sm"
          statusVariant="detached"
          labelTooltip="tip"
          placeholder="Pick"
          isOptional
          width={240}
        />,
      );
      const attrs = [...control(selector).attributes].map(a => a.name);
      for (const prop of [
        'increment',
        'hasautofocus',
        'timeincrement',
        'timeoptioninterval',
        'numberofmonths',
        'weekstartson',
        'dateconstraints',
        'hasclear',
        'hasseconds',
        'hourformat',
        'statusvariant',
        'labeltooltip',
        'format',
        'width',
        'size',
      ]) {
        expect(attrs).not.toContain(prop);
      }
      expect(
        error.mock.calls.filter(call =>
          /React does not recognize|Invalid value for prop|non-boolean attribute/.test(
            String(call[0]),
          ),
        ),
      ).toEqual([]);
      error.mockRestore();
    });

    it("names the control by its label and then a caller's aria-labelledby", () => {
      render(
        <>
          <span id="caller-name">Billing</span>
          <TimeInput
            label="Start"
            presentation={presentation}
            aria-labelledby="caller-name"
          />
        </>,
      );
      const ids = control(selector).getAttribute('aria-labelledby')?.split(' ');
      expect(ids?.at(-1)).toBe('caller-name');
      const own = document.getElementById(ids?.[0] ?? '');
      expect(own?.tagName).toBe('LABEL');
      expect(own?.textContent).toContain('Start');
    });

    it('puts hidden, inert, and dir on the control', () => {
      render(
        <TimeInput
          label="Start"
          presentation={presentation}
          hidden
          inert
          dir="rtl"
        />,
      );
      expect(control(selector)).toHaveAttribute('hidden');
      expect(control(selector)).toHaveAttribute('inert');
      expect(control(selector)).toHaveAttribute('dir', 'rtl');
    });

    it('keeps control* on the control box in a horizontal-labels FormLayout', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container} = render(
        <FormLayout direction="horizontal-labels">
          <TimeInput
            label="Start"
            presentation={presentation}
            controlClassName="fr10-control"
          />
        </FormLayout>,
      );
      const box = container.querySelector('.fr10-control');
      expect(box).not.toBeNull();
      expect(box).toContainElement(control(selector));
      expect(box).not.toBe(control(selector));
      vi.restoreAllMocks();
    });
  });
}

describe('TimeInput FR10 handler composition', () => {
  it('runs a caller onBlur after the typed field commits its value', () => {
    const onBlur = vi.fn();
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Start"
        presentation="text-input"
        onBlur={onBlur}
        onChange={onChange}
      />,
    );
    const input = control('input[type="text"]');
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2:30 PM'}});
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith('14:30');
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('runs a caller onKeyDown for keys the typed field does not consume', () => {
    const onKeyDown = vi.fn();
    render(
      <TimeInput
        label="Start"
        presentation="text-input"
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(control('input[type="text"]'), {key: 'a'});
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('still hands a caller onKeyDown the arrow keys the typed field consumes, after the field', () => {
    const seen: {key: string; defaultPrevented: boolean}[] = [];
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Start"
        presentation="text-input"
        value={'09:00' as ISOTimeString}
        onChange={onChange}
        onKeyDown={event =>
          seen.push({key: event.key, defaultPrevented: event.defaultPrevented})
        }
      />,
    );
    fireEvent.keyDown(control('input[type="text"]'), {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalled();
    expect(seen).toEqual([{key: 'ArrowUp', defaultPrevented: true}]);
  });

  it('runs a caller onClick after the touch field opens its sheet', () => {
    const onClick = vi.fn();
    render(
      <TimeInput label="Start" presentation="bottom-sheet" onClick={onClick} />,
    );
    const input = screen.getByRole('combobox', {name: 'Start'});
    fireEvent.click(input);
    expect(onClick).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it("puts a caller's aria-label on the native time input", () => {
    render(
      <TimeInput
        label="Start"
        presentation="native"
        aria-label="Start (UTC)"
      />,
    );
    expect(control('input[type="time"]')).toHaveAttribute(
      'aria-label',
      'Start (UTC)',
    );
  });

  it('runs a caller onFocus on the native field', () => {
    const onFocus = vi.fn();
    render(<TimeInput label="Start" presentation="native" onFocus={onFocus} />);
    fireEvent.focus(control('input[type="time"]'));
    expect(onFocus).toHaveBeenCalledOnce();
  });
});
