// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Popover.attachOnce.test.tsx
 * @input Uses vitest, Testing Library, Popover
 * @output Tests that a re-render with unchanged inputs does not attach the
 *   trigger again, and that a replaced trigger is attached
 * @position Testing; guards Popover.tsx's trigger attach: once per trigger
 *   element, not after every render
 *
 * SYNC: When Popover.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup, screen} from '@testing-library/react';
import {act, Profiler, useRef, useState, type RefObject} from 'react';
import {Popover} from './Popover';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Counts the click listeners added to buttons since the spy started. */
function spyOnButtonClicks(): () => number {
  const addListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
  return () =>
    addListener.mock.calls.filter(
      ([type], index) =>
        type === 'click' &&
        addListener.mock.contexts[index] instanceof HTMLButtonElement,
    ).length;
}

describe('Popover children mode', () => {
  it('attaches its trigger once across re-renders that change nothing it reads', () => {
    const clicks = spyOnButtonClicks();
    let rerenderParent: () => void = () => {};
    function Parent() {
      const [, setCount] = useState(0);
      rerenderParent = () => setCount(count => count + 1);
      return (
        <Popover content={<span>Shortcuts</span>} label="Shortcuts">
          <button type="button">Open</button>
        </Popover>
      );
    }
    render(<Parent />);
    const attachedAtMount = clicks();
    expect(attachedAtMount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      act(() => rerenderParent());
    }

    expect(clicks()).toBe(attachedAtMount);
  });

  it('attaches its trigger once when the caller passes a new onOpenChange on each render', () => {
    const clicks = spyOnButtonClicks();
    let rerenderParent: () => void = () => {};
    function Parent() {
      const [, setCount] = useState(0);
      rerenderParent = () => setCount(count => count + 1);
      return (
        <Popover
          content={<span>Shortcuts</span>}
          label="Shortcuts"
          onOpenChange={() => {}}>
          <button type="button">Open</button>
        </Popover>
      );
    }
    render(<Parent />);
    const attachedAtMount = clicks();

    for (let i = 0; i < 5; i++) {
      act(() => rerenderParent());
    }

    expect(clicks()).toBe(attachedAtMount);
  });

  it('settles in a bounded number of commits when its trigger text changes once', () => {
    let commits = 0;
    let setCount: (count: number) => void = () => {};
    function Parent() {
      const [count, setCountState] = useState(1);
      setCount = setCountState;
      return (
        <Profiler
          id="popover"
          onRender={() => {
            commits += 1;
          }}>
          <Popover content={<span>Filters</span>}>
            <button type="button">{`Filters ${count}`}</button>
          </Popover>
        </Profiler>
      );
    }
    render(<Parent />);
    commits = 0;

    act(() => setCount(2));

    // The parent's commit, then at most one for the trigger text Popover
    // reads after it.
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThanOrEqual(2);
  });

  it('attaches a trigger that the caller swaps for another component', () => {
    // Two component types, as with an IconButton and a Button: React mounts a
    // new element for the swap instead of reusing the old one.
    function CompactTrigger() {
      return (
        <button type="button" aria-label="Shortcuts compact">
          ?
        </button>
      );
    }
    function WideTrigger() {
      return <button type="button">Shortcuts wide</button>;
    }
    let setCompact: (isCompact: boolean) => void = () => {};
    function Parent() {
      const [isCompact, setIsCompact] = useState(false);
      setCompact = setIsCompact;
      return (
        <Popover content={<span>Shortcuts</span>} label="Shortcuts">
          {isCompact ? <CompactTrigger /> : <WideTrigger />}
        </Popover>
      );
    }
    render(<Parent />);
    const wide = screen.getByRole('button', {name: 'Shortcuts wide'});
    expect(wide).toHaveAttribute('aria-haspopup');

    act(() => setCompact(true));

    const compact = screen.getByRole('button', {name: 'Shortcuts compact'});
    expect(compact).not.toBe(wide);
    expect(compact).toHaveAttribute('aria-haspopup');
    expect(compact).toHaveAttribute('aria-expanded', 'false');
  });

  it('attaches a trigger that remounts under a new key', () => {
    let remount: () => void = () => {};
    function Parent() {
      const [key, setKey] = useState(0);
      remount = () => setKey(current => current + 1);
      return (
        <Popover content={<span>Shortcuts</span>} label="Shortcuts">
          <button key={key} type="button">
            Open
          </button>
        </Popover>
      );
    }
    render(<Parent />);
    const first = screen.getByRole('button', {name: 'Open'});

    act(() => remount());

    const second = screen.getByRole('button', {name: 'Open'});
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('aria-haspopup');
  });
});

describe('Popover sibling mode', () => {
  it('attaches the button anchorRef holds after that button remounts', () => {
    let remount: () => void = () => {};
    function Parent() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      const [key, setKey] = useState(0);
      remount = () => setKey(current => current + 1);
      return (
        <>
          <button key={key} ref={anchorRef} type="button">
            Open
          </button>
          <Popover
            anchorRef={anchorRef as RefObject<HTMLElement>}
            content={<span>Shortcuts</span>}
            label="Shortcuts"
          />
        </>
      );
    }
    render(<Parent />);
    const first = screen.getByRole('button', {name: 'Open'});
    expect(first).toHaveAttribute('aria-haspopup');

    act(() => remount());

    const second = screen.getByRole('button', {name: 'Open'});
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('aria-haspopup');
  });
});
