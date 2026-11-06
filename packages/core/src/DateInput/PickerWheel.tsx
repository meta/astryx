// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PickerWheel.tsx
 * @input Wheel's props (wheelOptions.ts): options, value and change callback;
 *   optionally a ref for programmatic turns
 * @output PickerWheel: one picker column that moves like UIPickerView
 * @position Internal component; the Wheel under a finger (Wheel.tsx picks it)
 *
 * It moves on the gesture system and the shared animator, not on a native
 * scroller. One strip holds the rows and is the only element that moves.
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
  nearestEnabledIndex,
  steppedIndex,
  WHEEL_ROW_HEIGHT,
  type WheelProps,
} from './wheelOptions';

/** Row pitch, px: the touch column keeps the scrolling column's pitch. */
const ROW_HEIGHT = WHEEL_ROW_HEIGHT;
/** UIKit's picker measures scaled to that pitch (UIKit's row is 32 pt). */
const UIKIT_SCALE = ROW_HEIGHT / picker.geometry.rowHeight;
/** UIKit's rubber band dimension for the picker's table, at that pitch. */
const RUBBER_BAND_DIMENSION = picker.geometry.rubberBandDimension * UIKIT_SCALE;

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

interface DragState {
  /** The finger's offset at the pan's start, before any rubber band. */
  readonly start: number;
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
}: WheelProps) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const rowCount = options.length;
  const layout = useMemo<WheelLayout>(
    () => ({rowHeight: ROW_HEIGHT, rowCount}),
    [rowCount],
  );
  const [motion] = useState(() => createWheelStrip(layout));
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  const dragRef = useRef<DragState | null>(null);
  /** A finger landed on a moving wheel and stopped it. */
  const caughtRef = useRef(false);

  // The latest props, for the motion's and the gesture listeners' callbacks,
  // which are attached once and outlive a render.
  const latestRef = useRef({options, value, onChange, layout});
  useIsomorphicLayoutEffect(() => {
    latestRef.current = {options, value, onChange, layout};
  });

  // The row under the band is marked as the scrolling column marks it. At rest
  // that is the committed row, styled in render. While a finger drags the
  // wheel, the row reaching the band is painted directly, so marking it never
  // re-renders. A motion unmarks every row as it starts and marks the row it
  // stops or ends on. The compositor then plays it with no layout or paint per
  // frame, and no mark rides away from the band.
  const paintedRef = useRef<Set<HTMLElement>>(new Set());
  const paintRow = useCallback((position: number | null) => {
    const container = rowsRef.current;
    if (container == null || container.children.length === 0) {
      return;
    }
    const rows = container.children;
    const {options: currentOptions, value: currentValue} = latestRef.current;
    const active =
      position == null
        ? null
        : ((rows[position] as HTMLElement | undefined) ?? null);
    const painted = paintedRef.current;
    for (const row of painted) {
      row.style.removeProperty('color');
      row.style.removeProperty('font-weight');
    }
    painted.clear();
    const selected = currentOptions.findIndex(
      option => option.value === currentValue,
    );
    if (rows[selected] != null && rows[selected] !== active) {
      // The committed row's own mark gives way while another row is under
      // the band.
      const row = rows[selected] as HTMLElement;
      row.style.color = currentOptions[selected]?.isDisabled
        ? colorVars['--color-text-disabled']
        : colorVars['--color-text-primary'];
      row.style.fontWeight = fontWeightVars['--font-weight-normal'];
      painted.add(row);
    }
    if (active == null || position == null) {
      return;
    }
    active.style.color = currentOptions[position]?.isDisabled
      ? colorVars['--color-text-disabled']
      : colorVars['--color-text-accent'];
    active.style.fontWeight = fontWeightVars['--font-weight-semibold'];
    painted.add(active);
  }, []);

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

  // The wheel came to rest at `offset`: commit, or turn on to the row the
  // rest rule names first.
  const arrive = useCallback(
    (offset: number) => {
      const current = latestRef.current;
      const row = nearestIndex(offset, current.layout);
      const committed = current.options.findIndex(
        option => option.value === current.value,
      );
      // A rest on the committed row is not a stop to correct. A committed value
      // outside the bounds stays until a person moves the wheel off it, as in
      // the scrolling column.
      let step = 0;
      if (row !== committed) {
        step =
          nearestEnabledIndex(current.options, row, Math.max(0, committed)) -
          row;
      }
      if (step !== 0) {
        const target = row + step;
        move(turnCurve(columnRef.current, offset, target * ROW_HEIGHT), {
          onEnd: (outcome, end) => {
            if (outcome === 'arrived') {
              arrive(end);
            }
          },
        });
        return;
      }
      const option = current.options[row];
      if (
        option != null &&
        !option.isDisabled &&
        option.value !== current.value
      ) {
        current.onChange(option.value);
      }
    },
    [move],
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
    const target = selectedIndex * ROW_HEIGHT;
    const shown = motion.isMoving() ? motion.stop() : motion.offset();
    const isAway = Math.abs(shown - target) > 0.01;
    if (isAway && parkedRef.current) {
      // The turn's own end paints the band's row.
      const turn = {};
      parkTurnRef.current = turn;
      move(turnCurve(columnRef.current, shown, target), {
        onEnd: () => {
          if (parkTurnRef.current === turn) {
            parkTurnRef.current = null;
          }
        },
      });
      return;
    }
    if (isAway) {
      motion.setOffset(target);
    }
    parkedRef.current = true;
  }, [isActive, selectedIndex, motion, move]);

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
      const plan = planRelease(
        motion.offset(),
        velocity,
        latestRef.current.layout,
        resolveMotion(columnRef.current, scroll.bounce),
      );
      move(plan.curve, {
        ticks: true,
        onEnd,
        touchRelease: true,
        momentum: plan.kind === 'coast' || plan.kind === 'edge',
      });
    },
    [motion, move, onEnd],
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
          motion.setOffset(
            dragOffset(drag.start - recognizer.translation().y, currentLayout),
            {ticks: true},
          );
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
        move(turnCurve(columnRef.current, offset, index * ROW_HEIGHT), {
          onEnd: (outcome, end) => {
            if (outcome === 'arrived') {
              arrive(end);
            }
            resolve(outcome === 'arrived');
          },
        });
      }),
    [motion, move, arrive],
  );

  useImperativeHandle(ref, () => ({spinTo}), [spinTo]);

  const turnToPosition = useCallback(
    (position: number, offset: number) => {
      const current = latestRef.current;
      const option = current.options[position];
      if (option.value !== current.value) {
        current.onChange(option.value);
      }
      move(turnCurve(columnRef.current, offset, position * ROW_HEIGHT));
    },
    [move],
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
    [motion, turnToPosition],
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

  // Home and End: the first and the last enabled row.
  const moveToEnd = useCallback(
    (end: 'first' | 'last') => {
      const row = endIndex(latestRef.current.options, end);
      if (row == null) {
        return;
      }
      const offset = motion.isMoving() ? motion.stop() : motion.offset();
      turnToPosition(row, offset);
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
      const current = latestRef.current;
      const option = current.options[row];
      if (option == null || option.isDisabled) {
        return;
      }
      const offset = motion.isMoving() ? motion.stop() : motion.offset();
      if (option.value !== current.value) {
        current.onChange(option.value);
      }
      move(turnCurve(columnRef.current, offset, row * ROW_HEIGHT));
    },
    [motion, move],
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
        </div>
      </div>
    </div>
  );
}

PickerWheel.displayName = 'PickerWheel';

/**
 * The row under a point `dy` px below the band's centre, or null past either
 * end of the list.
 */
function rowAtPoint(
  dy: number,
  offset: number,
  layout: WheelLayout,
): number | null {
  const position = Math.round((offset + dy) / layout.rowHeight);
  if (position < 0 || position >= layout.rowCount) {
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
