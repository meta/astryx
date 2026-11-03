// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useKeyboardHeight.test.tsx
 * @input vitest, @testing-library/react, useKeyboardHeight
 * @output jsdom coverage of lab's keyboard listener: FR2's measurement on a
 *   visual-viewport resize where the keyboard covers the page; nothing while
 *   disabled; where the browser also reports the keyboard itself (Chrome on
 *   Android), FR2's measurement there too, the browser's report ignored and
 *   the app's own overlay setting never changed (spec:AST-099 DEC-2, DEC-4)
 * @position Testing; validates useKeyboardHeight.ts without a browser
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useRef} from 'react';
import {act, render, screen} from '@testing-library/react';
import {
  keyboardCoversPage,
  keyboardInsetOf,
  useKeyboardHeight,
} from './useKeyboardHeight';

function Probe({enabled = true}: {enabled?: boolean}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const height = useKeyboardHeight(enabled, rootRef);
  return (
    <>
      <div ref={rootRef}>
        <input aria-label="Query" />
        <input aria-label="Second" />
        <button type="button">Cancel</button>
      </div>
      <input aria-label="Elsewhere" />
      <output data-testid="height">{height}</output>
    </>
  );
}

const height = () => Number(screen.getByTestId('height').textContent);
const field = (name: string) => screen.getByRole('textbox', {name});

/** A visual viewport the test shrinks from the bottom, as Mobile Safari does. */
function stubVisualViewport() {
  const viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    scale: 1,
  });
  vi.stubGlobal('visualViewport', viewport);
  return (cover: number) =>
    act(() => {
      viewport.height = window.innerHeight - cover;
      viewport.dispatchEvent(new Event('resize'));
    });
}

/** Chrome on Android's own keyboard report. */
function stubVirtualKeyboard({overlaysContent = false} = {}) {
  const keyboard = Object.assign(new EventTarget(), {
    overlaysContent,
    boundingRect: new DOMRect(0, 0, 0, 0),
  });
  Object.defineProperty(navigator, 'virtualKeyboard', {
    configurable: true,
    value: keyboard,
  });
  const report = (cover: number) =>
    act(() => {
      keyboard.boundingRect = new DOMRect(
        0,
        window.innerHeight - cover,
        window.innerWidth,
        cover,
      );
      keyboard.dispatchEvent(new Event('geometrychange'));
    });
  return {keyboard, report};
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'virtualKeyboard');
  vi.unstubAllGlobals();
});

describe('useKeyboardHeight', () => {
  it('reads FR2’s height on each visual-viewport resize where the keyboard covers the page', () => {
    const keyboard = stubVisualViewport();
    render(<Probe />);
    expect(height()).toBe(0);
    keyboard(300);
    expect(height()).toBe(300);
    keyboard(0);
    expect(height()).toBe(0);
  });

  it('reads nothing while disabled', () => {
    const keyboard = stubVisualViewport();
    render(<Probe enabled={false} />);
    keyboard(300);
    expect(height()).toBe(0);
  });

  describe('where the browser also reports the keyboard itself (Chrome on Android)', () => {
    it('reads FR2’s height from the visual viewport there too, and never takes over the app’s keyboard setting (spec:AST-099 DEC-2, DEC-4)', () => {
      const {keyboard, report} = stubVirtualKeyboard();
      const resize = stubVisualViewport();
      render(<Probe />);
      act(() => field('Query').focus());
      expect(keyboard.overlaysContent).toBe(false);
      resize(300);
      expect(height()).toBe(300);
      // The browser's own report is not the measure.
      report(200);
      expect(height()).toBe(300);
      act(() => field('Query').blur());
      resize(0);
      expect(height()).toBe(0);
      expect(keyboard.overlaysContent).toBe(false);
    });

    it('leaves an app’s own overlay setting as the app set it', () => {
      const {keyboard} = stubVirtualKeyboard({overlaysContent: true});
      stubVisualViewport();
      const {unmount} = render(<Probe />);
      act(() => field('Query').focus());
      expect(keyboard.overlaysContent).toBe(true);
      unmount();
      expect(keyboard.overlaysContent).toBe(true);
    });

    it('counts the keyboard as covering the page, as in Safari (spec:AST-099 FR6)', () => {
      stubVirtualKeyboard();
      const resize = stubVisualViewport();
      expect(keyboardCoversPage(window)).toBe(true);
      resize(300);
      expect(keyboardInsetOf(window)).toBe(300);
    });
  });
});
