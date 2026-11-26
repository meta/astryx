// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useInfinityScroll.ts
 * @input Wheel and navigation input for fixed-height items
 * @output Mounted range and frame-aligned list and scrollbar positions
 * @position Scroll controller for the Lab list
 */
import {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {
  coversViewport,
  INITIAL_POSITION,
  movePosition,
  readScrollWindow,
  scrollFraction,
  wheelDistance,
  type ScrollGeometry,
  type ScrollPosition,
} from './scrollWindow';

export function useInfinityScroll(
  geometry: ScrollGeometry,
  thumbTravel: number,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const position = useRef(INITIAL_POSITION);
  const frame = useRef<number | null>(null);
  const [range, setRange] = useState(() =>
    readScrollWindow(geometry, INITIAL_POSITION),
  );
  const mountedRange = useRef(range);

  const paint = useCallback(() => {
    const current = position.current;
    const distance =
      (current.index - mountedRange.current.start) * geometry.itemHeight +
      current.offset;
    listRef.current?.style.setProperty(
      '--infinity-translate',
      `${-distance}px`,
    );
    const thumb = thumbRef.current;
    if (thumb !== null) {
      thumb.style.setProperty(
        '--infinity-thumb-offset',
        `${scrollFraction(geometry, current) * thumbTravel}px`,
      );
      const index = String(current.index);
      if (thumb.getAttribute('aria-valuenow') !== index) {
        thumb.setAttribute('aria-valuenow', index);
      }
    }
  }, [geometry, thumbTravel]);

  const navigate = useCallback(
    (next: ScrollPosition) => {
      const current = position.current;
      if (next.index === current.index && next.offset === current.offset) {
        return false;
      }
      position.current = next;
      if (frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (
            !coversViewport(geometry, position.current, mountedRange.current)
          ) {
            const nextRange = readScrollWindow(geometry, position.current);
            // Commit new rows before moving the layer, so the frame has no gap.
            flushSync(() => setRange(nextRange));
            mountedRange.current = nextRange;
          }
          paint();
        });
      }
      return true;
    },
    [geometry, paint],
  );

  const move = useCallback(
    (delta: number) =>
      navigate(movePosition(geometry, position.current, delta)),
    [geometry, navigate],
  );
  const readFraction = useCallback(
    () => scrollFraction(geometry, position.current),
    [geometry],
  );

  // Syncs the DOM layers and owns the viewport's cancellable wheel listener.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    paint();
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && move(wheelDistance(geometry, event))) {
        event.preventDefault();
      }
    };
    viewport.addEventListener('wheel', onWheel, {passive: false});
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [geometry, move, paint]);

  return {viewportRef, listRef, thumbRef, range, navigate, move, readFraction};
}
