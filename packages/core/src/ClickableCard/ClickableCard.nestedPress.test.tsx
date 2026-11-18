// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ClickableCard.nestedPress.test.tsx
 * @input vitest (jsdom), React Testing Library, ClickableCard, InfoTip, the
 *   press controller
 * @output Checks that a ClickableCard shows its pressed state only for a press
 *   that would activate it: a press that starts on an interactive element
 *   inside the card (an InfoTip, a button, a link) paints no press on the
 *   card for a finger; a press on the card's own surface still paints. A
 *   mouse press keeps its `:active` paint (checked in a real browser)
 * @position Testing; validates useClickableContainer's pointerdown callback
 *   through ClickableCard
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {InfoTip} from '../InfoTip/InfoTip';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {ClickableCard} from './ClickableCard';

function Card(props: {onPointerDown?: () => void}) {
  return (
    <ClickableCard
      label="Open billing"
      onClick={() => {}}
      onPointerDown={props.onPointerDown}>
      <span>Billing summary</span>
      <InfoTip content="Billed monthly" label="About billing" />
      <button type="button">Plain button</button>
      <a href="#details">Details link</a>
    </ClickableCard>
  );
}

function cardOf(element: Element): HTMLElement {
  const card = element.closest('[data-pressable-container]');
  if (!(card instanceof HTMLElement)) {
    throw new Error('no clickable card around the element');
  }
  return card;
}

function pointer(
  element: Element,
  type: 'pointerDown' | 'pointerUp',
  pointerType: 'touch',
) {
  fireEvent[type](element, {pointerType, pointerId: 1, button: 0});
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const nestedTargets = [
  ['an InfoTip', () => screen.getByRole('button', {name: 'About billing'})],
  ['a button', () => screen.getByRole('button', {name: 'Plain button'})],
  ['a link', () => screen.getByRole('link', {name: 'Details link'})],
] as const;

describe('a press that starts on an interactive element inside the card', () => {
  for (const [name, target] of nestedTargets) {
    it(`shows no press on the card for a finger on ${name}`, () => {
      render(<Card />);
      const element = target();
      pointer(element, 'pointerDown', 'touch');
      act(() => {
        vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
      });
      expect(cardOf(element).hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      pointer(element, 'pointerUp', 'touch');
    });
  }
});

describe("a press on the card's own surface", () => {
  it('paints the press for a finger', () => {
    render(<Card />);
    const surface = screen.getByText('Billing summary');
    pointer(surface, 'pointerDown', 'touch');
    act(() => {
      vi.advanceTimersByTime(PRESS_ONSET_MS);
    });
    expect(cardOf(surface).getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    pointer(surface, 'pointerUp', 'touch');
  });
});

it("calls the caller's onPointerDown beside the card's own", () => {
  const onPointerDown = vi.fn();
  render(<Card onPointerDown={onPointerDown} />);
  const element = screen.getByRole('button', {name: 'Plain button'});
  pointer(element, 'pointerDown', 'touch');
  act(() => {
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
  });
  expect(onPointerDown).toHaveBeenCalledTimes(1);
  expect(cardOf(element).hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  pointer(element, 'pointerUp', 'touch');
});
