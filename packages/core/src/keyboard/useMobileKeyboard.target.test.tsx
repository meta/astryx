// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useMobileKeyboard.target.test.tsx
 * @input useMobileKeyboard on a field, a stand-in visual viewport and a
 *   pointer query that changes
 * @output Proves a field's keyboard path follows the primary pointer: a
 *   docked mouse drops the tap route, and a finger brings it back. Also
 *   proves the hook reads its committed options: after a render React
 *   discards, and in a commit where an earlier sibling blurs the field
 * @position Keyboard module tests
 */

import {
  Suspense,
  startTransition,
  use,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {__resetLayoutViewportForTest} from '../utils/layoutViewport';
import {useMobileKeyboard} from './useMobileKeyboard';

let isCoarse = true;
const listeners = new Set<() => void>();

function Field() {
  const ref = useRef<HTMLInputElement | null>(null);
  useMobileKeyboard(ref);
  return <input ref={ref} aria-label="Name" />;
}

beforeEach(() => {
  isCoarse = true;
  // The page scrolls, so a field in it takes the field path's reveal.
  const page = document.scrollingElement ?? document.documentElement;
  Object.defineProperty(page, 'scrollHeight', {
    configurable: true,
    value: 3000,
  });
  Object.defineProperty(page, 'clientHeight', {
    configurable: true,
    value: window.innerHeight,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    }),
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('pointer: coarse') ? isCoarse : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  listeners.clear();
  const page = document.scrollingElement ?? document.documentElement;
  Reflect.deleteProperty(page, 'scrollHeight');
  Reflect.deleteProperty(page, 'clientHeight');
  Reflect.deleteProperty(window, 'visualViewport');
  __resetLayoutViewportForTest();
  vi.unstubAllGlobals();
});

// Whether a one-finger tap on `element` had its default cancelled.
function tapIsClaimed(element: HTMLElement): boolean {
  const touch = (type: string) => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const point = {identifier: 0, clientX: 20, clientY: 10};
    Object.assign(event, {
      touches: type === 'touchend' ? [] : [point],
      changedTouches: [point],
    });
    return event;
  };
  act(() => {
    element.dispatchEvent(touch('touchstart'));
  });
  const end = touch('touchend');
  act(() => {
    element.dispatchEvent(end);
  });
  return end.defaultPrevented;
}

function pointerChanges(coarse: boolean) {
  isCoarse = coarse;
  act(() => {
    for (const listener of [...listeners]) {
      listener();
    }
  });
}

it('drops the tap route when a mouse becomes the primary pointer, and takes it back for a finger', () => {
  render(<Field />);
  const input = screen.getByRole('textbox');
  expect(tapIsClaimed(input)).toBe(true);
  act(() => input.blur());

  pointerChanges(false);
  expect(tapIsClaimed(input)).toBe(false);

  pointerChanges(true);
  expect(tapIsClaimed(input)).toBe(true);
});

// A transition that suspends for good: React renders it, then keeps the
// committed tree and never commits that render.
const forever = new Promise<never>(() => {});
function Forever(): null {
  use(forever);
  return null;
}
function Discardable({
  children,
  isPending = false,
}: {
  children: ReactNode;
  isPending?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      {children}
      {isPending ? <Forever /> : null}
    </Suspense>
  );
}

it('dismisses by the committed options after React discards a render that disables it', async () => {
  let dismiss: (() => void) | null = null;
  function Panel({isEnabled}: {isEnabled: boolean}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const keyboard = useMobileKeyboard(ref, {isEnabled});
    dismiss = () => keyboard.dismiss();
    return (
      <div ref={ref}>
        <input aria-label="Name" />
      </div>
    );
  }
  const {rerender} = render(
    <Discardable>
      <Panel isEnabled />
    </Discardable>,
  );
  const input = screen.getByRole('textbox');
  act(() => input.focus());
  await act(async () => {
    startTransition(() => {
      rerender(
        <Discardable isPending>
          <Panel isEnabled={false} />
        </Discardable>,
      );
    });
  });

  act(() => dismiss?.());

  // The committed keyboard is enabled, so the dismissal blurs the field.
  expect(input).not.toHaveFocus();
});

it('parks no focus on a target that closes in the commit where an earlier sibling blurs its field', () => {
  // An earlier sibling's layout effect runs before the target's own layout
  // effects. It blurs the field as the flow closes the target.
  function Blurrer({isClosing}: {isClosing: boolean}) {
    useLayoutEffect(() => {
      if (isClosing) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }, [isClosing]);
    return null;
  }
  // A sheet that reserves the keyboard's inset, with its scrolling body.
  function Panel({isOpen}: {isOpen: boolean}) {
    const ref = useRef<HTMLDivElement | null>(null);
    useMobileKeyboard(ref, {isOpen, inset: true});
    return (
      <div ref={ref} tabIndex={-1} data-testid="panel">
        <div data-scroll-axis="y">
          <input aria-label="Name" />
        </div>
      </div>
    );
  }
  function Flow({isOpen}: {isOpen: boolean}) {
    return (
      <>
        <Blurrer isClosing={!isOpen} />
        <Panel isOpen={isOpen} />
      </>
    );
  }
  const {rerender} = render(<Flow isOpen />);
  act(() => screen.getByRole('textbox').focus());

  rerender(<Flow isOpen={false} />);

  // The target was closing, so the blur left focus where it went.
  expect(document.activeElement).not.toBe(screen.getByTestId('panel'));
});
