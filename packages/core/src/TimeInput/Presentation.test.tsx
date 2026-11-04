// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Presentation.test.tsx
 * @input Uses vitest, Testing Library, and TimeInput
 * @output Tests for the `presentation` prop (`spec:AST-043` FR1–FR4)
 * @position Testing; covers surface resolution, fallback split, and precedence
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
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
