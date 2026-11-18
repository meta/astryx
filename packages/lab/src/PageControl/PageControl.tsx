// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PageControl.tsx
 * @input React, StyleX, Core's theme tokens and translator, Core's internal
 *   touch entry, pageControlTable.ts, pageControlModel.ts, PageControlTouch.ts
 * @output Exports PageControl: a row of page indicators that pages one step
 *   per tap and follows a scrubbing finger, like UIPageControl
 * @position Lab component: the phone's "which page am I on" under a paging
 *   view, UIPageControl's counterpart
 *
 * SYNC: When modified, update PageControl.doc.mjs, PageControl.test.tsx,
 * PageControlTouch.ts, pageControlModel.ts and the interaction spec.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  composeEventHandlers,
  mergeProps,
  mergeRefs,
} from '@astryxdesign/core/utils';
import {colorVars, focusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  animatorFor,
  isRtlElement,
  touchHitAreaStyles,
  useTouchHitArea,
  useTouchPresentation,
} from '@astryxdesign/core/internal/touch';
import {pageControl} from './pageControlTable';
import {usePageControlTouch} from './PageControlTouch';
import {
  BOX,
  PITCH,
  SWITCH,
  clampPage,
  croppedRowOffset,
  indicatorSize,
  pageControlLayout,
  renderedPages,
  windowFor,
  type ChangeKind,
  type Latest,
} from './pageControlModel';

const PC = pageControl;
/** A 10 px box scaled to the 9.67 px indicator (see BOX). */
const DOT_SCALE = PC.indicatorSize / BOX;
// UIKit draws the other indicators at 45 %. At that alpha, Core's primary
// text colour on its page background measures 2.97:1. That is under the 3:1
// that WCAG 1.4.11 asks of the only page-count cue. 48 % gives 3.25:1.
const INACTIVE_ALPHA = Math.max(PC.otherIndicatorAlpha, 0.48);

export interface PageControlProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Number of pages. */
  totalPages: number;
  /** Current page number (1-based). Page 1 is the first page. */
  page: number;
  /**
   * Called with the page, 1-based, that a tap, a scrub, a key or an assistive
   * technology asks for.
   */
  onChange: (page: number) => void;
  /**
   * Accessible name of the control.
   * @default 'Page indicators' (localized)
   */
  label?: string;
  /**
   * Render nothing when there is only one page.
   * @default false
   */
  hidesForSinglePage?: boolean;
  'data-testid'?: string;
  /** The slider element. */
  ref?: Ref<HTMLDivElement>;
}

const styles = stylex.create({
  root: {
    position: 'relative',
    display: 'inline-block',
    boxSizing: 'border-box',
    flexShrink: 0,
    verticalAlign: 'middle',
    cursor: 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    outlineStyle: {
      default: 'none',
      ':focus-visible': focusVars['--focus-outline-style'],
    },
    outlineWidth: focusVars['--focus-outline-width'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },
  cropped: {
    overflow: 'hidden',
  },
  // The held look has no element of its own. The root's `::before` paints it.
  platter: {
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backgroundColor: colorVars['--color-overlay-pressed'],
      pointerEvents: 'none',
      opacity: 0,
      transition: 'var(--_page-control-platter-transition, none)',
    },
  },
  platterShown: {
    '::before': {
      opacity: 1,
    },
  },
  strip: {
    position: 'absolute',
    insetBlock: 0,
    width: 0,
    pointerEvents: 'none',
  },
  indicator: {
    position: 'absolute',
    borderRadius: '50%',
    backgroundColor: colorVars['--color-text-primary'],
  },
  // The resting offset and sizes the markup carries (custom properties the
  // render sets); the animator's inline translate and scale override them.
  restingStrip: {
    translate: {
      default: 'calc(-1 * var(--_page-control-rest, 0px)) 0',
      ':is([dir="rtl"] *)': 'var(--_page-control-rest, 0px) 0',
    },
  },
  restingDot: {
    scale: 'var(--_page-control-scale, 1)',
  },
});

/** The page count: 0 for a total that is not a finite number. */
function pageCountOf(totalPages: number): number {
  return Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0;
}

/**
 * A row of page indicators that pages one step per tap and follows a
 * scrubbing finger, like UIPageControl.
 *
 * It draws UIPageControl's measured geometry: 9.67 px indicators 8 px apart,
 * 14 px of padding at each end and 25.67 px tall. At most ten indicator
 * slots show. With more pages, the row is a window. Where pages continue past
 * it, the last two slots on that side shrink. The window moves only when the
 * current page would land in a shrunk slot, on UIKit's spring.
 *
 * The app owns the page (`page` and `onChange`). A tap on the trailing side
 * of the current indicator asks for the next page, and on the leading side
 * for the previous one. A finger that travels 16 px scrubs instead. Past the
 * content's edge, the page keeps stepping on its own. A held or scrubbing
 * finger shows a platter behind the indicators and dims the others.
 *
 * Assistive technology gets one adjustable element: a slider named "Page
 * indicators" whose value reads "Page 3 of 5". The arrow keys, Home and End
 * change the page. Every pointer taps and scrubs. With a fine pointer, the
 * row is cropped to the control and opacity changes are instant.
 *
 * @example
 * ```
 * const [page, setPage] = useState(1);
 * <PageControl totalPages={5} page={page} onChange={setPage} />
 * ```
 */
export function PageControl(props: PageControlProps) {
  const pages = pageCountOf(props.totalPages);
  if (pages === 0 || (props.hidesForSinglePage === true && pages === 1)) {
    // Nothing to show. The row mounts with its element when pages arrive, so
    // its recognizers attach then.
    return null;
  }
  return <PageControlRow {...props} />;
}

function PageControlRow({
  totalPages,
  page: pageProp,
  onChange,
  label,
  hidesForSinglePage: _hidesForSinglePage,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  onKeyDown: onKeyDownProp,
  ...htmlProps
}: PageControlProps) {
  const t = useTranslator();
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const pages = pageCountOf(totalPages);
  // Pages count from 1 outside and from 0 inside.
  const current =
    pages === 0 || !Number.isFinite(pageProp)
      ? 0
      : clampPage(pageProp - 1, pages);
  const layout = pageControlLayout(pages);
  // The held platter, shrinking window and fades are the touch presentation,
  // under a finger on any touch device. With a mouse, the control shows the
  // full row, cropped, and takes the same taps and scrubs over it.
  const {isTouch} = useTouchPresentation();

  // The window moves only when the current page would land in a shrunk
  // slot, so it depends on where it was: state, adjusted during render.
  const [windowStart, setWindowStart] = useState(() =>
    windowFor(pages, 0, current),
  );
  const nextWindowStart = isTouch
    ? windowFor(pages, windowStart, current)
    : windowStart;
  if (nextWindowStart !== windowStart) {
    setWindowStart(nextWindowStart);
  }

  const [isInteracting, setInteracting] = useState(false);
  const [isScrubbing, setScrubbing] = useState(false);

  // Read by the gesture and its timers, which outlive a render.
  const latestRef = useRef<Latest>({
    current,
    pages,
    windowStart,
    onChange,
  });
  // Syncs latestRef with the committed render. It is written at commit: a
  // render that React discards, as a suspended transition does, must not
  // leave its values behind.
  useLayoutEffect(() => {
    latestRef.current = {current, pages, windowStart, onChange};
  });

  // What asked for the page the control shows next: a tap fades the old
  // indicator faster than anything else.
  const requestRef = useRef<{page: number; kind: ChangeKind} | null>(null);
  const request = (page: number, kind: ChangeKind) => {
    const latest = latestRef.current;
    if (page === latest.current || page === requestRef.current?.page) {
      return;
    }
    const pending = {page, kind};
    requestRef.current = pending;
    latest.onChange(page + 1);
    // An app that keeps its value never renders the page. Once it has had its
    // chance to, in the next task, the request lapses. Then asking again
    // calls onChange again.
    const view = rootRef.current?.ownerDocument.defaultView ?? globalThis;
    view.setTimeout(() => {
      if (requestRef.current === pending) {
        requestRef.current = null;
      }
    }, 0);
  };

  usePageControlTouch({
    isTouch,
    rootRef,
    stripRef,
    latestRef,
    requestRef,
    request,
    setInteracting,
    setScrubbing,
    pages,
    current,
    windowStart,
  });

  // With a mouse: the cropped row, every page at full size, shifted at once to
  // keep the current indicator in view. A scrub maps the pointer onto the dots
  // as they lie, so the row holds still until the lift.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const root = rootRef.current;
    if (isTouch || isScrubbing || strip == null || root == null) {
      return;
    }
    const isRtl = isRtlElement(root);
    animatorFor(strip).set({
      x: (isRtl ? 1 : -1) * croppedRowOffset(pages, current),
    });
    for (const dot of Array.from(strip.children) as HTMLElement[]) {
      animatorFor(dot).set({scale: DOT_SCALE});
    }
  }, [isTouch, isScrubbing, pages, current]);

  // A finger needs a 44 px target: the touch hit area grows the control toward
  // it, as far as its neighbours allow. It pauses while a scrub runs, so
  // nothing reads layout as the finger moves.
  const hitAreaRef = useTouchHitArea(!isScrubbing);
  const mergedRef = useMemo(
    () => mergeRefs(ref, rootRef, hitAreaRef),
    [ref, hitAreaRef],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isRtl = isRtlElement(event.currentTarget);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = current + (isRtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        next = current + (isRtl ? 1 : -1);
        break;
      case 'ArrowUp':
        next = current + 1;
        break;
      case 'ArrowDown':
        next = current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = pages - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    request(clampPage(next, pages), 'other');
  };

  const isWindow = isTouch && layout.isWindowed;
  const [first, last] = isWindow
    ? renderedPages(pages, windowStart)
    : [0, pages];
  // The cropped row starts inside the padding.
  const fullRow = pages * PITCH - PC.indicatorSpacing;
  const stripStart = isTouch
    ? (layout.width - layout.rowWidth) / 2
    : (layout.width -
        Math.min(fullRow, layout.width - 2 * PC.horizontalPadding)) /
      2;
  const transition = isTouch ? SWITCH : 'none';
  const otherAlpha = isInteracting
    ? PC.interactingOtherIndicatorAlpha
    : INACTIVE_ALPHA;
  // The resting window is in the markup too. So a server-rendered control
  // shows its current indicator before the animator takes the strip and the
  // dots. Then the animator's inline values win.
  const restOffset = isTouch
    ? windowStart * PITCH
    : croppedRowOffset(pages, current);
  const stripStyle: CSSProperties & Record<`--${string}`, string> = {
    insetInlineStart: stripStart,
    '--_page-control-rest': `${restOffset}px`,
  };
  const top = (PC.height - BOX) / 2;

  return (
    <div
      data-testid={testId}
      data-interacting={isInteracting || undefined}
      {...htmlProps}
      ref={mergedRef}
      {...mergeProps(
        stylex.props(
          styles.root,
          !isTouch && styles.cropped,
          isTouch && styles.platter,
          isTouch && touchHitAreaStyles.layer,
          isTouch && isInteracting && styles.platterShown,
          xstyle,
        ),
        className,
        {
          ...style,
          width: layout.width,
          height: PC.height,
          ['--_page-control-platter-transition' as string]: transition,
        },
      )}
      role="slider"
      tabIndex={0}
      aria-label={label ?? t('@astryx.pagination.pageIndicators')}
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={pages}
      aria-valuenow={current + 1}
      aria-valuetext={t('@astryx.pagination.pageOfTotal', {
        current: current + 1,
        total: pages,
      })}
      // The caller's handler first: its preventDefault keeps the page.
      onKeyDown={composeEventHandlers(onKeyDownProp, onKeyDown)}>
      <span
        ref={stripRef}
        aria-hidden="true"
        {...stylex.props(styles.strip, styles.restingStrip)}
        style={stripStyle}>
        {Array.from({length: last - first}, (_, i) => {
          const page = first + i;
          return (
            <span
              key={page}
              data-page={page}
              {...stylex.props(styles.indicator, styles.restingDot)}
              style={{
                // The box overhangs its drawn indicator by half a pixel.
                insetInlineStart: page * PITCH - (BOX - PC.indicatorSize) / 2,
                top,
                width: BOX,
                height: BOX,
                ['--_page-control-scale' as string]: String(
                  isTouch
                    ? indicatorSize(pages, windowStart, page) / BOX
                    : DOT_SCALE,
                ),
                opacity:
                  page === current ? PC.currentIndicatorAlpha : otherAlpha,
                transition,
              }}
            />
          );
        })}
      </span>
    </div>
  );
}

PageControl.displayName = 'PageControl';
