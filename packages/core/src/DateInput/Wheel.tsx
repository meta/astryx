// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Wheel.tsx
 * @input Option list, selected value, change callback
 * @output Exports Wheel — a snap-scrolling picker column
 * @position Internal component; consumed by MonthYearWheels.tsx
 *
 * A wheel is a scroll container, not a custom gesture surface. Momentum,
 * rubber-banding, and the settle animation are the platform's; all this adds
 * is `scroll-snap-align: center` on each option, half a viewport of padding at
 * each end so the first and last option can reach the middle, and a commit
 * when the scrolling stops.
 *
 * The falloff (rows fading and tipping away from the centre) is a CSS
 * scroll-driven animation on a `view()` timeline — the browser interpolates it
 * against each row's own position in the scrollport, so it stays glued to the
 * finger with no JS in the frame loop. It is guarded by `@supports`, because a
 * browser that does not understand `animation-timeline` would otherwise run
 * the same keyframes on the document timeline and simply play them once.
 *
 * Accessibility: this is a listbox, not a novel widget. It is one tab stop
 * with arrow/Home/End/PageUp/PageDown keys, `aria-activedescendant` tracking
 * the active row, and every row reachable by tap — none of which depends on
 * the scroll-driven decoration.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/TouchDateField.tsx
 * - /packages/core/src/DateTimeInput/TouchDateTimeField.tsx
 * - /packages/core/src/DateInput/DateInput.doc.mjs
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
  spacingVars,
  durationVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils';
import {dateInputTouchSizes, dateInputTouchGeometry} from './tokens.stylex';
import {useOwnScrollGesture} from './useOwnScrollGesture';
import {usePointerDragScroll} from './usePointerDragScroll';
import {useScrollSettle} from './useScrollSettle';

const ITEM_BLOCK_SIZE = dateInputTouchSizes.wheelItemSize;

/**
 * Rows tip away from the centre of the wheel. 0% is a row just entering at the
 * bottom of the scrollport, 50% is a row centred in it, 100% is a row leaving
 * at the top — which is what a `view()` timeline over the `cover` range means,
 * and why this reads as a cylinder rotating under the finger.
 */
const falloff = stylex.keyframes({
  '0%': {
    opacity: 0.3,
    transform: 'rotateX(52deg) scale(0.86)',
  },
  '50%': {
    opacity: 1,
    transform: 'rotateX(0deg) scale(1)',
  },
  '100%': {
    opacity: 0.3,
    transform: 'rotateX(-52deg) scale(0.86)',
  },
});

/** Motion-free equivalent: the depth cue survives as opacity alone. */
const fadeOnly = stylex.keyframes({
  '0%': {opacity: 0.3},
  '50%': {opacity: 1},
  '100%': {opacity: 0.3},
});

const styles = stylex.create({
  column: {
    position: 'relative',
    flex: '1 1 0',
    minWidth: 0,
  },
  scroller: {
    blockSize: dateInputTouchGeometry.paneBlockSize,
    // Load-bearing, and stated rather than inherited from the reset (whose
    // rule is zero-specificity `:where`): with content-box the end padding
    // below would be added to the scrollport instead of sitting inside it,
    // and every snap position would be wrong.
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
    // Snap every row to the middle of the scrollport, where the selection band
    // sits. `mandatory` (not `proximity`) because a wheel has no valid resting
    // position between two options.
    scrollSnapType: 'y mandatory',
    overscrollBehavior: 'contain',
    // Room for row 0 and row n-1 to reach the centre.
    paddingBlock: dateInputTouchGeometry.wheelEdgePadding,
    // Gives the rotateX falloff somewhere to recede to.
    perspective: '520px',
    transformStyle: 'preserve-3d',
    scrollbarWidth: 'none',
    outline: 'none',
    // Vertical pans scroll the wheel; a two-finger pinch stays the page's, so
    // the page can still zoom over an open picker (WCAG 1.4.4), as it does
    // over the menus and listboxes (`module:DropdownMenu/useMenuPress` FR4).
    touchAction: 'pan-y pinch-zoom',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    blockSize: ITEM_BLOCK_SIZE,
    paddingInline: spacingVars['--spacing-2'],
    scrollSnapAlign: 'center',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    // Larger than body text, and larger than the calendar's day numbers: on
    // a wheel the value under the band is the whole interface, and the rows
    // above and below are read at a glance while moving.
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-primary'],
    whiteSpace: 'nowrap',
    // NO `overflow: hidden` here. It would make the row itself a scroll
    // container, and `view()` binds to the subject's nearest ancestor scroll
    // container — the falloff would measure the row against itself and sit
    // frozen at 50% forever. Clipping belongs on the inner element.
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
    transitionProperty: 'color, font-weight',
    transitionDuration: durationVars['--duration-fast'],
  },
  /**
   * The falloff rides an inner element, never the row itself.
   *
   * A snap area is the element's TRANSFORMED border box, so animating the row
   * would move the very positions the scroller is snapping to — the wheel
   * settles a few pixels off, and the offset feeds back into the animation.
   * Transforming a child leaves the row's box, and every snap offset, exact.
   */
  itemInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '100%',
    blockSize: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // The wheel look. Held behind @supports so browsers without scroll-driven
    // animations get a plain, fully legible list instead of these keyframes
    // playing themselves out once on the document timeline. Under reduced
    // motion the same timeline drives opacity only — the depth cue survives,
    // the tipping does not.
    animationName: {
      default: null,
      '@supports (animation-timeline: view())': {
        default: falloff,
        '@media (prefers-reduced-motion: reduce)': fadeOnly,
      },
    },
    animationTimeline: 'view(y)',
    animationRange: 'cover 0% cover 100%',
    animationFillMode: 'both',
    animationDuration: 'auto',
    animationTimingFunction: 'linear',
    backfaceVisibility: 'hidden',
  },
  itemActive: {
    color: colorVars['--color-text-accent'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  itemDisabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
  },
  /**
   * The selection band: a single centred row-height plate behind the options.
   * Purely decorative — the committed value is announced by `aria-selected`.
   */
  band: {
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: `calc(50% - (${ITEM_BLOCK_SIZE} / 2))`,
    blockSize: ITEM_BLOCK_SIZE,
    borderRadius: radiusVars['--radius-element'],
    // `--color-neutral`, not `--color-background-muted`. Muted is 4.7% alpha,
    // which puts the whole plate 17 units of colour away from the sheet
    // behind it — so when the wheels fade in, the band's animation has 17
    // units to happen in while the text beside it travels 412. It did not
    // read as fading, it read as appearing. Neutral is 10%, which doubles the
    // range to 36 and is still quiet enough to sit under text.
    backgroundColor: colorVars['--color-neutral'],
    pointerEvents: 'none',
  },
});

export interface WheelOption {
  /** Stable numeric identity of the row (a month 1-12, or a year). */
  value: number;
  /** Row text. */
  label: string;
  /** Rows outside min/max stay visible but cannot be committed. */
  isDisabled?: boolean;
}

export interface WheelProps {
  /** Accessible name for the column, e.g. "Month". */
  label: string;
  /** Rows, top to bottom. */
  options: ReadonlyArray<WheelOption>;
  /** Committed value; must match one option's `value`. */
  value: number;
  /** Fired when the wheel comes to rest on a different, enabled row. */
  onChange: (value: number) => void;
  /**
   * False while the wheel is hidden — scroll offsets of a display:none
   * scroller are meaningless, so listeners and the initial scroll wait.
   */
  isActive?: boolean;
}

/**
 * One snap-scrolling picker column.
 *
 * @example
 * ```
 * <Wheel
 *   label="Month"
 *   options={monthOptions}
 *   value={month}
 *   onChange={setMonth}
 * />
 * ```
 */
export function Wheel({
  label,
  options,
  value,
  onChange,
  isActive = true,
}: WheelProps) {
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  // Which row is under the band right now. Tracks the finger during a scroll;
  // `selectedIndex` only catches up when the wheel settles.
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  // Row height in px, read from layout rather than assumed, so a theme that
  // retunes --date-input-touch-wheel-item-size still lands on the right row.
  const itemBlockSize = useCallback((): number => {
    const first = scrollerRef.current?.firstElementChild;
    return first instanceof HTMLElement && first.offsetHeight > 0
      ? first.offsetHeight
      : 0;
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      const scroller = scrollerRef.current;
      const size = itemBlockSize();
      if (scroller == null || size === 0) {
        return;
      }
      scroller.scrollTo({top: index * size, behavior});
    },
    [itemBlockSize],
  );

  // Commit on rest. A disabled row is bounced back to the committed one
  // rather than silently keeping a value the wheel is not showing.
  //
  // Declared here, above the park effect, because that effect consults the
  // `isAtRestRef` this returns before it repositions anything.
  const {isAtRestRef} = useScrollSettle(
    scrollerRef,
    scroller => {
      const size = itemBlockSize();
      if (size === 0) {
        return;
      }
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(scroller.scrollTop / size)),
      );
      const option = options[index];
      if (option == null || option.isDisabled) {
        scrollToIndex(selectedIndex, 'smooth');
        return;
      }
      if (option.value !== value) {
        onChange(option.value);
      }
    },
    isActive,
  );

  // Park the committed row under the band whenever the wheel is shown, or the
  // value is changed from outside (the calendar scrolled to another month).
  //
  // NEVER while the wheel is still moving. A scroller that is mid-gesture or
  // still carrying momentum is the user's, and repositioning it does not stop
  // the momentum — on iOS it feeds a cycle where the scroll this causes reads
  // as a new settle, commits the next row along, and parks again. See
  // useScrollSettle. The settle handler re-checks the position afterwards, so
  // a correction that is genuinely needed still happens, just at rest.
  useEffect(() => {
    if (!isActive || !isAtRestRef.current) {
      return;
    }
    const size = itemBlockSize();
    const scroller = scrollerRef.current;
    if (scroller == null || size === 0) {
      return;
    }
    if (Math.round(scroller.scrollTop / size) !== selectedIndex) {
      scroller.scrollTo({top: selectedIndex * size, behavior: 'auto'});
    }
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- the highlight follows a scroll position, which only exists after layout
    setActiveIndex(selectedIndex);
  }, [isActive, selectedIndex, itemBlockSize, isAtRestRef]);

  // Highlight follows the finger. rAF-throttled: a scroll can fire far more
  // often than the display refreshes, and this only feeds a repaint.
  const frameRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller == null || !isActive) {
      return;
    }
    const onScroll = () => {
      if (frameRef.current != null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined;
        const size = itemBlockSize();
        if (size === 0) {
          return;
        }
        const index = Math.min(
          options.length - 1,
          Math.max(0, Math.round(scroller.scrollTop / size)),
        );
        setActiveIndex(index);
      });
    };
    scroller.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
    };
  }, [isActive, options.length, itemBlockSize]);

  // Keep the finger. Inside a BottomSheet the sheet would otherwise read a
  // downward drag here as swipe-to-dismiss; see useOwnScrollGesture. Gated on
  // isActive because the hidden panel keeps its layout box.
  // 'all': a wheel scrolls vertically, the same axis the sheet wants, so
  // there is no way to share — it takes every touch that lands on it.
  useOwnScrollGesture(scrollerRef, 'all', {isEnabled: isActive});

  // A mouse cannot drag a scroll container, so without this the wheel ignores
  // the one gesture its shape invites. Touch is untouched — it pans natively,
  // with momentum this could not match. See usePointerDragScroll.
  usePointerDragScroll(scrollerRef, isActive);

  const moveBy = useCallback(
    (delta: number) => {
      const next = Math.min(
        options.length - 1,
        Math.max(0, activeIndex + delta),
      );
      const option = options[next];
      if (option == null || option.isDisabled) {
        return;
      }
      setActiveIndex(next);
      scrollToIndex(next, 'smooth');
      if (option.value !== value) {
        onChange(option.value);
      }
    },
    [activeIndex, options, scrollToIndex, value, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveBy(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveBy(-1);
          break;
        case 'PageDown':
          event.preventDefault();
          moveBy(10);
          break;
        case 'PageUp':
          event.preventDefault();
          moveBy(-10);
          break;
        case 'Home':
          event.preventDefault();
          moveBy(-activeIndex);
          break;
        case 'End':
          event.preventDefault();
          moveBy(options.length - 1 - activeIndex);
          break;
        default:
          break;
      }
    },
    [moveBy, activeIndex, options.length],
  );

  return (
    <div {...stylex.props(styles.column)}>
      <div aria-hidden="true" {...stylex.props(styles.band)} />
      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${options[activeIndex]?.value}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        {...stylex.props(styles.scroller, focusOutlineStyles.focusVisible)}>
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${id}-${option.value}`}
            role="option"
            aria-selected={option.value === value}
            aria-disabled={option.isDisabled || undefined}
            onClick={() => {
              if (option.isDisabled) {
                return;
              }
              setActiveIndex(index);
              scrollToIndex(index, 'smooth');
              if (option.value !== value) {
                onChange(option.value);
              }
            }}
            {...stylex.props(
              styles.item,
              index === activeIndex && styles.itemActive,
              option.isDisabled && styles.itemDisabled,
            )}>
            <span {...stylex.props(styles.itemInner)}>{option.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Wheel.displayName = 'Wheel';
