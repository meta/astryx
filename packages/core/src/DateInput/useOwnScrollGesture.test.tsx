// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useOwnScrollGesture.test.tsx
 * @input useOwnScrollGesture's `'pager'` mode on an element under the body
 * @output Which touch and pointer moves reach the element's ancestors
 * @position Unit tests beside useOwnScrollGesture.ts; the sheet cases sit in
 *   DateInputTouch.test.tsx
 */

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it} from 'vitest';

import {useOwnScrollGesture} from './useOwnScrollGesture';

function Pager() {
  const ref = useRef<HTMLDivElement>(null);
  useOwnScrollGesture(ref, 'pager');
  return <div data-testid="pager" ref={ref} />;
}

/** The event types that reach the body, in order. */
function watchBody(): {seen: string[]; stop: () => void} {
  const seen: string[] = [];
  const types = ['touchstart', 'touchmove', 'pointerdown', 'pointermove'];
  const listener = (event: Event) => seen.push(event.type);
  for (const type of types) {
    document.body.addEventListener(type, listener);
  }
  return {
    seen,
    stop: () => {
      for (const type of types) {
        document.body.removeEventListener(type, listener);
      }
    },
  };
}

/** jsdom has no constructible `TouchEvent`; this one carries its lists. */
function touch(el: Element, type: string, at: {x: number; y: number}) {
  const event = new Event(type, {bubbles: true});
  const point = {identifier: 1, clientX: at.x, clientY: at.y, target: el};
  const touches = type === 'touchend' ? [] : [point];
  Object.defineProperties(event, {
    changedTouches: {value: [point]},
    touches: {value: touches},
    targetTouches: {value: touches},
  });
  el.dispatchEvent(event);
}

const ORIGIN = {x: 150, y: 200};

/** A touch from `ORIGIN` through `moves` (offsets from it), then the lift. */
function dragThrough(
  el: Element,
  moves: ReadonlyArray<readonly [number, number]>,
) {
  touch(el, 'touchstart', ORIGIN);
  for (const [dx, dy] of moves) {
    touch(el, 'touchmove', {x: ORIGIN.x + dx, y: ORIGIN.y + dy});
  }
  touch(el, 'touchend', ORIGIN);
}

describe("useOwnScrollGesture's 'pager'", () => {
  afterEach(cleanup);

  it('holds a touch’s moves from the sheet until it has travelled 10 px either way', () => {
    render(<Pager />);
    const pager = screen.getByTestId('pager');
    const body = watchBody();
    touch(pager, 'touchstart', ORIGIN);
    touch(pager, 'touchmove', {x: ORIGIN.x - 5, y: ORIGIN.y + 6});
    touch(pager, 'touchmove', {x: ORIGIN.x - 7, y: ORIGIN.y + 8.5});
    expect(body.seen).toEqual(['touchstart']);
    // The vertical travel reaches 10 px first: the sheet's from this move.
    touch(pager, 'touchmove', {x: ORIGIN.x - 8, y: ORIGIN.y + 10.3});
    expect(body.seen).toEqual(['touchstart', 'touchmove']);
    body.stop();
  });

  /** UIKit's own first samples past the threshold, in a sheet. */
  it.each([
    [10, 11, 'pager'],
    [10.7, 12.7, 'pager'],
    [9.7, 11.3, 'sheet'],
    [8, 10.3, 'sheet'],
  ] as const)(
    'a first move past 10 px at (%f, %f) makes the drag the %s’s',
    (dx, dy, owner) => {
      render(<Pager />);
      const pager = screen.getByTestId('pager');
      const body = watchBody();
      dragThrough(pager, [
        [-dx, dy],
        [-dx * 2, dy * 2],
      ]);
      expect(body.seen.includes('touchmove')).toBe(owner === 'sheet');
      body.stop();
    },
  );

  it('decides a touch pointer’s moves the same way and passes a mouse’s', () => {
    render(<Pager />);
    const pager = screen.getByTestId('pager');
    const body = watchBody();
    const at = (dx: number, dy: number, pointerType: string) => ({
      pointerId: 1,
      pointerType,
      isPrimary: true,
      clientX: ORIGIN.x + dx,
      clientY: ORIGIN.y + dy,
    });
    fireEvent.pointerDown(pager, at(0, 0, 'touch'));
    fireEvent.pointerMove(pager, at(-5, 6, 'touch'));
    fireEvent.pointerMove(pager, at(-12, 4, 'touch'));
    expect(body.seen).toEqual(['pointerdown']);
    fireEvent.pointerMove(pager, at(-20, 4, 'mouse'));
    expect(body.seen).toEqual(['pointerdown', 'pointermove']);
    body.stop();
  });
});
