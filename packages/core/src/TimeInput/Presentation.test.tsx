// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Presentation.test.tsx
 * @input Uses vitest, Testing Library, and TimeInput
 * @output Tests for the `presentation` prop (`spec:AST-043` FR1–FR4)
 * @position Testing; covers surface resolution, fallback split, and precedence
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {TimeInput} from './TimeInput';
import {InternationalizationProvider} from '../i18n';
import type {ISOTimeString} from '../utils';
import {resetDateSegmentProbe} from '../DateInput/nativeDateSegments';

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubPointer(isCoarse: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /pointer:\s*coarse/.test(query)
      ? isCoarse
      : /pointer:\s*fine/.test(query)
        ? !isCoarse
        : HOVER_CAPABLE.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
}

beforeAll(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

describe('TimeInput presentation', () => {
  it('text-input renders the typed field on both pointers', () => {
    for (const isCoarse of [false, true]) {
      stubPointer(isCoarse);
      const {unmount} = render(
        <TimeInput
          label="Start"
          presentation="text-input"
          onChange={() => {}}
        />,
      );
      const input = screen.getByRole('textbox', {name: 'Start'});
      expect(input).toHaveAttribute('type', 'text');
      expect(input).not.toHaveAttribute('readonly');
      expect(document.querySelector('input[type="time"]')).toBeNull();
      unmount();
    }
  });

  it("bottom-sheet follows the locale's hour cycle in its text and wheels", () => {
    stubPointer(false);
    render(
      <InternationalizationProvider locale="de-DE">
        <TimeInput
          label="Start"
          presentation="bottom-sheet"
          value={'14:30' as ISOTimeString}
          onChange={() => {}}
        />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox', {name: 'Start'});
    expect(input).toHaveValue('14:30');
    fireEvent.click(input);
    expect(screen.getByRole('listbox', {name: 'Hour'})).toBeInTheDocument();
    expect(screen.queryByRole('listbox', {name: 'AM/PM'})).toBeNull();
  });

  it('bottom-sheet renders the sheet field even on a fine pointer', () => {
    stubPointer(false);
    render(
      <TimeInput
        label="Start"
        presentation="bottom-sheet"
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox', {name: 'Start'});
    expect(input).toHaveAttribute('readonly');
    fireEvent.click(input);
    expect(screen.getByRole('listbox', {name: 'Hour'})).toBeInTheDocument();
    expect(screen.getByRole('listbox', {name: 'Minute'})).toBeInTheDocument();
  });

  it('bottom-sheet: a disabled field stays focusable and inert (AST-085 FR1, FR2)', () => {
    stubPointer(false);
    const onClick = vi.fn();
    render(
      <TimeInput
        label="Start"
        presentation="bottom-sheet"
        isDisabled
        onClick={onClick}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox', {name: 'Start'});
    expect(input).not.toHaveAttribute('disabled');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', {name: 'Hour'})).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('adaptive-bottom-sheet: typed on fine, sheet on coarse', () => {
    stubPointer(false);
    const {unmount} = render(
      <TimeInput
        label="Start"
        presentation="adaptive-bottom-sheet"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('textbox', {name: 'Start'})).not.toHaveAttribute(
      'readonly',
    );
    unmount();

    stubPointer(true);
    render(
      <TimeInput
        label="Start"
        presentation="adaptive-bottom-sheet"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', {name: 'Start'})).toHaveAttribute(
      'readonly',
    );
  });

  it('deprecated nativePicker="never" maps to text-input, not a sheet (FR3)', () => {
    stubPointer(true);
    render(
      <TimeInput label="Start" nativePicker="never" onChange={() => {}} />,
    );
    const input = screen.getByRole('textbox', {name: 'Start'});
    expect(input).not.toHaveAttribute('readonly');
  });

  it('presentation wins over nativePicker (FR4)', () => {
    stubPointer(false);
    render(
      <TimeInput
        label="Start"
        presentation="text-input"
        nativePicker="always"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('textbox', {name: 'Start'})).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });
});

// A 12-hour sheet wheel bounded 12:00–17:00: its rows are 1 … 12, and 6 to 11
// are disabled. Keys follow the full time, so 12 PM comes before 1 PM.
describe('sheet wheel keys at a 12:00–17:00 bound (component:DateInput FR17)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function openHourWheel(value: string) {
    const onChange = vi.fn();
    const view = render(
      <TimeInput
        label="Start"
        presentation="bottom-sheet"
        hourFormat="12h"
        min={'12:00' as ISOTimeString}
        max={'17:00' as ISOTimeString}
        value={value as ISOTimeString}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', {name: 'Start'}));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    return {hour: screen.getByRole('listbox', {name: 'Hour'}), onChange, view};
  }

  for (const pointer of ['finger', 'mouse'] as const) {
    it(`at a 12:00–17:00 bound, ArrowDown from 5 PM commits nothing and ArrowDown from 12 PM commits 1 PM, under a ${pointer}`, () => {
      vi.useFakeTimers();
      stubPointer(pointer === 'finger');
      // No enabled hour comes after 5 PM: ArrowDown and End commit nothing.
      const late = openHourWheel('17:00');
      fireEvent.keyDown(late.hour, {key: 'ArrowDown'});
      fireEvent.keyDown(late.hour, {key: 'End'});
      expect(late.onChange).not.toHaveBeenCalled();
      late.view.unmount();
      // 1 PM is the hour after 12 PM.
      const noon = openHourWheel('12:00');
      fireEvent.keyDown(noon.hour, {key: 'ArrowDown'});
      expect(noon.onChange).toHaveBeenLastCalledWith('13:00');
      noon.view.unmount();
      // 12 PM is the hour before 1 PM, and the first enabled one.
      const early = openHourWheel('13:00');
      fireEvent.keyDown(early.hour, {key: 'ArrowUp'});
      expect(early.onChange).toHaveBeenLastCalledWith('12:00');
      early.view.unmount();
      const first = openHourWheel('13:00');
      fireEvent.keyDown(first.hour, {key: 'Home'});
      expect(first.onChange).toHaveBeenLastCalledWith('12:00');
    });
  }
});
