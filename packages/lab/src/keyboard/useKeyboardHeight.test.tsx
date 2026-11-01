// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useKeyboardHeight.test.tsx
 * @input vitest, @testing-library/react, useKeyboardHeight
 * @output jsdom coverage of lab's keyboard listener: FR2's measurement on a
 *   visual-viewport resize where the keyboard covers the page; nothing while
 *   disabled; where the browser reports the keyboard itself (Chrome on
 *   Android, FR8), the report read while a text control inside the focus
 *   root has focus, the overlay held until the keyboard is reported down
 *   after a blur, kept while focus moves between the root's text controls,
 *   given back at once when focus moves to a text control elsewhere, the
 *   app's own setting restored, and nothing taken for a button
 * @position Testing; validates useKeyboardHeight.ts without a browser
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useRef} from 'react';
import {act, render, screen} from '@testing-library/react';
import {useKeyboardHeight} from './useKeyboardHeight';

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

  describe('where the browser reports the keyboard itself (Chrome on Android)', () => {
    it('reads the report while a text control inside the root has focus, the keyboard overlaying the page meanwhile', () => {
      const {keyboard, report} = stubVirtualKeyboard();
      const resize = stubVisualViewport();
      render(<Probe />);
      expect(keyboard.overlaysContent).toBe(false);
      act(() => field('Query').focus());
      expect(keyboard.overlaysContent).toBe(true);
      report(300);
      expect(height()).toBe(300);
      // The visual viewport is not the measure there.
      resize(100);
      expect(height()).toBe(300);
    });

    it('holds the overlay after the blur until Chrome reports the keyboard down', () => {
      const {keyboard, report} = stubVirtualKeyboard();
      render(<Probe />);
      act(() => field('Query').focus());
      report(300);
      // A tap on the cancel button beside it: the surface keeps its place.
      act(() => screen.getByRole('button', {name: 'Cancel'}).focus());
      expect(keyboard.overlaysContent).toBe(true);
      expect(height()).toBe(300);
      report(0);
      expect(keyboard.overlaysContent).toBe(false);
      expect(height()).toBe(0);
    });

    it('keeps the overlay while focus moves between the root’s text controls', () => {
      const {keyboard, report} = stubVirtualKeyboard();
      render(<Probe />);
      act(() => field('Query').focus());
      report(300);
      act(() => field('Second').focus());
      expect(keyboard.overlaysContent).toBe(true);
      expect(height()).toBe(300);
    });

    it('gives the overlay back at once when focus moves to a text control elsewhere', () => {
      const {keyboard, report} = stubVirtualKeyboard();
      render(<Probe />);
      act(() => field('Query').focus());
      report(300);
      act(() => field('Elsewhere').focus());
      expect(keyboard.overlaysContent).toBe(false);
      expect(height()).toBe(0);
      // Its keyboard is the app's: reports no longer move the surface.
      report(280);
      expect(height()).toBe(0);
    });

    it('restores the app’s own setting', () => {
      const {keyboard, report} = stubVirtualKeyboard({overlaysContent: true});
      const {unmount} = render(<Probe />);
      act(() => field('Query').focus());
      report(300);
      act(() => field('Query').blur());
      report(0);
      expect(keyboard.overlaysContent).toBe(true);
      unmount();
      expect(keyboard.overlaysContent).toBe(true);
    });

    it('gives the overlay back on unmount', () => {
      const {keyboard} = stubVirtualKeyboard();
      const {unmount} = render(<Probe />);
      act(() => field('Query').focus());
      expect(keyboard.overlaysContent).toBe(true);
      unmount();
      expect(keyboard.overlaysContent).toBe(false);
    });

    it('takes nothing for a control that brings up no keyboard', () => {
      const {keyboard} = stubVirtualKeyboard();
      render(<Probe />);
      act(() => screen.getByRole('button', {name: 'Cancel'}).focus());
      expect(keyboard.overlaysContent).toBe(false);
    });
  });
});
