// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.fr10.test.tsx
 * @input Uses vitest, Testing Library, DateRangeInput, FormLayout, and the input-family FR10 test helpers
 * @output Tests that DateRangeInput takes no root styling and routes base
 *   props to its range trigger, container* to the Field box, and control* to
 *   the control box
 * @position Colocated test for family:input-fields FR10
 */

import {describe, it, expect, vi} from 'vitest';
import {render, fireEvent} from '@testing-library/react';
import {DateRangeInput, type DateRangeInputProps} from './DateRangeInput';
import {FormLayout} from '../FormLayout';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';

// The range trigger is the field's semantic control: it carries the value,
// the popup state, and the accessible name.
function trigger(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    'button[aria-haspopup="dialog"]:not([tabindex="-1"])',
  );
  if (el == null) {
    throw new Error('no range trigger');
  }
  return el;
}

// A required value callback the tests do not observe.
const noop = () => {};

describe('DateRangeInput FR10 styling contract', () => {
  it('has no root styling props and has the container* and control* parts', () => {
    expectFieldInputProps<DateRangeInputProps>();
  });

  it('rejects root xstyle, className, and style at compile time', () => {
    const req = {value: null, onChange: noop};
    const typeOnly = () => (
      <>
        {/* Control: the same element without root styling compiles. */}
        <DateRangeInput {...req} label="L" controlClassName="x" />
        {/* @ts-expect-error -- root className is not a DateRangeInput prop (FR10) */}
        <DateRangeInput {...req} label="L" className="x" />
        {/* @ts-expect-error -- root style is not a DateRangeInput prop (FR10) */}
        <DateRangeInput {...req} label="L" style={{margin: 1}} />
        {/* @ts-expect-error -- root xstyle is not a DateRangeInput prop (FR10) */}
        <DateRangeInput {...req} label="L" xstyle={{}} />
      </>
    );
    void typeOnly;
  });
});

describeFieldInputParts('DateRangeInput', {
  renderMember: props => (
    <DateRangeInput value={null} onChange={noop} label="Stay" {...props} />
  ),
  getControl: trigger,
});

describe('DateRangeInput FR10 details', () => {
  it('points the label at the trigger when the caller sets id', () => {
    render(
      <DateRangeInput value={null} onChange={noop} label="Stay" id="stay" />,
    );
    expect(trigger().id).toBe('stay');
    expect(document.querySelector('label[for="stay"]')).not.toBeNull();
  });

  it("adds a caller's aria-describedby to the component's own", () => {
    render(
      <DateRangeInput
        value={null}
        onChange={noop}
        label="Stay"
        description="Check-in to check-out"
        aria-describedby="caller-desc"
      />,
    );
    const ids = trigger().getAttribute('aria-describedby')?.split(' ');
    expect(ids).toContain('caller-desc');
    expect(ids?.length).toBeGreaterThan(1);
  });

  it("names the trigger by its label and range, then a caller's aria-labelledby", () => {
    render(
      <>
        <span id="caller-name">Trip dates</span>
        <DateRangeInput
          value={null}
          onChange={noop}
          label="Stay"
          aria-labelledby="caller-name"
        />
      </>,
    );
    const ids = trigger().getAttribute('aria-labelledby')?.split(' ');
    expect(ids?.at(-1)).toBe('caller-name');
    expect(document.getElementById(ids?.[0] ?? '')?.textContent).toMatch(
      /^Stay: /,
    );
  });

  it("uses a caller's aria-label as the trigger's name", () => {
    render(
      <DateRangeInput
        value={null}
        onChange={noop}
        label="Stay"
        aria-label="Trip dates"
      />,
    );
    expect(trigger()).toHaveAttribute('aria-label', 'Trip dates');
  });

  it('keeps control* on the control box in a horizontal-labels FormLayout', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <FormLayout direction="horizontal-labels">
        <DateRangeInput
          value={null}
          onChange={noop}
          label="Stay"
          controlClassName="fr10-control"
        />
      </FormLayout>,
    );
    const box = container.querySelector('.fr10-control');
    expect(box).not.toBeNull();
    expect(box).toContainElement(trigger());
    expect(box).not.toBe(trigger());
    vi.restoreAllMocks();
  });

  it('runs a caller onClick after the trigger opens the calendar', () => {
    const onClick = vi.fn();
    render(
      <DateRangeInput
        value={null}
        onChange={noop}
        label="Stay"
        onClick={onClick}
      />,
    );
    fireEvent.click(trigger());
    expect(onClick).toHaveBeenCalledOnce();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not let a caller onClick cancel opening the calendar', () => {
    render(
      <DateRangeInput
        value={null}
        onChange={noop}
        label="Stay"
        onClick={event => event.preventDefault()}
      />,
    );
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
