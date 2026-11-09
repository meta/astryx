// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Presentation.test.tsx
 * @input Uses vitest, Testing Library, and DateTimeInput
 * @output Tests for the `presentation` prop (`spec:AST-043` FR1–FR4)
 * @position Testing; covers surface resolution and precedence
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {DateTimeInput} from './DateTimeInput';
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

describe('DateTimeInput presentation', () => {
  it('native forces native date and time segments on a fine pointer', () => {
    stubPointer(false);
    render(
      <DateTimeInput label="Event" presentation="native" onChange={() => {}} />,
    );
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    expect(document.querySelector('input[type="time"]')).not.toBeNull();
  });

  it('bottom-sheet forces the sheet field on a fine pointer', () => {
    stubPointer(false);
    render(
      <DateTimeInput
        label="Event"
        presentation="bottom-sheet"
        onChange={() => {}}
      />,
    );
    for (const input of document.querySelectorAll('input[readonly]')) {
      expect(input).toBeInTheDocument();
    }
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelectorAll('input[readonly]').length).toBe(2);
  });

  it('presentation wins over nativePicker (FR4)', () => {
    stubPointer(false);
    render(
      <DateTimeInput
        label="Event"
        presentation="bottom-sheet"
        nativePicker="always"
        onChange={() => {}}
      />,
    );
    // A sheet on a fine pointer can only come from `presentation`: the
    // deprecated `always` alone would have rendered both native controls.
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(document.querySelectorAll('input[readonly]').length).toBe(2);
  });
});
