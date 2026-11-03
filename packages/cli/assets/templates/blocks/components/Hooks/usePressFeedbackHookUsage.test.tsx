// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The usePressFeedback example applies the hook's output to the Astryx Card
 * itself, with no wrapper: the marker lands on the Card's root, the press
 * controller paints that root, the shared focus ring marks keyboard focus on
 * it, and a click, Enter or Space flips the card. This is also a
 * compatibility check that Card passes through what the hook returns.
 */

import * as stylex from '@stylexjs/stylex';
import {act, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import UsePressFeedbackHookUsage from './usePressFeedbackHookUsage';

// The docs-only card is not what this checks; stand it in with a plain
// element so the test needs no StyleX compilation.
vi.mock('@astryx-docs/demo-content', () => ({
  DemoHint: ({children}: {children: ReactNode}) => children,
  PlayingCardContents: ({faceDown}: {faceDown?: boolean}) => (
    <span>{faceDown === true ? 'back' : 'face'}</span>
  ),
}));

const PRESS_ONSET_MS = 150;

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

/** Render the example and return its Card root, found by its button role. */
function renderCard(): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UsePressFeedbackHookUsage />);
  });
  const card = container.querySelector<HTMLElement>(
    '[role="button"][aria-label="Flip card"]',
  );
  if (card == null) {
    throw new Error('no "Flip card" button rendered');
  }
  return card;
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

/** A touch pointer event the press controller reads. */
function touch(element: Element, type: string): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    pointerType: 'touch',
  });
  element.dispatchEvent(event);
}

describe('usePressFeedback example', () => {
  it('puts the pressable marker and the button semantics on the Card root', () => {
    const card = renderCard();
    expect(container.firstElementChild).toBe(card);
    expect(card.className).toMatch(/astryx-card/u);
    expect(card.hasAttribute('data-astryx-pressable')).toBe(true);
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('paints a believed touch press on the Card root', () => {
    vi.useFakeTimers();
    const card = renderCard();
    act(() => {
      touch(card, 'pointerdown');
      vi.advanceTimersByTime(PRESS_ONSET_MS);
    });
    expect(card.getAttribute('data-astryx-press')).toBe('on');
  });

  it('paints the shared focus ring on the Card root for keyboard focus', () => {
    const card = renderCard();
    const ringClasses = stylex
      .props(focusOutlineStyles.focusVisible)
      .className?.split(' ');
    expect(ringClasses?.length).toBeGreaterThan(0);
    const cardClasses = card.className.split(' ');
    for (const ringClass of ringClasses ?? []) {
      expect(cardClasses).toContain(ringClass);
    }
    act(() => card.focus());
    expect(document.activeElement).toBe(card);
  });

  it('flips on a click, Enter and Space', () => {
    const card = renderCard();
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(card.textContent).toBe('face');
    act(() => card.click());
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.textContent).toBe('back');
    act(() => {
      card.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}),
      );
    });
    expect(card.textContent).toBe('face');
    act(() => {
      card.dispatchEvent(
        new KeyboardEvent('keydown', {key: ' ', bubbles: true}),
      );
    });
    expect(card.textContent).toBe('back');
  });
});
