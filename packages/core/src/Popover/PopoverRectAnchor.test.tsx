// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverRectAnchor.test.tsx
 * @input usePopover with a rectangle `anchor`
 * @output Tests for a rectangle anchor placed as a box inside its context
 * @position Colocated with usePopover.tsx and popoverAnchor.ts
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {usePopover} from './usePopover';
import type {PopoverAnchor, PopoverRectAnchor} from './popoverAnchor';
import {findPopoverRectAnchors} from '../privateAttributes/popoverRectAnchor.stylex';

function rectAt(left: number, top: number, width: number, height: number) {
  return () => new DOMRect(left, top, width, height);
}

function boxes(): HTMLElement[] {
  return findPopoverRectAnchors(document);
}

/** A popover with an anchor and no trigger, opened from code on mount. */
function OpenPopover({
  anchor,
  content,
}: {
  anchor: PopoverAnchor;
  content: ReactNode;
}) {
  const popover = usePopover({
    anchor,
    dialogLabel: 'Point',
    hasLightDismiss: false,
    hasAutoFocus: false,
  });
  const showRef = useRef(popover.show);
  showRef.current = popover.show;
  useEffect(() => {
    showRef.current();
  }, []);
  return <>{popover.render(content)}</>;
}

describe('usePopover rectangle anchor', () => {
  it('places one inert box over the rectangle and anchors to it', () => {
    const anchor: PopoverRectAnchor = {
      getBoundingClientRect: rectAt(100, 50, 20, 10),
    };
    render(<OpenPopover anchor={anchor} content={<span>At the point</span>} />);
    const [box] = boxes();
    expect(boxes()).toHaveLength(1);
    expect(box.parentElement).toBe(document.body);
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box.style.pointerEvents).toBe('none');
    expect(box.style.position).toBe('absolute');
    expect(box.style.left).toBe('100px');
    expect(box.style.top).toBe('50px');
    expect(box.style.width).toBe('20px');
    expect(box.style.height).toBe('10px');
    expect(box.style.getPropertyValue('anchor-name')).toMatch(
      /^--astryx-layer-/,
    );
  });

  it('places the box inside its context element', () => {
    function Test() {
      const panelRef = useRef<HTMLDivElement>(null);
      const anchor = useMemo<PopoverRectAnchor>(
        () => ({
          getBoundingClientRect: rectAt(10, 10, 0, 0),
          get contextElement() {
            return panelRef.current;
          },
        }),
        [],
      );
      return (
        <>
          <div
            ref={panelRef}
            data-testid="panel"
            style={{position: 'relative'}}
          />
          <OpenPopover anchor={anchor} content={<span>In the panel</span>} />
        </>
      );
    }
    render(<Test />);
    const [box] = boxes();
    expect(box.parentElement).toBe(screen.getByTestId('panel'));
    // An empty rectangle still gets a box with one pixel on each axis.
    expect(box.style.width).toBe('1px');
    expect(box.style.height).toBe('1px');
  });

  it('measures once per rectangle object, not on every render', () => {
    const read = vi.fn(() => new DOMRect(0, 0, 4, 4));
    function Test() {
      const [count, setCount] = useState(0);
      const [anchor, setAnchor] = useState<PopoverRectAnchor>(() => ({
        getBoundingClientRect: read,
      }));
      return (
        <>
          <button type="button" onClick={() => setCount(count + 1)}>
            Rerender {count}
          </button>
          <button
            type="button"
            onClick={() => setAnchor({getBoundingClientRect: read})}>
            New point
          </button>
          <OpenPopover anchor={anchor} content={<span>Point</span>} />
        </>
      );
    }
    render(<Test />);
    const readsAfterOpen = read.mock.calls.length;
    expect(readsAfterOpen).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', {name: /^Rerender/}));
    expect(read).toHaveBeenCalledTimes(readsAfterOpen);

    fireEvent.click(screen.getByRole('button', {name: 'New point'}));
    expect(read).toHaveBeenCalledTimes(readsAfterOpen + 1);
    expect(boxes()).toHaveLength(1);
  });

  it('removes the box when the anchor becomes an element, and on unmount', () => {
    function Test({isRect}: {isRect: boolean}) {
      const cellRef = useRef<HTMLDivElement>(null);
      const rect = useMemo<PopoverRectAnchor>(
        () => ({getBoundingClientRect: rectAt(0, 0, 4, 4)}),
        [],
      );
      return (
        <>
          <div ref={cellRef} data-testid="cell" />
          <OpenPopover
            anchor={isRect ? rect : cellRef}
            content={<span>Point</span>}
          />
        </>
      );
    }
    const {rerender, unmount} = render(<Test isRect />);
    expect(boxes()).toHaveLength(1);

    rerender(<Test isRect={false} />);
    expect(boxes()).toHaveLength(0);
    expect(
      screen.getByTestId('cell').style.getPropertyValue('anchor-name'),
    ).toMatch(/^--astryx-layer-/);

    rerender(<Test isRect />);
    expect(boxes()).toHaveLength(1);
    unmount();
    expect(boxes()).toHaveLength(0);
  });
});
