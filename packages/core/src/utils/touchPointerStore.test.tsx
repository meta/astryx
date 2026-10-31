// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPointerStore.test.tsx
 * @input vitest, React Testing Library and a window.matchMedia stub
 * @output Holds the shared touch-pointer store to one live `change` listener
 *   for any number of readers, none after the last reader unmounts, and every
 *   reader following a change of the primary pointer
 * @position Testing; unit layer of utils/touchPointerStore.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {useIsTouchPointer} from './touchPointerStore';

function Reader({name}: {name: string}) {
  const isTouch = useIsTouchPointer();
  return <span data-testid={name}>{isTouch ? 'touch' : 'pointer'}</span>;
}

/** A touch query whose answer the test sets, counting its live listeners. */
function stubTouchQuery(initial: boolean) {
  let matches = initial;
  const handlers = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('pointer: coarse') ? matches : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, handler: () => void) => {
        if (query.includes('pointer: coarse')) {
          handlers.add(handler);
        }
      },
      removeEventListener: (_type: string, handler: () => void) => {
        handlers.delete(handler);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
  return {
    live: () => handlers.size,
    change: (next: boolean) => {
      matches = next;
      for (const handler of Array.from(handlers)) {
        handler();
      }
    },
  };
}

describe('useIsTouchPointer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds one listener for every reader and none after the last unmounts', () => {
    const query = stubTouchQuery(false);
    const {unmount} = render(
      <>
        <Reader name="a" />
        <Reader name="b" />
        <Reader name="c" />
      </>,
    );
    expect(query.live()).toBe(1);
    unmount();
    expect(query.live()).toBe(0);
  });

  it('moves every reader when the primary pointer changes', () => {
    const query = stubTouchQuery(false);
    render(
      <>
        <Reader name="a" />
        <Reader name="b" />
      </>,
    );
    expect(screen.getByTestId('a')).toHaveTextContent('pointer');
    expect(screen.getByTestId('b')).toHaveTextContent('pointer');
    act(() => query.change(true));
    expect(screen.getByTestId('a')).toHaveTextContent('touch');
    expect(screen.getByTestId('b')).toHaveTextContent('touch');
  });

  it('answers a coarse primary pointer on the first client render', () => {
    stubTouchQuery(true);
    render(<Reader name="a" />);
    expect(screen.getByTestId('a')).toHaveTextContent('touch');
  });
});
