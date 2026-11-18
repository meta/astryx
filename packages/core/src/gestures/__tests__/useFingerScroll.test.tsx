// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFingerScroll.test.tsx
 * @input Uses vitest, Testing Library and touch-shaped events through the
 *   document's gesture host
 * @output A finger's scroll reads true until the scroller's scrollend; a
 *   scroll with no finger down reads false; the page's own scroll through
 *   the document; the watch follows the ref's node and ends on unmount, and
 *   lets go of a node it stops following; onEnd runs once per finger scroll
 *   on each end path, for each watcher, and never on unmount
 * @position Unit tests of packages/core/src/gestures/useFingerScroll.ts
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isFingerScroll} from '../fingerScroll';
import {getGestureHost} from '../GestureHost';
import {useFingerScroll} from '../useFingerScroll';
import {coarsePrimaryPointer, pointerQuery} from './pointerQuery';

function touch(type: string, target: Element, down: boolean): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: 5, clientY: 5, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: down ? [entry] : []});
  target.dispatchEvent(event);
}

let read: (at?: number) => boolean = () => false;

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

/** A list that counts its finger scrolls' ends, and what it read then. */
const ends: {count: number; readAtEnd: boolean[]} = {count: 0, readAtEnd: []};

function EndingList({watchers = 1}: {watchers?: number}) {
  const ref = useRef<HTMLDivElement>(null);
  const onEnd = () => {
    ends.count += 1;
    ends.readAtEnd.push(read());
  };
  read = useFingerScroll(ref, {onEnd});
  // The second watcher renders after the list, so the list's ref is set
  // when its attachment runs.
  return (
    <>
      <div ref={ref} data-testid="list">
        <p data-testid="row">row</p>
      </div>
      {watchers > 1 && <SecondWatcher scroller={ref} onEnd={onEnd} />}
    </>
  );
}

function SecondWatcher({
  scroller,
  onEnd,
}: {
  scroller: {current: Element | null};
  onEnd: () => void;
}) {
  useFingerScroll(scroller, {onEnd});
  return null;
}

function Page() {
  read = useFingerScroll(document);
  return <p data-testid="row">row</p>;
}

const pageRef: {current: Document | null} = {current: document};

function PageThroughRef() {
  read = useFingerScroll(pageRef);
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

  it("reads a time inside a finger's scroll as the finger's after it ends, and a program scroll right after as the program's", () => {
    const now = vi.spyOn(window.performance, 'now').mockReturnValue(100);
    try {
      const {getByTestId} = render(<List />);
      const list = getByTestId('list');
      const row = getByTestId('row');
      touch('touchstart', row, true);
      now.mockReturnValue(120);
      list.dispatchEvent(new Event('scroll'));
      now.mockReturnValue(150);
      touch('touchend', row, false);
      now.mockReturnValue(200);
      list.dispatchEvent(new Event('scrollend'));
      expect(read()).toBe(false);
      expect(read(99)).toBe(false);
      expect(read(130)).toBe(true);
      expect(read(200)).toBe(true);
      // The program scrolls right after: the observer records it later.
      now.mockReturnValue(210);
      list.dispatchEvent(new Event('scroll'));
      expect(read()).toBe(false);
      expect(read(216)).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("keeps a scroll that ended under the resting finger the finger's at any time up to the lift", () => {
    const now = vi.spyOn(window.performance, 'now').mockReturnValue(100);
    try {
      const {getByTestId} = render(<List />);
      const list = getByTestId('list');
      const row = getByTestId('row');
      touch('touchstart', row, true);
      now.mockReturnValue(110);
      list.dispatchEvent(new Event('scroll'));
      now.mockReturnValue(120);
      list.dispatchEvent(new Event('scrollend'));
      expect(read(115)).toBe(true);
      now.mockReturnValue(300);
      touch('touchend', row, false);
      expect(read()).toBe(false);
      expect(read(250)).toBe(true);
      expect(read(301)).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("reads a scroll the program drives with no finger as the program's at any time", () => {
    const now = vi.spyOn(window.performance, 'now').mockReturnValue(100);
    try {
      const {getByTestId} = render(<List />);
      getByTestId('list').dispatchEvent(new Event('scroll'));
      expect(read(100)).toBe(false);
      expect(read(50)).toBe(false);
    } finally {
      now.mockRestore();
    }
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

  it('reads the page’s own scroll through a ref that names the document', () => {
    const {getByTestId} = render(<PageThroughRef />);
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

  describe('onEnd', () => {
    beforeEach(() => {
      ends.count = 0;
      ends.readAtEnd = [];
    });

    it("runs once at the scroller's scrollend after the lift, with the reader already false", () => {
      const {getByTestId} = render(<EndingList />);
      const list = getByTestId('list');
      fingerScroll(list, getByTestId('row'));
      touch('touchend', getByTestId('row'), false);
      list.dispatchEvent(new Event('scroll'));
      expect(ends.count).toBe(0);
      list.dispatchEvent(new Event('scrollend'));
      expect(ends.count).toBe(1);
      expect(ends.readAtEnd).toEqual([false]);
      list.dispatchEvent(new Event('scrollend'));
      expect(ends.count).toBe(1);
    });

    it('runs at the lift when the scroll ended under a resting finger', () => {
      const {getByTestId} = render(<EndingList />);
      const list = getByTestId('list');
      fingerScroll(list, getByTestId('row'));
      list.dispatchEvent(new Event('scrollend'));
      expect(ends.count).toBe(0);
      touch('touchend', getByTestId('row'), false);
      expect(ends.count).toBe(1);
    });

    it('runs after the quiet fallback where the browser fires no scrollend', () => {
      // A browser with no scrollend (mobile Safari before 26): take jsdom's
      // handler slot away for this test.
      let owner: object | null = window;
      while (owner != null && !Object.hasOwn(owner, 'onscrollend')) {
        owner = Object.getPrototypeOf(owner) as object | null;
      }
      const slot =
        owner == null
          ? undefined
          : Object.getOwnPropertyDescriptor(owner, 'onscrollend');
      if (owner != null) {
        delete (owner as Record<string, unknown>).onscrollend;
      }
      vi.useFakeTimers();
      try {
        expect('onscrollend' in window).toBe(false);
        const {getByTestId} = render(<EndingList />);
        const list = getByTestId('list');
        fingerScroll(list, getByTestId('row'));
        touch('touchend', getByTestId('row'), false);
        vi.advanceTimersByTime(149);
        expect(ends.count).toBe(0);
        vi.advanceTimersByTime(1);
        expect(ends.count).toBe(1);
        expect(ends.readAtEnd).toEqual([false]);
      } finally {
        vi.useRealTimers();
        if (owner != null && slot != null) {
          Object.defineProperty(owner, 'onscrollend', slot);
        }
      }
    });

    it('runs when the primary pointer stops being coarse mid-scroll', () => {
      restorePointer();
      const pointer = pointerQuery(true);
      restorePointer = pointer.restore;
      const {getByTestId} = render(<EndingList />);
      fingerScroll(getByTestId('list'), getByTestId('row'));
      pointer.set(false);
      expect(ends.count).toBe(1);
      expect(ends.readAtEnd).toEqual([false]);
      touch('touchend', getByTestId('row'), false);
    });

    it('gives two watchers of one scroller one call each per finger scroll', () => {
      const {getByTestId} = render(<EndingList watchers={2} />);
      const list = getByTestId('list');
      fingerScroll(list, getByTestId('row'));
      lift(list, getByTestId('row'));
      expect(ends.count).toBe(2);
      fingerScroll(list, getByTestId('row'));
      lift(list, getByTestId('row'));
      expect(ends.count).toBe(4);
    });

    it('does not run on unmount, even mid-scroll', () => {
      const {getByTestId, unmount} = render(<EndingList />);
      const row = getByTestId('row');
      fingerScroll(getByTestId('list'), row);
      unmount();
      expect(ends.count).toBe(0);
      touch('touchend', row, false);
      expect(ends.count).toBe(0);
    });
  });
});
