// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PickerWheel.tsx
 * @input Wheel's props (wheelOptions.ts): options, value and change callback;
 *   optionally a ref for programmatic turns, and looping
 * @output PickerWheel: one picker column that moves like UIPickerView
 * @position Internal component; the Wheel under a finger (Wheel.tsx picks it)
 *
 * It moves on the gesture system and the shared animator, not on a native
 * scroller. One strip holds the rows and is the only element that moves. A
 * looping wheel also draws hidden copies of its rows along the strip.
 *
 * SYNC: When modified, update PickerWheel.test.tsx, Wheel.tsx,
 * DateInputTouch.test.tsx, DateInput.doc.mjs and TimeInput.doc.mjs.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {scrollTypeOf} from '../gestures/GestureHost';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {rubberBandInverse} from '../motion/rubberBand';
import {resolveMotion} from '../motion/resolveMotion';
import {picker} from '../motion/uikit/picker';
import {registerScrollTable, scroll} from '../motion/uikit/scroll';
import {registerSpringsTable, springs} from '../motion/uikit/springs';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {mod, nearestLoopCopy} from '../hooks/usePager';
import {lockSelection} from '../gestures/selectionLock';
import {dateInputTouchGeometry, dateInputTouchSizes} from './tokens.stylex';
import {useOwnScrollGesture} from './useOwnScrollGesture';
import {useWheelListbox} from './useWheelListbox';
import {createWheelStrip, type PlayOptions} from './wheelStrip';
import {
  bounceCurve,
  dragOffset,
  nearestIndex,
  offsetBounds,
  planRelease,
  type WheelCurve,
  type WheelLayout,
} from './wheelPhysics';
import {
  canSpinTo,
  endIndex,
  loopedStep,
  nearestEnabledIndex,
  restingLoopStep,
  steppedIndex,
  WHEEL_ROW_HEIGHT,
  type WheelOption,
  type WheelProps,
} from './wheelOptions';

/** Row pitch, px: the touch column keeps the scrolling column's pitch. */
const ROW_HEIGHT = WHEEL_ROW_HEIGHT;
/** UIKit's picker measures scaled to that pitch (UIKit's row is 32 pt). */
const UIKIT_SCALE = ROW_HEIGHT / picker.geometry.rowHeight;
/** UIKit's rubber band dimension for the picker's table, at that pitch. */
const RUBBER_BAND_DIMENSION = picker.geometry.rubberBandDimension * UIKIT_SCALE;

/**
 * How many rows a looping wheel draws past the band each way, beyond its own
 * rows and any motion's span. That is more than half a column in every
 * shipped size.
 */
const DRAWN_PAST_BAND = 10;

/**
 * The rows' opacity at the column's edges. At 0.7 the row four from the band
 * keeps 5:1 or more in every shipped theme, a margin over WCAG AA's 4.5:1.
 */
const FADE_FLOOR = 0.7;

const styles = stylex.create({
  // The scrolling column's box, band and rows (Wheel.tsx), moved by the
  // gesture system and the compositor instead of a native scroller.
  column: {
    position: 'relative',
    flex: '1 1 0',
    minInlineSize: 0,
    blockSize: dateInputTouchGeometry.paneBlockSize,
    overflow: 'hidden',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  // The rows fade toward the column's edges. A static mask: nothing paints it
  // again as the strip moves. It sits inside the column, so it never clips the
  // column's focus ring.
  fade: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    maskImage: `linear-gradient(to bottom, rgb(0 0 0 / ${FADE_FLOOR}), rgb(0 0 0) 50%, rgb(0 0 0 / ${FADE_FLOOR}))`,
  },
  /**
   * The selection band: a centred row-height plate behind the rows.
   * Decorative: the committed value is announced by `aria-selected`.
   */
  band: {
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: `calc(50% - (${dateInputTouchSizes.wheelItemSize} / 2))`,
    blockSize: dateInputTouchSizes.wheelItemSize,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-neutral'],
    pointerEvents: 'none',
  },
  /**
   * The strip holds the rows at their places along the wheel, with its top on
   * the band's row. It moves by minus the wheel's offset, and the animator
   * writes its `translate`. Also what a reduced-motion cross-fade fades.
   */
  strip: {
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: `calc(50% - (${dateInputTouchSizes.wheelItemSize} / 2))`,
    pointerEvents: 'none',
  },
  /** One row: an option at its place along the strip, flat. */
  row: {
    position: 'absolute',
    insetInline: 0,
    blockSize: dateInputTouchSizes.wheelItemSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: spacingVars['--spacing-2'],
    boxSizing: 'border-box',
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-primary'],
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
    // The mark has no transition, unlike the scrolling column's. A colour or
    // weight that animates lays out and paints every frame on the main thread.
    // A mark set as a drag lets go would do so through the coast.
  },
  /** The row under the band, as the scrolling column marks it. */
  rowActive: {
    color: colorVars['--color-text-accent'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  rowDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  /** A row at its place along the strip. */
  rowAt: (top: string) => ({insetBlockStart: top}),
});

/**
 * The motion tables the wheel resolves its springs from: the scroll bounce
 * and the shared springs. The spring rows register as their module loads,
 * but the scroll table does not. Each register is idempotent, so the wheel
 * calls this right before it resolves a role.
 */
function registerWheelTables(): void {
  registerScrollTable();
  registerSpringsTable();
}

/**
 * A turn onto `to` that a tap, a key or the program starts. The wheel's main
 * interaction is a gesture, so every turn springs.
 */
function turnCurve(
  column: Element | null,
  from: number,
  to: number,
): WheelCurve {
  registerWheelTables();
  return bounceCurve(
    from,
    0,
    to,
    UIKIT_SCALE,
    resolveMotion(column, springs.settle),
  );
}

/**
 * The position of row `row` in the lap that holds `position`: on a looping
 * wheel, the copy between the same two seams.
 */
function lapPosition(
  row: number,
  position: number,
  layout: WheelLayout,
): number {
  if (!layout.looping || layout.rowCount === 0) {
    return row;
  }
  return row + Math.floor(position / layout.rowCount) * layout.rowCount;
}

interface DragState {
  /** The finger's offset at the pan's start, before any rubber band. */
  readonly start: number;
}

/** The positions a looping wheel draws rows at, first and last. */
interface DrawnSpan {
  readonly from: number;
  readonly to: number;
}

/** A looping wheel's span at rest: its own rows, and copies past each end. */
function restingSpan(rowCount: number): DrawnSpan {
  return {from: -DRAWN_PAST_BAND, to: rowCount - 1 + DRAWN_PAST_BAND};
}

/**
 * The position of row `row` nearest `offset`: on a looping wheel, the copy
 * nearest it (`nearestLoopCopy`).
 */
function nearestPosition(
  row: number,
  offset: number,
  layout: WheelLayout,
): number {
  if (!layout.looping || layout.rowCount === 0) {
    return row;
  }
  return nearestLoopCopy(row, offset / layout.rowHeight, layout.rowCount);
}

function isEnabledOption(option: WheelOption | undefined): boolean {
  return option != null && !option.isDisabled;
}

/**
 * One UIPickerView column: the Wheel under a finger. It does not scroll
 * natively. WebKit gives every scroll-snapping scroller the fast deceleration
 * rate, and a scroller's momentum cannot be caught or measured. A busy main
 * thread does not stop or jump a motion here. Under Reduce Motion a throw's
 * momentum still plays, as iOS scrolling does. Every other motion
 * cross-fades onto its row.
 *
 * @example
 * ```
 * <PickerWheel label="Month" options={monthOptions} value={month} onChange={setMonth} />
 * ```
 */
export function PickerWheel({
  label,
  options,
  value,
  onChange,
  isActive = true,
  ref,
  isLooping = false,
}: WheelProps) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const rowCount = options.length;
  const loops = isLooping && rowCount > 1;
  const layout = useMemo<WheelLayout>(
    () => ({rowHeight: ROW_HEIGHT, rowCount, looping: loops}),
    [rowCount, loops],
  );
  // A looping wheel's offset is unbounded, so it draws copies of its rows over
  // the span any motion covers. They are drawn directly, as the band's mark is
  // painted, so a gesture never re-renders the wheel. At rest the offset moves
  // back onto the wheel's own rows, and the span shrinks again.
  const copiesRef = useRef<HTMLDivElement | null>(null);
  const spanRef = useRef<DrawnSpan | null>(null);
  const drawnRef = useRef<Map<number, HTMLElement>>(new Map());
  const [motion] = useState(() => createWheelStrip(layout));
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  // Where the committed row sits on a looping strip. Every commit moves the
  // strip so that this row sits among its own rows.
  const committedRef = useRef(selectedIndex);
  const dragRef = useRef<DragState | null>(null);
  /** A finger landed on a moving wheel and stopped it. */
  const caughtRef = useRef(false);

  // The latest props, for the motion's and the gesture listeners' callbacks,
  // which are attached once and outlive a render.
  const latestRef = useRef({options, value, onChange, layout});
  useIsomorphicLayoutEffect(() => {
    latestRef.current = {options, value, onChange, layout};
  });

  // Reads the option a looping wheel shows at any position: a copy shows the
  // row it copies.
  const optionReader = useCallback(() => {
    const {options: own, layout: current} = latestRef.current;
    const count = own.length;
    return (position: number): WheelOption | undefined =>
      current.looping && count > 0 ? own[mod(position, count)] : own[position];
  }, []);

  // Draws the copies over `next`, or none. It adds the positions it lacks and
  // drops those past the span. `isRedrawn` draws every copy again.
  const drawCopies = useCallback(
    (next: DrawnSpan | null, isRedrawn: boolean = false) => {
      const container = copiesRef.current;
      const drawn = drawnRef.current;
      spanRef.current = next;
      if (container == null) {
        return;
      }
      const count = latestRef.current.options.length;
      const optionAt = optionReader();
      for (const [position, row] of drawn) {
        if (
          isRedrawn ||
          next == null ||
          position < next.from ||
          position > next.to
        ) {
          row.remove();
          drawn.delete(position);
        }
      }
      if (next == null) {
        return;
      }
      for (let position = next.from; position <= next.to; position++) {
        if ((position >= 0 && position < count) || drawn.has(position)) {
          continue;
        }
        const option = optionAt(position);
        if (option == null) {
          continue;
        }
        const row = document.createElement('div');
        row.className =
          stylex.props(styles.row, option.isDisabled && styles.rowDisabled)
            .className ?? '';
        row.style.insetBlockStart = `${position * ROW_HEIGHT}px`;
        row.textContent = option.label;
        container.append(row);
        drawn.set(position, row);
      }
    },
    [optionReader],
  );

  // The span grows to cover positions `a` to `b` and the band's surroundings.
  const cover = useCallback(
    (a: number, b: number) => {
      const current = spanRef.current;
      if (current == null) {
        return;
      }
      const from = Math.min(current.from, Math.min(a, b) - DRAWN_PAST_BAND);
      const to = Math.max(current.to, Math.max(a, b) + DRAWN_PAST_BAND);
      if (from !== current.from || to !== current.to) {
        drawCopies({from, to});
      }
    },
    [drawCopies],
  );

  // The copies follow the rows: their labels, their disabled rows, and
  // whether the wheel loops at all.
  useIsomorphicLayoutEffect(() => {
    drawCopies(loops ? (spanRef.current ?? restingSpan(rowCount)) : null, true);
  }, [options, loops, rowCount, drawCopies]);

  // The row under the band is marked as the scrolling column marks it. At rest
  // that is the committed row, styled in render. While a finger drags the
  // wheel, the row reaching the band is painted directly, so marking it never
  // re-renders. A motion unmarks every row as it starts and marks the row it
  // stops or ends on. The compositor then plays it with no layout or paint per
  // frame, and no mark rides away from the band.
  const paintedRef = useRef<Set<HTMLElement>>(new Set());
  const paintRow = useCallback(
    (position: number | null) => {
      const container = rowsRef.current;
      if (container == null || container.children.length === 0) {
        return;
      }
      const {options: currentOptions, value: currentValue} = latestRef.current;
      // The wheel's own rows come first on the strip, and a looping wheel's
      // copies sit in its own map.
      const rowAt = (at: number): HTMLElement | null =>
        at >= 0 && at < currentOptions.length
          ? ((container.children[at] as HTMLElement | undefined) ?? null)
          : (drawnRef.current.get(at) ?? null);
      const active = position == null ? null : rowAt(position);
      const painted = paintedRef.current;
      for (const row of painted) {
        row.style.removeProperty('color');
        row.style.removeProperty('font-weight');
      }
      painted.clear();
      const selected = currentOptions.findIndex(
        option => option.value === currentValue,
      );
      const own = selected < 0 ? null : rowAt(selected);
      if (own != null && own !== active) {
        // The committed row's own mark gives way while another row is under
        // the band.
        const row = own;
        row.style.color = currentOptions[selected]?.isDisabled
          ? colorVars['--color-text-disabled']
          : colorVars['--color-text-primary'];
        row.style.fontWeight = fontWeightVars['--font-weight-normal'];
        painted.add(row);
      }
      if (active == null || position == null) {
        return;
      }
      // A copy shows the option it copies.
      const option = optionReader()(position);
      active.style.color = option?.isDisabled
        ? colorVars['--color-text-disabled']
        : colorVars['--color-text-accent'];
      active.style.fontWeight = fontWeightVars['--font-weight-semibold'];
      painted.add(active);
    },
    [optionReader],
  );

  // Every motion the wheel starts. Under Reduce Motion a transition lands
  // without travel: the animator cross-fades the strip onto its row. The
  // momentum that continues a throw is not a transition, so it plays as is.
  const move = useCallback(
    (curve: WheelCurve, options: PlayOptions = {}) => {
      paintRow(null);
      // The mark comes back from the row the motion reports nearest when it
      // ends, even the row it began on.
      motion.forgetNearest();
      motion.play(curve, options);
    },
    [motion, paintRow],
  );

  // At rest on a copy, the offset moves onto the wheel's own row, where the
  // strip shows the same rows. The drawn span shrinks back with it. Returns
  // the offset there.
  const settle = useCallback(
    (offset: number): number => {
      const current = latestRef.current;
      const count = current.options.length;
      if (!current.layout.looping || count === 0) {
        return offset;
      }
      const position = nearestIndex(offset, current.layout);
      const shift = position - mod(position, count);
      if (shift !== 0) {
        motion.setOffset(offset - shift * ROW_HEIGHT);
        committedRef.current -= shift;
      }
      drawCopies(restingSpan(count));
      return offset - shift * ROW_HEIGHT;
    },
    [motion, drawCopies],
  );

  const commit = useCallback((option: WheelOption | undefined) => {
    const current = latestRef.current;
    if (
      option != null &&
      !option.isDisabled &&
      option.value !== current.value
    ) {
      current.onChange(option.value);
    }
  }, []);

  // The wheel came to rest at `offset`: commit, or turn on to the row the
  // rest rule names first.
  const arrive = useCallback(
    (offset: number) => {
      const current = latestRef.current;
      const count = current.options.length;
      const position = nearestIndex(offset, current.layout);
      const optionAt = optionReader();
      // A rest on the committed row is not a stop to correct. A committed value
      // outside the bounds stays until a person moves the wheel off it, as in
      // the scrolling column. On a loop the nearest enabled row is measured
      // around the seam, and the wheel turns the shorter way to it. The
      // committed row counts at its copy nearest the rest, so a rest whole
      // laps away is on it.
      let step = 0;
      if (current.layout.looping && count > 0) {
        const committed = nearestLoopCopy(
          committedRef.current,
          position,
          count,
        );
        if (position !== committed) {
          step = restingLoopStep(
            at => isEnabledOption(optionAt(at)),
            position,
            committed,
            count,
          );
        }
      } else {
        const committed = current.options.findIndex(
          option => option.value === current.value,
        );
        if (position !== committed) {
          step =
            nearestEnabledIndex(
              current.options,
              position,
              Math.max(0, committed),
            ) - position;
        }
      }
      if (step !== 0) {
        const target = position + step;
        cover(position, target);
        move(turnCurve(columnRef.current, offset, target * ROW_HEIGHT), {
          onEnd: (outcome, end) => {
            if (outcome === 'arrived') {
              arrive(end);
            }
          },
        });
        return;
      }
      const option = optionAt(position);
      // The offset moves onto the wheel's own rows before the commit, so a
      // value the owner clamps turns the wheel on from there.
      committedRef.current = nearestIndex(settle(offset), current.layout);
      commit(option);
    },
    [move, cover, settle, commit, optionReader],
  );

  const onEnd = useCallback(
    (outcome: 'arrived' | 'stopped', offset: number) => {
      if (outcome === 'arrived') {
        arrive(offset);
      }
    },
    [arrive],
  );

  // The animator holds the strip while it is attached, and lets it go as it
  // detaches or is replaced.
  const attachStrip = useCallback(
    (strip: HTMLDivElement) => {
      rowsRef.current = strip;
      motion.attach(strip);
      return () => {
        rowsRef.current = null;
        motion.attach(null);
      };
    },
    [motion],
  );

  // The motion's layout follows the rows.
  useIsomorphicLayoutEffect(() => {
    motion.setLayout(layout);
  }, [motion, layout]);

  // The band's mark follows the row the motion reports nearest the band.
  useIsomorphicLayoutEffect(() => {
    motion.onNearestChange(paintRow);
    return () => motion.onNearestChange(null);
  }, [motion, paintRow]);
  // At rest on the committed row, render's own mark takes over again.
  useIsomorphicLayoutEffect(() => {
    if (
      motion.isMoving() ||
      dragRef.current != null ||
      nearestIndex(motion.offset(), layout) !== selectedIndex
    ) {
      return;
    }
    for (const row of paintedRef.current) {
      row.style.removeProperty('color');
      row.style.removeProperty('font-weight');
    }
    paintedRef.current.clear();
  });

  // The motion's animations and timers end with the wheel.
  useEffect(() => () => motion.dispose(), [motion]);

  // Park the committed row under the band when the wheel is shown, at once. A
  // value that changes from outside while the wheel is shown turns the wheel
  // onto its row instead. UIDatePicker turns onto its maximum the same way, and
  // never jumps there. For example, a bound clamps the time after another wheel
  // turned, or the calendar moved to another month. A second change during that
  // turn turns on from where the wheel is drawn. Never while a finger or a
  // motion of its own owns the wheel.
  const parkedRef = useRef(false);
  const parkTurnRef = useRef<object | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!isActive) {
      parkedRef.current = false;
      return;
    }
    if (
      dragRef.current != null ||
      (motion.isMoving() && parkTurnRef.current == null)
    ) {
      return;
    }
    const shown = motion.isMoving() ? motion.stop() : motion.offset();
    // On a loop, the committed row's copy nearest the wheel: a value set from
    // outside turns the shorter way round.
    const position = nearestPosition(selectedIndex, shown, layout);
    const target = position * ROW_HEIGHT;
    const isAway = Math.abs(shown - target) > 0.01;
    committedRef.current = position;
    if (isAway && parkedRef.current) {
      // The turn's own end paints the band's row.
      const turn = {};
      parkTurnRef.current = turn;
      cover(nearestIndex(shown, layout), position);
      move(turnCurve(columnRef.current, shown, target), {
        onEnd: (outcome, end) => {
          if (parkTurnRef.current === turn) {
            parkTurnRef.current = null;
          }
          if (outcome === 'arrived') {
            settle(end);
          }
        },
      });
      return;
    }
    if (isAway) {
      motion.setOffset(selectedIndex * ROW_HEIGHT);
      committedRef.current = selectedIndex;
    }
    parkedRef.current = true;
  }, [isActive, selectedIndex, layout, motion, move, cover, settle]);

  // A hidden wheel keeps no motion running and holds no drag. Hiding it
  // mid-drag ends the pan without calling its listener, because the toggle's
  // owner owns that end. So the drag is dropped here, uncommitted. Shown again,
  // the wheel parks the committed row.
  useEffect(() => {
    if (!isActive) {
      dragRef.current = null;
      motion.stop();
    }
  }, [isActive, motion]);

  // A finger lands: a moving wheel stops where it is on screen.
  const onTouchDown = useCallback(
    (time: number) => {
      caughtRef.current = motion.isMoving();
      if (caughtRef.current) {
        motion.stop(time);
      }
    },
    [motion],
  );

  // The latest touch-down handler, for the gesture listener attached once.
  const onTouchDownRef = useRef(onTouchDown);
  useIsomorphicLayoutEffect(() => {
    onTouchDownRef.current = onTouchDown;
  });

  const release = useCallback(
    (velocity: number) => {
      registerWheelTables();
      const currentLayout = latestRef.current.layout;
      const plan = planRelease(
        motion.offset(),
        velocity,
        currentLayout,
        resolveMotion(columnRef.current, scroll.bounce),
      );
      cover(nearestIndex(motion.offset(), currentLayout), plan.index);
      move(plan.curve, {
        ticks: true,
        onEnd,
        touchRelease: true,
        momentum: plan.kind === 'coast' || plan.kind === 'edge',
      });
    },
    [motion, move, onEnd, cover],
  );

  const pan = useGestureRecognizer(
    columnRef,
    () =>
      new PanGestureRecognizer({
        name: 'wheel-pan',
        direction: 'vertical',
        // A trackpad's two-finger scroll drives the pan as a finger does. The
        // rows follow, coast on at the lift with the fingers' last speed, and
        // rest by the rest rule. A mouse wheel's notches never reach the pan.
        allowedScrollTypes: ['continuous'],
        // A held finger on the wheel never starts text selection or the
        // callout.
        selectionLock: lockSelection,
        shouldReceiveTouch: (_pan, touch) => {
          onTouchDownRef.current(touch.time);
          return true;
        },
      }),
    recognizer => {
      const {layout: currentLayout} = latestRef.current;
      switch (recognizer.state) {
        case 'began': {
          const shown = motion.isMoving() ? motion.stop() : motion.offset();
          dragRef.current = {start: fingerOffset(shown, currentLayout)};
          motion.resetDrag();
          motion.setOffset(
            dragOffset(
              dragRef.current.start - recognizer.translation().y,
              currentLayout,
            ),
            {ticks: true},
          );
          break;
        }
        case 'changed': {
          const drag = dragRef.current;
          if (drag == null) {
            break;
          }
          const offset = dragOffset(
            drag.start - recognizer.translation().y,
            currentLayout,
          );
          if (currentLayout.looping) {
            const position = nearestIndex(offset, currentLayout);
            cover(position, position);
          }
          motion.setOffset(offset, {ticks: true});
          break;
        }
        case 'ended': {
          const drag = dragRef.current;
          dragRef.current = null;
          // A scroll view's release velocity (the pan's last two, blended as
          // UIPickerView's); the rows move against the finger.
          release(drag == null ? 0 : -recognizer.scrollVelocity().y);
          break;
        }
        case 'cancelled': {
          dragRef.current = null;
          release(0);
          break;
        }
        case 'possible':
        case 'failed':
          break;
      }
    },
    {isEnabled: isActive},
  );

  // A touch that stopped a moving wheel and lifted without dragging: the
  // wheel eases onto the nearest row, as a release without velocity does.
  useEffect(
    () =>
      pan.addTransitionListener((_pan, _from, to) => {
        // The flag stays up until the next touch lands. The tap recognizer may
        // hear of this lift after the pan does, and must not read it as a tap
        // on a row.
        if (to === 'failed' && caughtRef.current && !motion.isMoving()) {
          release(0);
        }
      }),
    [pan, motion, release],
  );

  useGestureRecognizer(
    columnRef,
    () => new TapGestureRecognizer({name: 'wheel-tap'}),
    recognizer => {
      if (recognizer.state !== 'ended' || caughtRef.current) {
        return;
      }
      const column = columnRef.current;
      if (column == null) {
        return;
      }
      const box = column.getBoundingClientRect();
      const {y} = recognizer.location();
      const offset = motion.offset();
      const currentLayout = latestRef.current.layout;
      const target = rowAtPoint(
        y - (box.top + box.height / 2),
        offset,
        currentLayout,
      );
      if (target == null || target === nearestIndex(offset, currentLayout)) {
        return;
      }
      // On a loop the tapped row can be a copy: the wheel turns onto it, as
      // UIKit's does.
      cover(nearestIndex(offset, currentLayout), target);
      move(turnCurve(columnRef.current, offset, target * ROW_HEIGHT), {
        onEnd,
      });
    },
    {isEnabled: isActive},
  );

  // Keep the finger, and the pointer it lands with: inside a BottomSheet the
  // sheet would otherwise read a downward drag here as swipe-to-dismiss. This
  // wheel pans through the gesture system, which never cancels the pointer
  // the sheet armed on (see useOwnScrollGesture).
  useOwnScrollGesture(columnRef, 'all', {
    isEnabled: isActive,
    isPointerKept: true,
  });

  // A spin turns only onto an enabled row (canSpinTo). So its arrival commits
  // that row, and nothing turns on past it. It reports the row it was asked
  // for, as the scrolling column does.
  const spinTo = useCallback(
    async (index: number): Promise<boolean> =>
      new Promise(resolve => {
        if (!canSpinTo(latestRef.current.options, index)) {
          resolve(false);
          return;
        }
        const offset = motion.offset();
        const currentLayout = latestRef.current.layout;
        const target = nearestPosition(index, offset, currentLayout);
        // The owner commits this row: on a loop it becomes the committed copy.
        committedRef.current = target;
        cover(nearestIndex(offset, currentLayout), target);
        move(turnCurve(columnRef.current, offset, target * ROW_HEIGHT), {
          onEnd: (outcome, end) => {
            if (outcome === 'arrived') {
              arrive(end);
            }
            resolve(outcome === 'arrived');
          },
        });
      }),
    [motion, move, arrive, cover],
  );

  useImperativeHandle(ref, () => ({spinTo}), [spinTo]);

  // A key or a click turns the wheel from `offset` onto `position` and
  // commits that row at once. On a loop the strip first moves the target's lap
  // onto its own rows, as a rest does. The turn starts before the commit, so a
  // value the owner clamps turns the wheel on from it (`spinTo`).
  const turnToPosition = useCallback(
    (position: number, offset: number) => {
      const current = latestRef.current;
      const count = current.options.length;
      const option = optionReader()(position);
      const shift =
        current.layout.looping && count > 0
          ? position - mod(position, count)
          : 0;
      const from = offset - shift * ROW_HEIGHT;
      const to = position - shift;
      if (shift !== 0) {
        motion.setOffset(from);
      }
      committedRef.current = to;
      cover(nearestIndex(from, current.layout), to);
      move(turnCurve(columnRef.current, from, to * ROW_HEIGHT));
      commit(option);
    },
    [motion, move, cover, commit, optionReader],
  );

  const moveBy = useCallback(
    (delta: number) => {
      const current = latestRef.current;
      if (current.options.length === 0 || delta === 0) {
        return;
      }
      // Keys step from the row the wheel is heading to, not the one it is
      // passing: two quick presses move two rows. A key with nowhere to go
      // leaves a turn in flight to finish on its row.
      if (current.layout.looping) {
        const optionAt = optionReader();
        const heading = nearestIndex(motion.target(), current.layout);
        const travel = loopedStep(
          at => isEnabledOption(optionAt(at)),
          heading,
          delta,
          current.options.length,
        );
        if (travel == null) {
          return;
        }
        const offset = motion.isMoving() ? motion.stop() : motion.offset();
        turnToPosition(heading + travel, offset);
        return;
      }
      const row = steppedIndex(
        current.options,
        nearestIndex(motion.target(), current.layout),
        delta,
      );
      if (row == null) {
        return;
      }
      const offset = motion.isMoving() ? motion.stop() : motion.offset();
      turnToPosition(row, offset);
    },
    [motion, turnToPosition, optionReader],
  );

  // A mouse wheel's notch turns the wheel one row, as an arrow key does, with
  // no coast. The gesture host leaves a notch to what is under the pointer,
  // which is this wheel. A wheel the pan took arrives here already prevented.
  // A ctrl-wheel stays the page's zoom, and a sideways scroll stays the
  // page's.
  useEffect(() => {
    const column = columnRef.current;
    if (column == null || !isActive) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.shiftKey ||
        event.deltaY === 0 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        scrollTypeOf(event) !== 'discrete'
      ) {
        return;
      }
      event.preventDefault();
      moveBy(Math.sign(event.deltaY));
    };
    column.addEventListener('wheel', onWheel, {passive: false});
    return () => column.removeEventListener('wheel', onWheel);
  }, [isActive, moveBy]);

  // Home and End: the first and the last enabled row. On a loop they are the
  // rows of the committed row's lap, so they never pass the seam.
  const moveToEnd = useCallback(
    (end: 'first' | 'last') => {
      const current = latestRef.current;
      const row = endIndex(current.options, end);
      if (row == null) {
        return;
      }
      const offset = motion.isMoving() ? motion.stop() : motion.offset();
      turnToPosition(
        lapPosition(row, committedRef.current, current.layout),
        offset,
      );
    },
    [motion, turnToPosition],
  );

  // A click on a row commits it at once and turns the wheel there, as the arrow
  // keys do. The click comes from assistive technology, a keyboard, a test, or
  // a mouse the tap recognizer did not take. A finger's tap is the tap
  // recognizer's, and the click it would produce is swallowed by the gesture
  // system.
  const activateRow = useCallback(
    (row: number) => {
      // A click names a value: on a loop, the row of the committed row's lap,
      // never across the seam.
      const target = lapPosition(
        row,
        committedRef.current,
        latestRef.current.layout,
      );
      if (!isEnabledOption(optionReader()(target))) {
        return;
      }
      const offset = motion.isMoving() ? motion.stop() : motion.offset();
      turnToPosition(target, offset);
    },
    [motion, turnToPosition, optionReader],
  );

  const {listboxProps, optionProps} = useWheelListbox({
    label,
    options,
    value,
    // The committed row: a value set from outside shows in the same render.
    activeIndex: selectedIndex,
    stepBy: moveBy,
    toEnd: moveToEnd,
    activate: activateRow,
  });

  return (
    <div
      ref={columnRef}
      {...listboxProps}
      data-wheel=""
      {...stylex.props(styles.column, focusOutlineStyles.focusVisible)}>
      <div data-wheel-fade="" {...stylex.props(styles.fade)}>
        <div aria-hidden="true" {...stylex.props(styles.band)} />
        <div
          ref={attachStrip}
          data-wheel-strip=""
          {...stylex.props(styles.strip)}>
          {options.map((option, index) => (
            <div
              key={option.value}
              {...optionProps(option, index)}
              data-wheel-row=""
              data-label={option.label}
              {...stylex.props(
                styles.row,
                styles.rowAt(`${index * ROW_HEIGHT}px`),
                index === selectedIndex && styles.rowActive,
                option.isDisabled && styles.rowDisabled,
              )}>
              {option.label}
            </div>
          ))}
          {loops && (
            // The copies, drawn directly: assistive technology meets each
            // value once, on the wheel's own row.
            <div ref={copiesRef} aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

PickerWheel.displayName = 'PickerWheel';

/**
 * The position of the row under a point `dy` px below the band's centre. It is
 * null past either end of a list that does not loop.
 */
function rowAtPoint(
  dy: number,
  offset: number,
  layout: WheelLayout,
): number | null {
  const position = Math.round((offset + dy) / layout.rowHeight);
  if (!layout.looping && (position < 0 || position >= layout.rowCount)) {
    return null;
  }
  return position;
}

/**
 * The finger's offset for a shown one. Past an end, it is the travel that the
 * rubber band shows as `shown`. So a drag that starts in a bounce continues
 * without a jump.
 */
function fingerOffset(shown: number, layout: WheelLayout): number {
  const {min, max} = offsetBounds(layout);
  const dimension = RUBBER_BAND_DIMENSION;
  if (shown < min) {
    return min + rubberBandInverse(shown - min, dimension);
  }
  if (shown > max) {
    return max + rubberBandInverse(shown - max, dimension);
  }
  return shown;
}
