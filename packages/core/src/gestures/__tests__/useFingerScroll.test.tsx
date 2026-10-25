// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFingerScroll.test.tsx
 * @input Uses vitest, Testing Library and touch-shaped events through the
 *   document's gesture host
 * @output A finger's scroll reads true until the scroller's scrollend; a
 *   scroll with no finger down reads false; the page's own scroll through
 *   the document; the watch follows the ref's node and ends on unmount
 * @position Unit tests of packages/core/src/gestures/useFingerScroll.ts
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {useFingerScroll} from '../useFingerScroll';

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

function Page() {
  read = useFingerScroll(document);
  return <p data-testid="row">row</p>;
}

afterEach(() => {
  read = () => false;
});

describe('useFingerScroll', () => {
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
});
