// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchorOutOfView.test.tsx
 * @input usePopover with `anchorOutOfViewBehavior`, and a stubbed
 *   IntersectionObserver
 * @output Tests for staying and hiding while the anchor is out of view
 * @position Colocated with usePopover.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {usePopover} from './usePopover';
import type {PopoverAnchor} from './popoverAnchor';

let notify: IntersectionObserverCallback | null = null;
let observed: Element[] = [];

class StubObserver {
  constructor(callback: IntersectionObserverCallback) {
    notify = callback;
  }
  observe(target: Element) {
    observed.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function report(isIntersecting: boolean) {
  act(() => {
    notify?.(
      [{isIntersecting} as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

beforeEach(() => {
  notify = null;
  observed = [];
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Behavior = 'stay' | 'hideWhileOutOfView';

function OpenPopover({
  anchor,
  behavior,
  onHide,
  content,
}: {
  anchor: PopoverAnchor;
  behavior?: Behavior;
  onHide?: () => void;
  content: ReactNode;
}) {
  const popover = usePopover({
    anchor,
    anchorOutOfViewBehavior: behavior,
    onHide,
    dialogLabel: 'Row editor',
    hasLightDismiss: false,
    hasAutoFocus: false,
  });
  const {show} = popover;
  // Opens once, on mount; a later render never opens it again.
  const hasOpenedRef = useRef(false);
  useEffect(() => {
    if (!hasOpenedRef.current) {
      hasOpenedRef.current = true;
      show();
    }
  }, [show]);
  return <>{popover.render(content)}</>;
}

function Harness({
  behavior,
  onHide,
}: {
  behavior?: Behavior;
  onHide?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={rowRef} data-testid="row">
        Row
      </div>
      <OpenPopover
        anchor={rowRef}
        behavior={behavior}
        onHide={onHide}
        content={<span>Editor</span>}
      />
    </>
  );
}

function layerOf(text: string): HTMLElement {
  const layer = screen.getByText(text).closest<HTMLElement>('[popover]');
  if (layer == null) {
    throw new Error('No layer');
  }
  return layer;
}

describe('usePopover anchorOutOfViewBehavior', () => {
  it('hides, without closing, while the anchor is out of view', () => {
    const onHide = vi.fn();
    render(<Harness behavior="hideWhileOutOfView" onHide={onHide} />);
    const layer = layerOf('Editor');
    expect(observed).toContain(screen.getByTestId('row'));
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');

    report(false);
    expect(getComputedStyle(layer).visibility).toBe('hidden');
    expect(getComputedStyle(layer).pointerEvents).toBe('none');
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', {hidden: true})).toBeInTheDocument();

    report(true);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
  });

  it('stays by default', () => {
    render(<Harness />);
    const layer = layerOf('Editor');
    report(false);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
  });

  it('observes an anchor that replaces the first while open', () => {
    function Switching() {
      const [row, setRow] = useState('a');
      return (
        <>
          <div data-row="a">A</div>
          <div data-row="b">B</div>
          <button type="button" onClick={() => setRow('b')}>
            Next
          </button>
          <OpenPopover
            anchor={() => document.querySelector(`[data-row="${row}"]`)}
            behavior="hideWhileOutOfView"
            content={<span>Switching editor</span>}
          />
        </>
      );
    }
    render(<Switching />);
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(observed.at(-1)).toBe(document.querySelector('[data-row="b"]'));
  });
});

describe('usePopover focus as the surface hides with its anchor (AR1)', () => {
  function FocusHarness({
    anchorIsFocusable,
    isAnchorDisabled = false,
    anchorTabIndex,
  }: {
    anchorIsFocusable: boolean;
    isAnchorDisabled?: boolean;
    anchorTabIndex?: number;
  }) {
    const anchorRef = useRef<HTMLElement>(null);
    const popover = usePopover({
      anchor: anchorRef,
      anchorOutOfViewBehavior: 'hideWhileOutOfView',
      dialogLabel: 'Row editor',
      hasLightDismiss: false,
      hasAutoFocus: false,
    });
    const {show} = popover;
    useEffect(() => {
      show();
    }, [show]);
    return (
      <>
        <button type="button" ref={popover.triggerRef}>
          Open
        </button>
        {anchorIsFocusable ? (
          <button
            type="button"
            disabled={isAnchorDisabled}
            ref={anchorRef as React.RefObject<HTMLButtonElement>}>
            Row
          </button>
        ) : (
          <div
            ref={anchorRef as React.RefObject<HTMLDivElement>}
            tabIndex={anchorTabIndex}
            data-testid="row">
            Row
          </div>
        )}
        {popover.render(<button type="button">Inside</button>)}
      </>
    );
  }

  it('moves focus inside the surface to a focusable anchor', () => {
    render(<FocusHarness anchorIsFocusable />);
    const inside = screen.getByRole('button', {name: 'Inside', hidden: true});
    act(() => inside.focus());
    expect(document.activeElement).toBe(inside);
    report(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Row'}),
    );
  });

  it('moves focus to the trigger when the anchor cannot take focus', () => {
    render(<FocusHarness anchorIsFocusable={false} />);
    const inside = screen.getByRole('button', {name: 'Inside', hidden: true});
    act(() => inside.focus());
    report(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Open'}),
    );
  });

  it('moves focus to an anchor that takes focus without being a tab stop', () => {
    render(<FocusHarness anchorIsFocusable={false} anchorTabIndex={-1} />);
    const inside = screen.getByRole('button', {name: 'Inside', hidden: true});
    act(() => inside.focus());
    report(false);
    expect(document.activeElement).toBe(screen.getByTestId('row'));
  });

  it('moves focus to the trigger when the anchor refuses focus', () => {
    render(<FocusHarness anchorIsFocusable isAnchorDisabled />);
    const inside = screen.getByRole('button', {name: 'Inside', hidden: true});
    act(() => inside.focus());
    report(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Open'}),
    );
  });

  it('leaves focus outside the surface where it is, and does not move it back', () => {
    render(<FocusHarness anchorIsFocusable />);
    const open = screen.getByRole('button', {name: 'Open'});
    act(() => open.focus());
    report(false);
    expect(document.activeElement).toBe(open);
    report(true);
    expect(document.activeElement).toBe(open);
  });
});

// Stable, so the popover binds it once and only the observer sees the removal.
const findRemovableRow = () => document.querySelector('[data-removable]');

describe('usePopover with an anchor removed from the page', () => {
  it('hides, without closing, while the anchor is gone, under hideWhileOutOfView', () => {
    const onHide = vi.fn();
    function Removing() {
      const [hasRow, setHasRow] = useState(true);
      return (
        <>
          {hasRow ? <div data-removable="">Row</div> : null}
          <button type="button" onClick={() => setHasRow(false)}>
            Remove
          </button>
          <OpenPopover
            anchor={findRemovableRow}
            behavior="hideWhileOutOfView"
            onHide={onHide}
            content={<span>Editor</span>}
          />
        </>
      );
    }
    render(<Removing />);
    const layer = layerOf('Editor');
    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
    report(false);
    expect(getComputedStyle(layer).visibility).toBe('hidden');
    expect(onHide).not.toHaveBeenCalled();
  });
});
