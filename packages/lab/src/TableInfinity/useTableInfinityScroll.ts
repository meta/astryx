// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableInfinityScroll.ts
 * @input A bounded row and column viewport and physical wheel deltas
 * @output One committed window and two logical positions
 * @position Frame controller for the Lab Table plugin
 */
import {useCallback, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {isRtlElement} from '@astryxdesign/core/internal/touch';
import {
  coversViewport,
  INITIAL_POSITION,
  movePosition,
  readScrollWindow,
  type ScrollGeometry,
  type ScrollPosition,
} from './scrollWindow';

interface Axes<T> {
  row: T;
  column: T;
}

type Ranges = Axes<ReturnType<typeof readScrollWindow>>;

const origin: Axes<ScrollPosition> = {
  row: INITIAL_POSITION,
  column: INITIAL_POSITION,
};

function advance(
  geometry: ScrollGeometry,
  position: ScrollPosition,
  delta: number,
  mode: number,
) {
  const scale =
    mode === 1 ? geometry.itemHeight : mode === 2 ? geometry.viewportHeight : 1;
  return movePosition(geometry, position, delta * scale);
}

function equal(a: ScrollPosition, b: ScrollPosition) {
  return a.index === b.index && a.offset === b.offset;
}

export function useTableInfinityScroll(
  axes: Axes<ScrollGeometry>,
  direction: 'ltr' | 'rtl' | undefined,
  paint: (
    position: Axes<ScrollPosition>,
    range: Ranges,
    inlineSign: number,
  ) => void,
) {
  const [range, setRange] = useState<Ranges>(() => ({
    row: readScrollWindow(axes.row, origin.row),
    column: readScrollWindow(axes.column, origin.column),
  }));
  const mounted = useRef(range);
  const position = useRef(origin);
  const frame = useRef<number | null>(null);
  const inlineSign = useRef(1);
  const readInlineSign = useCallback(() => inlineSign.current, []);

  const schedule = useCallback(() => {
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const target = position.current;
        const previousRange = mounted.current;
        const row = coversViewport(axes.row, target.row, previousRange.row)
          ? previousRange.row
          : readScrollWindow(axes.row, target.row);
        const column = coversViewport(
          axes.column,
          target.column,
          previousRange.column,
        )
          ? previousRange.column
          : readScrollWindow(axes.column, target.column);
        if (row !== previousRange.row || column !== previousRange.column) {
          const nextRange = {row, column};
          // Publish both ranges before translating the table so no frame has a gap.
          flushSync(() => setRange(nextRange));
          mounted.current = nextRange;
        }
        paint(target, mounted.current, inlineSign.current);
      });
    }
  }, [axes, paint]);

  const navigate = useCallback(
    (next: Axes<ScrollPosition>) => {
      const previous = position.current;
      if (
        equal(previous.row, next.row) &&
        equal(previous.column, next.column)
      ) {
        return false;
      }
      position.current = next;
      schedule();
      return true;
    },
    [schedule],
  );

  const navigateAxis = useCallback(
    (axis: keyof Axes<unknown>, next: ScrollPosition) =>
      navigate({...position.current, [axis]: next}),
    [navigate],
  );
  const moveAxis = useCallback(
    (axis: keyof Axes<unknown>, delta: number) =>
      navigateAxis(
        axis,
        movePosition(axes[axis], position.current[axis], delta),
      ),
    [axes, navigateAxis],
  );
  const readPosition = useCallback(
    (axis: keyof Axes<unknown>) => position.current[axis],
    [],
  );

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (node === null) {
        return;
      }
      // Measure the attached frame's direction once, not during wheel input or paint.
      inlineSign.current = (
        direction == null ? isRtlElement(node) : direction === 'rtl'
      )
        ? -1
        : 1;
      if (position.current !== origin) {
        schedule();
      }
      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey) {
          return;
        }
        let {deltaX, deltaY} = event;
        if (event.shiftKey && deltaX === 0) {
          deltaX = deltaY;
          deltaY = 0;
        }
        const current = position.current;
        const handled = navigate({
          row: advance(axes.row, current.row, deltaY, event.deltaMode),
          column: advance(
            axes.column,
            current.column,
            deltaX * inlineSign.current,
            event.deltaMode,
          ),
        });
        if (handled) {
          event.preventDefault();
        }
      };
      node.addEventListener('wheel', onWheel, {passive: false});
      return () => {
        node.removeEventListener('wheel', onWheel);
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
      };
    },
    [axes, direction, navigate, schedule],
  );

  return {
    range,
    attach,
    navigate,
    navigateAxis,
    moveAxis,
    readPosition,
    readInlineSign,
  };
}
