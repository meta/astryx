// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFingerScroll.test.tsx
 * @input Uses vitest, Testing Library and touch-shaped events through the
 *   document's gesture host
 * @output A finger's scroll reads true until the scroller's scrollend; a
 *   scroll with no finger down reads false; the page's own scroll through
 *   the document; the watch follows the ref's node and ends on unmount, and
 *   lets go of a node it stops following
 * @position Unit tests of packages/core/src/gestures/useFingerScroll.ts
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {isFingerScroll} from '../fingerScroll';
import {getGestureHost} from '../GestureHost';
import {useFingerScroll} from '../useFingerScroll';
import {coarsePrimaryPointer} from './pointerQuery';

function touch(type: string, target: Element, down: boolean): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: 5, clientY: 5, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: down ? [entry] : []});
  target.dispatchEvent(event);
}

let read: () => boolean = () => false;

function List({other = false}: {other?: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  read = useFingerScroll(ref);
  return other ? (
    <section ref={ref} data-testid="list">
      <p data-testid="row">row</p>
    </section>
  ) : (
    <div ref={ref} data-testid="list">
      <p data-testid="row">row</p>
    </div>
  );
}

/** A scroller the test keeps in the page while the hook moves off it. */
function scroller(): {element: HTMLElement; row: HTMLElement} {
  const element = document.createElement('div');
  const row = document.createElement('p');
  element.append(row);
  document.body.append(element);
  return {element, row};
}

/** A finger scrolling `element` from `row`, left resting. */
function fingerScroll(element: Element, row: Element): void {
  touch('touchstart', row, true);
  element.dispatchEvent(new Event('scroll'));
}

/** The finger lifted and the scroll ended. */
function lift(element: Element, row: Element): void {
  touch('touchend', row, false);
  element.dispatchEvent(new Event('scrollend'));
}

const followed: {current: Element | null} = {current: null};

function Follower() {
  read = useFingerScroll(followed);
  return null;
}

function Page() {
  read = useFingerScroll(document);
  return <p data-testid="row">row</p>;
}

// A phone: the finger-scroll watch listens only where the primary pointer is
// coarse.
let restorePointer: () => void;
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
});
afterEach(() => {
  restorePointer();
});

afterEach(() => {
  read = () => false;
});

describe('useFingerScroll', () => {
  it('is internal: the gestures barrel exports neither the hook nor the watch', async () => {
    const gestures: Record<string, unknown> = await import('../index');
    expect(gestures).not.toHaveProperty('useFingerScroll');
    expect(gestures).not.toHaveProperty('isFingerScroll');
    expect(gestures).not.toHaveProperty('watchFingerScrolls');
  });

  it("reads a finger's scroll until the scroller's scrollend, and the program's as false", () => {
    const {getByTestId} = render(<List />);
    const list = getByTestId('list');
    list.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(false);
    touch('touchstart', getByTestId('row'), true);
    list.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(true);
    // The lift starts the momentum: still the finger's.
    touch('touchend', getByTestId('row'), false);
    list.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(true);
    list.dispatchEvent(new Event('scrollend'));
    expect(read()).toBe(false);
  });

  it("reads a recognizer's own scroll as the program's, even with a finger resting inside", () => {
    const {getByTestId} = render(<List />);
    const list = getByTestId('list');
    touch('touchstart', getByTestId('row'), true);
    // A menu's edge autoscroll under the resting finger.
    getGestureHost(document).ownScroll(list);
    list.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(false);
    touch('touchend', getByTestId('row'), false);
  });

  it('reads the page’s own scroll through the document', () => {
    const {getByTestId} = render(<Page />);
    touch('touchstart', getByTestId('row'), true);
    document.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(true);
    touch('touchend', getByTestId('row'), false);
    document.dispatchEvent(new Event('scrollend'));
    expect(read()).toBe(false);
  });

  it("follows the ref's node, and stops watching on unmount", () => {
    const {getByTestId, rerender, unmount} = render(<List />);
    rerender(<List other />);
    const list = getByTestId('list');
    expect(list.tagName).toBe('SECTION');
    touch('touchstart', getByTestId('row'), true);
    list.dispatchEvent(new Event('scroll'));
    expect(read()).toBe(true);
    touch('touchend', getByTestId('row'), false);
    list.dispatchEvent(new Event('scrollend'));
    const reader = read;
    unmount();
    expect(reader()).toBe(false);
  });

  it('lets go of the node it stops following, and of its last one at unmount', () => {
    const first = scroller();
    const second = scroller();
    const host = getGestureHost(document);
    try {
      followed.current = first.element;
      const {rerender, unmount} = render(<Follower />);
      fingerScroll(first.element, first.row);
      expect(read()).toBe(true);
      lift(first.element, first.row);

      followed.current = second.element;
      rerender(<Follower />);
      // The first scroller is no longer watched: its finger scroll counts
      // for nothing.
      fingerScroll(first.element, first.row);
      expect(isFingerScroll(host, first.element)).toBe(false);
      lift(first.element, first.row);
      fingerScroll(second.element, second.row);
      expect(read()).toBe(true);
      lift(second.element, second.row);

      const reader = read;
      unmount();
      fingerScroll(second.element, second.row);
      expect(isFingerScroll(host, second.element)).toBe(false);
      expect(reader()).toBe(false);
      lift(second.element, second.row);
    } finally {
      followed.current = null;
      first.element.remove();
      second.element.remove();
    }
  });
});
