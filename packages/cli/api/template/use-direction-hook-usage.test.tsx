// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useDirection example flips a canvas sparkline's time axis with the
 * provider's locale: the newest point sits on the right for English and on
 * the left for Arabic, because the component reads the direction during
 * render — the one thing CSS logical properties cannot do for canvas.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseDirectionHookUsage from '../../assets/templates/blocks/components/InternationalizationProvider/useDirectionHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

function newestPointX(): number | null {
  const dot = container.querySelector('svg circle');
  if (!dot) return null;
  return Number(dot.getAttribute('cx'));
}

function switchLocale(label: string): void {
  const radios = Array.from(
    container.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const target = radios.find(
    radio =>
      radio.textContent?.includes(label) ||
      radio.getAttribute('aria-label') === label,
  );
  act(() => {
    target?.click();
  });
}

describe('useDirectionHookUsage example', () => {
  it('draws the newest point on the start edge of the current direction', () => {
    root = createRoot(container);
    act(() => root!.render(<UseDirectionHookUsage />));

    // English (ltr): the newest point is the rightmost x of a 280-wide chart.
    const ltrX = newestPointX();
    expect(ltrX).not.toBeNull();
    expect(ltrX!).toBeGreaterThan(250);

    switchLocale('العربية');
    const rtlX = newestPointX();
    expect(rtlX).not.toBeNull();
    // Arabic (rtl): the newest point flips to the left edge.
    expect(rtlX!).toBeLessThan(30);
    expect(rtlX!).toBeLessThan(ltrX!);
  });
});
