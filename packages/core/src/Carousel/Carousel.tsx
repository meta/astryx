// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Carousel.tsx
 * @input Uses React, StyleX, useScrollOverflow, useLayer, Button, Icon, theme tokens
 * @output Exports Carousel component
 * @position Horizontal scroll container with fade-edge overflow indication,
 *   optional prev/next buttons on the top layer, scroll-snap, a 1px
 *   visual bleed allowance for child selection indicators, and Shift + wheel
 *   mapping so mouse users can scroll horizontally. Supports optional
 *   wrap-around looping and an imperative handle (handleRef) for programmatic
 *   scroll control. Exposes APG
 *   carousel semantics: the root is a labelled region with
 *   aria-roledescription="carousel" and each item wrapper is a group with
 *   aria-roledescription="slide" named "Slide N of M". The scroll area is a
 *   group named like the carousel and a tab stop only while its content
 *   overflows (AST-025 FR12).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Carousel/index.ts (exports)
 * - /apps/storybook/stories/Carousel.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Carousel/ (showcase blocks)
 */

import {
  type ReactNode,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  Children,
  isValidElement,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  spacingVars,
  colorVars,
  shadowVars,
  radiusVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {useLayer} from '../Layer';
import {useScrollOverflow} from '../hooks/useScrollOverflow';
import {isRtlElement} from '../hooks/isRtlElement';
import type {BaseProps} from '../BaseProps';
import {mergeProps, rtlStyles} from '../utils';
import type {SpacingStep} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
/**
 * Imperative control surface for the Carousel, accessed via the `handleRef`
 * prop. Methods drive the same native-scroll machinery as the built-in
 * buttons, so they respect RTL, reduced-motion, and `hasLoop`.
 */
export interface CarouselHandle {
  /**
   * Scroll forward by roughly one viewport. With `hasLoop`, wraps to the
   * start once the end is reached.
   */
  scrollNext(): void;
  /**
   * Scroll backward by roughly one viewport. With `hasLoop`, wraps to the
   * end once the start is reached.
   */
  scrollPrev(): void;
  /**
   * Scroll the item at the given 0-based index to the start edge. The index
   * is clamped to the item range, and only the carousel scrolls — the page
   * position is left untouched.
   */
  scrollTo(index: number): void;
  /**
   * Whether there is scrollable content past the trailing edge. With
   * `hasLoop`, returns true whenever the content overflows, since wrapping
   * is always available. Reads live state — safe to call in an event handler.
   */
  canScrollNext(): boolean;
  /**
   * Whether there is scrollable content past the leading edge. With
   * `hasLoop`, returns true whenever the content overflows. Reads live state.
   */
  canScrollPrev(): boolean;
}

export interface CarouselProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Imperative handle for programmatic scroll control. Exposes scrollNext,
   * scrollPrev, scrollTo, and the canScrollNext/canScrollPrev queries.
   */
  handleRef?: React.Ref<CarouselHandle>;
  /** Carousel items — rendered in a horizontal scroll container. */
  children: ReactNode;
  /**
   * Gap between items using spacing scale tokens.
   * @default 1
   */
  gap?: 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4;
  /**
   * Show prev/next navigation buttons when content is scrollable.
   * @default true
   */
  hasButtons?: boolean;
  /**
   * Show gradient edge-fade mask when content overflows, signalling that
   * more items exist off-screen. Can be suppressed when items have
   * full-fidelity surfaces that look broken when masked.
   * @default true
   */
  hasEdgeFade?: boolean;
  /**
   * Enable wrap-around scrolling. When the content overflows, pressing Next
   * at the end scrolls back to the start, and Prev at the start scrolls to
   * the end — for both the built-in buttons and the imperative handle. The
   * navigation buttons stay visible at both edges instead of hiding, since a
   * scroll is always available. Has no effect when the content fits without
   * overflowing.
   * @default false
   */
  hasLoop?: boolean;
  /**
   * Enable scroll-snap on items. Each direct child snaps to the start edge.
   * @default false
   */
  hasSnap?: boolean;
  /**
   * Inline padding on the scroll container. Applied as padding-inline
   * so the gutter is inside the scrollable area — items can scroll fully
   * into the padded region. Also sets matching scroll-padding so snap
   * points align to the content edge rather than the viewport edge.
   *
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * @default undefined (no padding)
   */
  padding?: SpacingStep;
  /**
   * Accessible label for the carousel region.
   * @default 'Carousel'
   */
  'aria-label'?: string;
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'clip',
    overflowClipMargin: '1px',
  },
  scroller: {
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto',
    overflowY: 'hidden',
    /* eslint-disable @astryx/no-hardcoded-styles -- 1px bleed for tab indicator; no token at this size */
    paddingBottom: '1px',
    marginBottom: '-1px',
    /* eslint-enable @astryx/no-hardcoded-styles */
    overscrollBehaviorX: 'contain',
    scrollBehavior: {
      default: 'smooth',
      '@media (prefers-reduced-motion: reduce)': 'auto',
    },
    scrollbarWidth: 'none',
    maskImage: 'none',
  },
  fadeStart: {
    maskImage: {
      default: `linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 2px, black ${spacingVars['--spacing-1']})`,
      ':is([dir="rtl"] *)': `linear-gradient(to left, transparent 0%, rgba(0,0,0,0.3) 2px, black ${spacingVars['--spacing-1']})`,
    },
  },
  fadeEnd: {
    maskImage: {
      default: `linear-gradient(to left, transparent 0%, rgba(0,0,0,0.3) 2px, black ${spacingVars['--spacing-1']})`,
      ':is([dir="rtl"] *)': `linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 2px, black ${spacingVars['--spacing-1']})`,
    },
  },
  fadeBoth: {
    maskImage: `linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 2px, black ${spacingVars['--spacing-1']}, black calc(100% - ${spacingVars['--spacing-1']}), rgba(0,0,0,0.3) calc(100% - 2px), transparent 100%)`,
  },
  snap: {
    scrollSnapType: 'x mandatory',
  },
  item: {
    scrollSnapAlign: 'start',
    display: 'flex',
    flexShrink: 0,
  },
  // Overlay on top layer — covers the carousel anchor area
  buttonOverlay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  buttonPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-full'],
    boxShadow: shadowVars['--shadow-med'],
    pointerEvents: 'auto',
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  buttonPillStart: {
    transform: {
      default: 'translateX(-50%)',
      ':is([dir="rtl"] *)': 'translateX(50%)',
    },
  },
  buttonPillEnd: {
    transform: {
      default: 'translateX(50%)',
      ':is([dir="rtl"] *)': 'translateX(-50%)',
    },
  },
  buttonHidden: {
    opacity: 0,
    pointerEvents: 'none' as const,
  },
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/consistent-type-assertions -- CSS custom property requires type widening for StyleX
  buttonRadiusOverride: {
    '--_button-radius': radiusVars['--radius-full'],
  } as Record<string, string>,
});

const gapStyles = stylex.create({
  0: {gap: spacingVars['--spacing-0']},
  0.5: {gap: spacingVars['--spacing-0-5']},
  1: {gap: spacingVars['--spacing-1']},
  1.5: {gap: spacingVars['--spacing-1-5']},
  2: {gap: spacingVars['--spacing-2']},
  3: {gap: spacingVars['--spacing-3']},
  4: {gap: spacingVars['--spacing-4']},
});

const paddingStyles = stylex.create({
  0: {
    paddingInline: spacingVars['--spacing-0'],
    scrollPaddingInline: spacingVars['--spacing-0'],
  },
  0.5: {
    paddingInline: spacingVars['--spacing-0-5'],
    scrollPaddingInline: spacingVars['--spacing-0-5'],
  },
  1: {
    paddingInline: spacingVars['--spacing-1'],
    scrollPaddingInline: spacingVars['--spacing-1'],
  },
  1.5: {
    paddingInline: spacingVars['--spacing-1-5'],
    scrollPaddingInline: spacingVars['--spacing-1-5'],
  },
  2: {
    paddingInline: spacingVars['--spacing-2'],
    scrollPaddingInline: spacingVars['--spacing-2'],
  },
  3: {
    paddingInline: spacingVars['--spacing-3'],
    scrollPaddingInline: spacingVars['--spacing-3'],
  },
  4: {
    paddingInline: spacingVars['--spacing-4'],
    scrollPaddingInline: spacingVars['--spacing-4'],
  },
  5: {
    paddingInline: spacingVars['--spacing-5'],
    scrollPaddingInline: spacingVars['--spacing-5'],
  },
  6: {
    paddingInline: spacingVars['--spacing-6'],
    scrollPaddingInline: spacingVars['--spacing-6'],
  },
  8: {
    paddingInline: spacingVars['--spacing-8'],
    scrollPaddingInline: spacingVars['--spacing-8'],
  },
  10: {
    paddingInline: spacingVars['--spacing-10'],
    scrollPaddingInline: spacingVars['--spacing-10'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Horizontal scroll container with fade-edge overflow indication and
 * optional navigation buttons.
 *
 * Wraps any content in a scrollable row. When content overflows, gradient
 * fades appear at the edges to signal more items exist. When content overflows, prev/next buttons appear at the edges,
 * rendered on the top layer via Layer so they escape any parent overflow
 * clipping.
 *
 * @example
 * ```
 * <Carousel gap={1}>
 *   <Thumbnail src="/a.jpg" alt="A" />
 *   <Thumbnail src="/b.jpg" alt="B" />
 *   <Thumbnail src="/c.jpg" alt="C" />
 * </Carousel>
 * ```
 */
export function Carousel({
  ref,
  handleRef,
  children,
  gap = 1,
  hasButtons = true,
  hasEdgeFade = true,
  hasLoop = false,
  hasSnap = false,
  padding,
  'aria-label': ariaLabelFromProps,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...htmlProps
}: CarouselProps) {
  const t = useTranslator();
  const ariaLabel = ariaLabelFromProps ?? t('@astryx.carousel.label');
  const scrollElRef = useRef<HTMLElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  // Which nav button last held focus, and what the overflow state was on the
  // previous render. Together they are how the Effect below recognises the one
  // transition it is allowed to act on.
  const focusedNavRef = useRef<'start' | 'end' | null>(null);
  const prevCanScrollRef = useRef<{start: boolean; end: boolean} | null>(null);
  const {scrollRef, overflowStart, overflowEnd, hasOverflow} =
    useScrollOverflow();

  // Children.toArray drops null/undefined/boolean children and assigns
  // stable keys, so slide numbering ("Slide N of M") matches what actually
  // renders even when some children are conditionally omitted.
  const slides = Children.toArray(children);

  const layer = useLayer({
    mode: 'context',
    lightDismiss: false,
  });

  useEffect(() => {
    if (hasButtons) {
      layer.show();
    } else {
      layer.hide();
    }
  }, [hasButtons, layer]);

  const composedRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollElRef.current = el;
      scrollRef(el);
    },
    [scrollRef],
  );

  // Map Shift + vertical wheel to horizontal scroll. Trackpads emit
  // horizontal deltas natively, but a standard mouse only produces deltaY —
  // so mouse users can't wheel-scroll a horizontal container. Shift + wheel
  // is the long-established convention for horizontal scroll containers; we
  // honor it by translating the vertical delta into a horizontal scroll.
  //
  // Only kicks in when Shift is held and the wheel is purely vertical
  // (deltaX === 0), so native trackpad horizontal scrolling is untouched.
  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || event.deltaY === 0 || event.deltaX !== 0) {
      return;
    }
    const el = scrollElRef.current;
    if (!el) {
      return;
    }
    // Nothing to scroll horizontally — let the event fall through so the page
    // can scroll as it normally would.
    if (el.scrollWidth <= el.clientWidth) {
      return;
    }
    event.preventDefault();
    el.scrollBy({left: event.deltaY, behavior: 'auto'});
  }, []);

  const scrollBy = useCallback(
    (direction: -1 | 1) => {
      const el = scrollElRef.current;
      if (!el) {
        return;
      }
      // Respect the user's reduced-motion preference — mirrors the CSS
      // scroll-behavior override so button-driven scrolling doesn't animate
      // for users who opted out of motion.
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior = prefersReducedMotion ? 'auto' : 'smooth';
      // Under RTL the scroll axis is inverted (start is scrollLeft 0, the end
      // is negative), so flip the physical delta sign.
      const rtlSign = isRtlElement(el) ? -1 : 1;

      // Wrap-around: when looping over overflowing content, a press that would
      // run past an edge jumps to the opposite edge instead. Overshoot by the
      // full scroll width in the opposite logical direction and let the browser
      // clamp to the far edge — this reuses the same RTL sign convention as a
      // normal scroll, so it stays direction-correct without special-casing.
      if (hasLoop && hasOverflow) {
        const atEnd = direction === 1 && !overflowEnd;
        const atStart = direction === -1 && !overflowStart;
        if (atEnd || atStart) {
          el.scrollBy({left: rtlSign * -direction * el.scrollWidth, behavior});
          return;
        }
      }

      const firstChild = el.firstElementChild as HTMLElement | null;
      const itemWidth = firstChild ? firstChild.offsetWidth : 0;
      const amount = el.clientWidth - itemWidth * 0.5;
      el.scrollBy({
        // `direction` is the logical intent (-1 = toward content start, +1 =
        // toward content end).
        left: rtlSign * direction * Math.max(amount, itemWidth),
        behavior,
      });
    },
    [hasLoop, hasOverflow, overflowStart, overflowEnd],
  );

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollElRef.current;
    const items = el?.children;
    if (!el || !items || items.length === 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    const target = items[clamped] as HTMLElement;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Bring the item to the start edge by scrolling the container by the
    // measured gap between the item and the container edge. Using scrollBy
    // (not scrollIntoView) keeps the scroll contained to the carousel and
    // never moves ancestors or the page. In RTL the start edge is the right
    // edge, so align the trailing edges instead of the leading ones.
    const containerRect = el.getBoundingClientRect();
    const itemRect = target.getBoundingClientRect();
    const delta = isRtlElement(el)
      ? itemRect.right - containerRect.right
      : itemRect.left - containerRect.left;
    el.scrollBy({
      left: delta,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      scrollNext: () => scrollBy(1),
      scrollPrev: () => scrollBy(-1),
      scrollTo: (index: number) => scrollToIndex(index),
      // With loop, either direction is reachable whenever the content
      // overflows; otherwise reflect the live per-edge overflow state.
      canScrollNext: () => (hasLoop ? hasOverflow : overflowEnd),
      canScrollPrev: () => (hasLoop ? hasOverflow : overflowStart),
    }),
    [scrollBy, scrollToIndex, hasLoop, hasOverflow, overflowStart, overflowEnd],
  );

  // With loop, the buttons stay reachable at both edges as long as there's
  // something to scroll; without loop they follow the per-edge overflow state.
  const canScrollStart = hasLoop && hasOverflow ? true : overflowStart;
  const canScrollEnd = hasLoop && hasOverflow ? true : overflowEnd;

  // Keep the keyboard user where they are when a nav button disables under
  // them. The browser drops focus off a control it disables, so reaching an
  // edge used to land the user on <body> and cost them their place in the page.
  //
  // This is an Effect on purpose, and the exception is narrow. The thing that
  // disables the button IS this state transition, so it is the only correct
  // trigger: three attempts to predict it from the press -- the position after
  // the scroll, the position before it plus the step, and the settled position
  // reported by `scrollend` -- were each wrong somewhere, under reduced motion,
  // under mandatory scroll-snap, and on a browser that never fires the event.
  // Ruled acceptable by the
  // maintainer, 2026-08-27, on the conditions encoded below: it acts only on
  // the transition that newly disables the focused button, it moves focus and
  // nothing else, and it cannot fire twice for one transition.
  //
  // Which button the person is on is tracked by the buttons' own focus and blur
  // handlers, and the blur has to ignore the one the commit itself causes: a
  // tracker that outlived the person let a later edge -- a swipe, a resize, no
  // press at all -- pull their focus back onto a control they never chose.
  useEffect(() => {
    const previous = prevCanScrollRef.current;
    prevCanScrollRef.current = {start: canScrollStart, end: canScrollEnd};
    const side = focusedNavRef.current;
    if (previous == null || side == null) {
      return;
    }

    // Only the edge that just ran out, and only while it held focus. An edge
    // that was already disabled, or one the user was not on, is not ours.
    const wasEnabled = side === 'start' ? previous.start : previous.end;
    const isEnabled = side === 'start' ? canScrollStart : canScrollEnd;
    if (!wasEnabled || isEnabled) {
      return;
    }

    const pressed =
      side === 'start' ? startButtonRef.current : endButtonRef.current;
    if (pressed == null) {
      return;
    }
    // The browser has already blurred it, so focus reads as the body. Anything
    // else means the user moved on themselves and this is not ours to redirect.
    const active = pressed.ownerDocument.activeElement;
    if (active !== pressed && active !== pressed.ownerDocument.body) {
      return;
    }

    // The scroll area is the receiver (component:Carousel FR2). It takes focus
    // programmatically even when it is out of the tab order.
    const receiver = scrollElRef.current;
    if (receiver == null) {
      return;
    }

    // One move per transition: clearing the tracker first means a re-render or
    // a StrictMode double-invoke re-runs this and returns at the `side == null`
    // guard above.
    focusedNavRef.current = null;
    // preventScroll: a plain focus() scrolls its element into view, which on
    // the scroll container cancels the scroll the press just started.
    receiver.focus({preventScroll: true});
  }, [canScrollStart, canScrollEnd]);

  const fadeStyle = hasEdgeFade
    ? (hasLoop && hasOverflow) || (overflowStart && overflowEnd)
      ? styles.fadeBoth
      : overflowStart
        ? styles.fadeStart
        : overflowEnd
          ? styles.fadeEnd
          : null
    : null;

  // Self-authored position styles (positioning: 'custom' below): a cover
  // centered on the anchor, sized to it — direction-neutral by construction.
  const coverStyle: React.CSSProperties = {
    positionArea: 'center',
    width: 'anchor-size(width)',
    height: 'anchor-size(height)',
  };

  return (
    <div
      ref={useMergedRefs(ref, layer.ref as React.Ref<HTMLDivElement>)}
      data-testid={testId}
      {...htmlProps}
      {...mergeProps(
        themeProps('carousel'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      role="region"
      aria-label={ariaLabel}
      aria-roledescription="carousel">
      <div
        ref={composedRef}
        // The scroll area takes keyboard scrolling (spec:AST-025 FR12): a
        // group named like the carousel, in the tab order only while its
        // content overflows. While it fits it still takes focus
        // programmatically, for the edge buttons' hand-off (FR2).
        role="group"
        aria-label={ariaLabel}
        tabIndex={hasOverflow ? 0 : -1}
        onWheel={handleWheel}
        {...mergeProps(
          themeProps('carousel-scroller', {
            gap,
            padding,
            snap: hasSnap ? 'snap' : null,
            edgeFade: hasEdgeFade ? 'edge-fade' : null,
          }),
          stylex.props(
            styles.scroller,
            gapStyles[gap],
            padding != null && paddingStyles[padding],
            hasSnap && styles.snap,
            fadeStyle,
          ),
        )}>
        {slides.map((child, index) => (
          // APG carousel pattern: each slide container is a group with
          // aria-roledescription="slide" and an "N of M" accessible name so
          // ATs announce slide boundaries and position instead of anonymous
          // generics.
          <div
            // eslint-disable-next-line @eslint-react/no-array-index-key -- index fallback only applies to text/number children, which are positional by definition; elements keep their Children.toArray keys
            key={isValidElement(child) ? child.key : index}
            role="group"
            aria-roledescription="slide"
            aria-label={t('@astryx.carousel.slideLabel', {
              current: index + 1,
              total: slides.length,
            })}
            {...stylex.props(styles.item)}>
            {child}
          </div>
        ))}
      </div>

      {hasButtons &&
        layer.render(
          <>
            <div
              {...stylex.props(
                styles.buttonPill,
                styles.buttonPillStart,
                !canScrollStart && styles.buttonHidden,
              )}>
              <Button
                ref={startButtonRef}
                icon={
                  <Icon
                    icon="chevronLeft"
                    size="xsm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                label={t('@astryx.carousel.scrollLeft')}
                variant="ghost"
                size="sm"
                isIconOnly
                // Disabled when there's nothing to scroll toward. Keeps the
                // button mounted (stable layout) but removes it from the tab
                // order and a11y tree while it's visually hidden, so keyboard
                // users don't land on an invisible control. The Effect above
                // hands focus to the scroll area when the state behind this
                // one flips it disabled.
                isDisabled={!canScrollStart}
                onFocus={() => {
                  focusedNavRef.current = 'start';
                }}
                onBlur={event => {
                  // A disabled button was blurred by the commit, not the person.
                  if (!event.currentTarget.disabled) {
                    focusedNavRef.current = null;
                  }
                }}
                onClick={() => scrollBy(-1)}
                xstyle={styles.buttonRadiusOverride}
              />
            </div>
            <div
              {...stylex.props(
                styles.buttonPill,
                styles.buttonPillEnd,
                !canScrollEnd && styles.buttonHidden,
              )}>
              <Button
                ref={endButtonRef}
                icon={
                  <Icon
                    icon="chevronRight"
                    size="xsm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                label={t('@astryx.carousel.scrollRight')}
                variant="ghost"
                size="sm"
                isIconOnly
                // See "Scroll left" — disabled while visually hidden so the
                // button stays mounted but out of the tab order / a11y tree.
                isDisabled={!canScrollEnd}
                onFocus={() => {
                  focusedNavRef.current = 'end';
                }}
                onBlur={event => {
                  // A disabled button was blurred by the commit, not the person.
                  if (!event.currentTarget.disabled) {
                    focusedNavRef.current = null;
                  }
                }}
                onClick={() => scrollBy(1)}
                xstyle={styles.buttonRadiusOverride}
              />
            </div>
          </>,
          {
            positioning: 'custom',
            style: coverStyle,
            xstyle: styles.buttonOverlay,
          },
        )}
    </div>
  );
}

Carousel.displayName = 'Carousel';
