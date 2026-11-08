// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabList.tsx
 * @input Uses React, StyleX, TabListContext, useListFocus, useKeyboardHint,
 *   useScrollOverflow, Icon
 * @output Exports TabList component, TabListProps and TabListOverflow types
 * @position Tab strip wrapper; provides TabListContext to Tab and TabMenu
 *   children. A `<nav>` landmark by default; speaks the WAI-ARIA tabs pattern
 *   where the caller asks for it with `role="tablist"`. Owns
 *   roving-tabindex keyboard navigation (Arrow/Home/End) across the tab
 *   strip via the shared useListFocus hook so it is a single Tab stop, and
 *   owns horizontal scrolling when the tabs are wider than the strip.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TabList/TabList.doc.mjs
 * - /packages/core/src/TabList/index.ts
 * - /packages/core/src/TabList/TabList.test.tsx
 * - /packages/cli/assets/templates/blocks/components/TabList/ (showcase blocks)
 *
 * MOTION LAB FORK — swizzled from core, carrying ONE proposed change: the
 * strip owns a single travelling indicator instead of each Tab cross-fading
 * its own. Opt in with `hasTravellingIndicator`; off, this is core verbatim.
 * Every changed line is marked PROPOSED. See ./index.ts for the full argument
 * and for the swizzle bug this fork had to work around. The SYNC list above is
 * core's and does not apply here — nothing in this directory ships.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AriaRole,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  focusVars,
  radiusVars,
  shadowVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps} from '@astryxdesign/core/BaseProps';
import {TabListContext} from './TabListContext';
import type {TabListSize} from './TabListContext';
import {useSize} from '@astryxdesign/core/SizeContext';
import {mergeProps, rtlStyles} from '@astryxdesign/core/utils';
import {useListFocus} from '@astryxdesign/core/hooks';
import {useKeyboardHint} from '@astryxdesign/core/hooks';
import {useScrollOverflow} from '@astryxdesign/core/hooks';
// SWIZZLE BUG: `isRtlElement` is not part of the package's public surface, so
// the swizzler's rewrite to '@astryxdesign/core/hooks' does not typecheck.
// Pointed at the package source instead. See index.ts for the full list.
import {isRtlElement} from '../../../../../../../../../packages/core/src/hooks/isRtlElement';
import {Icon} from '@astryxdesign/core/Icon';
import {EDGE_COMP_ATTR} from '@astryxdesign/core/Layout';
import {themeProps} from '@astryxdesign/core/utils';
import {observeResize, unobserveResize} from '@astryxdesign/core/utils';
import {devWarn} from '@astryxdesign/core/utils';
import {focusOutlineProps} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';

import {useMergedRefs} from '@astryxdesign/core/hooks';
/**
 * Selector matching the focusable stops in the tab strip: every Tab
 * (`[data-tab-value]`) and every TabMenu trigger (`[data-tab-menu]`),
 * in DOM order. Disabled stops are filtered out by the handler.
 */
const TAB_STOP_SELECTOR = '[data-tab-value],[data-tab-menu]';

function preventFocus(e: React.MouseEvent) {
  e.preventDefault();
}

/** Fraction of the visible strip an arrow press scrolls. */
const SCROLL_PAGE_RATIO = 0.8;

/**
 * How a strip narrower than its tabs behaves.
 *
 * - `'auto'` — the component picks the strategy. Today that is always
 *   `'scroll'`.
 * - `'scroll'` — the tabs scroll horizontally. Every tab stays a tab.
 * - `'visible'` — no overflow handling: tabs keep their intrinsic widths and
 *   spill out of the strip, as they did before overflow existed.
 */
export type TabListOverflow = 'auto' | 'scroll' | 'visible';

export interface TabListProps extends Omit<BaseProps<HTMLElement>, 'onChange'> {
  ref?: React.Ref<HTMLElement>;
  /**
   * The currently selected tab value.
   */
  value: string;
  /**
   * Callback fired when a tab is selected.
   */
  onChange: (value: string) => void;
  /**
   * Size of the tab hover targets. Uses the same element size tokens
   * as Button and TextInput (`sm` = 28px, `md` = 32px, `lg` = 36px).
   * @default 'md'
   */
  size?: TabListSize;
  /**
   * Layout mode for tab sizing.
   * - `'hug'` (default): each tab hugs its content width.
   * - `'fill'`: tabs stretch equally to fill the container width.
   * @default 'hug'
   */
  layout?: 'hug' | 'fill';
  /**
   * Whether to show a bottom divider under the tab list.
   * @default false
   */
  hasDivider?: boolean;
  /**
   * ARIA role for the strip.
   *
   * `"tablist"` asks for the WAI-ARIA tabs pattern: `role="tablist"` /
   * `role="tab"` and `aria-selected`, with each tab pointing at the panel it
   * controls via its `panelId`. Only tabs may live in a tablist strip, and a
   * tab does not navigate — an `href` is ignored there.
   *
   * Left unset, the strip is a `<nav>` landmark marking the current tab with
   * `aria-current`. Any other value is passed through to the element
   * unchanged.
   */
  role?: AriaRole;
  /**
   * What happens when the tabs are wider than the strip.
   *
   * `'auto'` lets the component choose; today it always scrolls. `'scroll'`
   * scrolls the tabs horizontally, with edge fades and — for pointers that
   * can hover — arrow affordances. `'visible'` turns overflow handling off and
   * lets the tabs spill out of the strip.
   *
   * The selected tab is always scrolled back into view.
   * @default 'auto'
   */
  overflow?: TabListOverflow;
  /**
   * Tab and TabMenu children.
   */
  children: ReactNode;
  /**
   * PROPOSED — not in core.
   *
   * Hands the selected indicator to the strip: one bar, positioned over the
   * selected tab and moved with `transform`, instead of the per-tab bars core
   * cross-fades today. Each Tab keeps its own indicator in the tree but hidden
   * (see `hasTravellingIndicator` in TabListContext), so exactly one is
   * painted and layout is unchanged.
   *
   * Off by default: with the flag unset this component renders precisely what
   * core renders, which is what makes the two panes of the Motion Lab
   * comparison a diff rather than two different components.
   *
   * @default false
   */
  hasTravellingIndicator?: boolean;
}

/**
 * A scroll container clips at its padding box, and two things a tab paints sit
 * outside its own box: the focus ring (offset + width) and the selected
 * indicator, which `--_tab-indicator-bottom` pushes further down when a
 * divider rail is reserved. The strip pads by that much and takes the padding
 * straight back off with a negative margin, so nothing is clipped and the tabs
 * stay exactly where they were.
 *
 * A bleed is not free, though. The padding is real geometry: the strip's
 * border box sticks out of the TabList's, and any ancestor that scrolls counts
 * that as something to scroll to. So the ring's share of the bleed is taken
 * only while a ring is actually drawn inside the strip -- the same
 * `:has(:focus-visible)` condition that draws it -- and at rest the strip is
 * exactly as wide and as tall as the TabList, as it was before the strip could
 * scroll. The indicator's share is always taken, because the indicator is
 * always drawn.
 *
 * Turning the bleed on moves nothing: padding and negative margin cancel, so
 * the border box grows outwards and the content stays put.
 */
const RING_BLEED = `calc(${focusVars['--focus-outline-width']} + ${focusVars['--focus-outline-offset']})`;
const BLEED_VAR = '--_tab-strip-bleed';
const BLEED = `var(${BLEED_VAR})`;
const INDICATOR_BLEED = 'calc(-1 * var(--_tab-indicator-bottom, -1px))';
const BLOCK_END_BLEED = `max(${BLEED}, ${INDICATOR_BLEED})`;

/** How far the edge fade runs; wide enough to sit under an arrow. */
const FADE_WIDTH = spacingVars['--spacing-8'];

/**
 * Where the fade turns fully opaque, and — the same distance, for the same
 * reason — how far a revealed stop is kept clear of the edge. Declared as
 * scroll-padding so the browser's own focus scrolling uses it too, and read
 * back from the computed style so the arithmetic below has one source of
 * truth with the CSS.
 */
const SCROLL_EDGE_INSET = `calc(${BLEED} + ${FADE_WIDTH})`;

/**
 * The fade reaches transparent at the strip's *own* edge, not at the bleed
 * edge — otherwise the scroll container paints tabs past the TabList's box,
 * past a divider rail, and past the scroll arrow that caps that edge. Masking
 * the bleed costs nothing: only a faded edge is masked, and a stop at a faded
 * edge never holds focus, so the bleed is still there when the ring needs it.
 */
const FADE_FROM_START = `linear-gradient(to right, transparent ${BLEED}, black ${SCROLL_EDGE_INSET})`;
const FADE_FROM_END = `linear-gradient(to left, transparent ${BLEED}, black ${SCROLL_EDGE_INSET})`;

const styles = stylex.create({
  nav: {
    display: 'flex',
    alignItems: 'stretch',
    gap: spacingVars['--spacing-0-5'],
    maxWidth: '100%',
    minWidth: 0,
    position: 'relative',
  },
  fill: {
    width: '100%',
  },
  divider: {
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
    // Reserve a gap between the tabs and the divider rail so the hover pill
    // (which fills the tab height) no longer touches the underline, and an
    // adjacent same-size Button aligns to the tabs rather than butting the
    // rail. The tabs keep their element-size height; this padding grows the
    // strip. `--_tab-indicator-bottom` drops the selected indicator through
    // the reserved gap (+ the 1px border) so it still sits on the rail.
    paddingBlockEnd: spacingVars['--spacing-1'],
    '--_tab-indicator-bottom': `calc(-1 * (${spacingVars['--spacing-1']} + ${borderVars['--border-width']}))`,
  },
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    // Inherited rather than restated so an `xstyle` gap override on the
    // TabList still reaches the tabs.
    gap: 'inherit',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    // Content-height, not stretched: the bleed padding below is inside the
    // strip's own height, and a stretched height would push the tabs out of
    // the scrollport.
    alignSelf: 'flex-start',
  },
  stripScroll: {
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    scrollPaddingInline: SCROLL_EDGE_INSET,
    scrollbarWidth: 'none',
    scrollBehavior: {
      default: 'smooth',
      '@media (prefers-reduced-motion: reduce)': 'auto',
    },
    [BLEED_VAR]: {
      default: '0px',
      ':has(:focus-visible)': RING_BLEED,
    },
    paddingBlockStart: BLEED,
    marginBlockStart: `calc(-1 * (${BLEED}))`,
    paddingBlockEnd: BLOCK_END_BLEED,
    marginBlockEnd: `calc(-1 * (${BLOCK_END_BLEED}))`,
    paddingInline: BLEED,
    marginInline: `calc(-1 * (${BLEED}))`,
    maskImage: 'none',
    transitionProperty: 'mask-image',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  fadeStart: {
    maskImage: {
      default: FADE_FROM_START,
      ':is([dir="rtl"] *)': FADE_FROM_END,
    },
  },
  fadeEnd: {
    maskImage: {
      default: FADE_FROM_END,
      ':is([dir="rtl"] *)': FADE_FROM_START,
    },
  },
  fadeBoth: {
    maskImage: `linear-gradient(to right, transparent ${BLEED}, black ${SCROLL_EDGE_INSET}, black calc(100% - ${SCROLL_EDGE_INSET}), transparent calc(100% - ${BLEED}))`,
  },
  arrow: {
    position: 'absolute',
    insetBlockStart: 0,
    // A pointer-only affordance: keyboard and assistive-technology users move
    // through the strip with the arrow keys, which scrolls the focused tab
    // into view on its own.
    display: {
      default: 'none',
      '@media (hover: hover)': 'flex',
    },
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-full'],
    // Opaque, because it sits over the tabs it scrolls: the strip's edge fade
    // thins the content underneath but does not clear it.
    backgroundColor: colorVars['--color-background-popover'],
    boxShadow: shadowVars['--shadow-low'],
    color: {
      default: colorVars['--color-text-secondary'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))':
        colorVars['--color-text-primary'],
    },
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  arrowStart: {
    insetInlineStart: 0,
  },
  arrowEnd: {
    insetInlineEnd: 0,
  },

  // ===========================================================================
  // PROPOSED — not in core. The strip-owned travelling indicator.
  // ===========================================================================

  /**
   * The strip becomes the containing block for the indicator. Deliberately the
   * strip and not the `<nav>` wrapper: the strip is the scroll container, so an
   * indicator positioned against it scrolls with the tabs it is pointing at
   * rather than sliding off them.
   */
  stripPositioned: {
    position: 'relative',
  },
  travellingIndicator: {
    position: 'absolute',
    // The same custom property the per-tab indicator reads, so a divider rail
    // (`hasDivider`, or a Toolbar with a bottom divider) drops this bar onto
    // the rail exactly as it drops core's.
    bottom: 'var(--_tab-indicator-bottom, -1px)',
    // Physical `left`, not `insetInlineStart`: the offset below is a physical
    // `getBoundingClientRect()` delta, and translateX is a physical axis. Under
    // RTL a logical anchor would flip the origin out from under a delta that
    // did not flip, and the bar would travel the wrong way.
    left: 0,
    height: '2px',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-accent'],
    // A 2px decoration lying across the bottom of every tab: without this it
    // would swallow clicks along that edge.
    pointerEvents: 'none',
    // The move curve, not an entry curve. An entry curve (an accent on
    // arrival) is for something appearing — it earns attention for a thing the
    // eye has not seen yet. This bar is already on screen and already has the
    // eye; what it owes the viewer is a legible *path* from the old tab to the
    // new one, so the standard easing carries it and nothing accents the end.
    // The whole point of the proposal is that the eye follows the bar instead
    // of re-finding it, and an arrival accent would put the emphasis back on
    // the destination.
    transitionProperty: 'transform, width',
    transitionDuration: {
      default: durationVars['--duration-medium-min'],
      '@media (prefers-reduced-motion: reduce)': '0.01s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  /**
   * The one thing a strip-owned bar has to pay for that a per-tab bar does
   * not: its containing block is the strip's *padding* box, and a scrolling
   * strip pads itself (see RING_BLEED above) to keep the focus ring and the
   * indicator from being clipped. So the anchors have to give that padding
   * back, in the strip's own terms:
   *
   * - `bottom` adds the block-end bleed, which puts the bar exactly where
   *   core's per-tab bar sits — flush with the padding edge, and therefore not
   *   clipped by `overflow-y: hidden`. Without this the bar sits a bleed lower
   *   and the scrollport shaves the bottom half off it.
   * - `left` moves the origin from the padding edge to the content edge, the
   *   same place the measurement below reckons from.
   *
   * Both terms are zero at rest, so this changes nothing about where the bar
   * normally is. They exist because the bleed is not constant: it grows while
   * a focus ring is drawn inside the strip. Tracked here in CSS rather than
   * re-measured in JS so the correction lands in the same style recalculation
   * as the padding it cancels — a JS correction would arrive a frame later and
   * the bar would visibly slide a few pixels every time the strip took focus.
   */
  travellingIndicatorBleed: {
    bottom: `calc(var(--_tab-indicator-bottom, -1px) + ${BLOCK_END_BLEED})`,
    left: BLEED,
  },
  /**
   * Before the first measurement the bar has no position worth showing, so it
   * is not shown. Transitions are off here as well as opacity: the first
   * measurement writes the transform while this variant is still applied, and
   * a transition would animate that write — the bar would slide in from the
   * strip's left edge on mount, an entrance the proposal never claimed.
   */
  travellingIndicatorHidden: {
    opacity: 0,
    transitionProperty: 'none',
  },
});

/**
 * PROPOSED — not in core.
 *
 * How far the bar is inset from each side of the tab it marks. Matches the
 * per-tab indicator, which is inset by `--spacing-3` at both ends
 * (`insetInlineStart`/`insetInlineEnd` on `indicator` in Tab.tsx) so the bar
 * spans the label rather than the tab's full hover target. Read here as a
 * number because the placement is arithmetic on measured pixels, not CSS.
 */
const TRAVELLING_INDICATOR_INSET = 12;

/**
 * PROPOSED — not in core.
 *
 * The selected tab, under either ARIA pattern the component supports: a
 * `role="tablist"` strip marks it with `aria-selected`, a `<nav>` strip with
 * `aria-current` (`"true"` today, `"page"` accepted because a caller may set
 * it by hand on a link tab). Matching only one of these would leave the
 * indicator stranded in the other half of the component's API.
 */
const SELECTED_TAB_SELECTOR =
  '[aria-selected="true"], [aria-current="page"], [aria-current="true"]';

const arrowSizeStyles = stylex.create({
  sm: {
    width: sizeVars['--size-element-sm'],
    height: sizeVars['--size-element-sm'],
  },
  md: {
    width: sizeVars['--size-element-md'],
    height: sizeVars['--size-element-md'],
  },
  lg: {
    width: sizeVars['--size-element-lg'],
    height: sizeVars['--size-element-lg'],
  },
});

/**
 * Tab navigation wrapper. Provides context for value/onChange/size
 * to Tab and TabMenu children.
 *
 * @example
 * ```
 * <TabList value={activeTab} onChange={setActiveTab}>
 *   <Tab value="home" label="Home" />
 *   <Tab value="settings" label="Settings" />
 *   <TabMenu label="More">
 *     <Tab value="analytics" label="Analytics" />
 *     <Tab value="reports" label="Reports" />
 *   </TabMenu>
 * </TabList>
 * ```
 */
export function TabList({
  ref,
  value,
  onChange,
  size: sizeProp,
  layout = 'hug',
  hasDivider = false,
  role,
  overflow = 'auto',
  hasTravellingIndicator = false,
  xstyle,
  className,
  style,
  children,
  onKeyDown: onKeyDownProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  'aria-label': ariaLabelFromProps,
  'aria-labelledby': ariaLabelledBy,
  'aria-orientation': _ariaOrientation,
  [EDGE_COMP_ATTR]: _edgeCompAttr,
  ...restProps
}: TabListProps) {
  const t = useTranslator();
  const ariaLabel = ariaLabelFromProps ?? t('@astryx.tabList.label');
  const size = useSize(sizeProp, 'md');
  const hasScroll = overflow !== 'visible';

  const stripRef = useRef<HTMLDivElement | null>(null);
  // Only an asserted `role="tablist"` switches the pattern. Left unset the
  // strip is the `<nav>` it has always been, and every other role passes
  // through to the element untouched.
  const isTabList = role === 'tablist';

  // Roving-tabindex keyboard navigation across the tab strip via the shared
  // hook. Under the navigation pattern `orientation: 'both'` accepts both
  // arrow axes per the WAI-ARIA APG allowance for tab strips
  // (ArrowRight/ArrowDown advance, ArrowLeft/ArrowUp retreat). A tablist
  // reports itself as horizontal, so there the strip takes only the
  // horizontal arrows and leaves ArrowUp and ArrowDown to scroll the page. We
  // do not set `aria-orientation` on the `<nav>`: that attribute is invalid on
  // the navigation role and triggers an axe `aria-allowed-attr` violation.
  //
  // `hasRovingTabIndex` makes the hook own the single tab stop: it stamps
  // tabindex 0/-1, repairs the stop on mount and as stops mount/unmount or
  // toggle disabled, and -- via `handleFocus` on the nav -- keeps the stop in
  // sync after clicks or programmatic focus. Individual Tabs still render
  // `tabIndex={isSelected ? 0 : -1}` (see Tab.tsx) as the initial source of
  // truth; the hook's repair preserves an existing tab stop and only promotes
  // the first enabled stop when none is tabbable.
  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLElement>({
    itemSelector: TAB_STOP_SELECTOR,
    orientation: isTabList ? 'horizontal' : 'both',
    hasRovingTabIndex: true,
  });

  const {
    hintElement,
    onKeyDown: onHintKeyDown,
    onFocus: onHintFocus,
    onBlur: onHintBlur,
  } = useKeyboardHint();

  const {scrollRef, overflowStart, overflowEnd} = useScrollOverflow();

  const attachStrip = useCallback(
    (el: HTMLDivElement | null) => {
      stripRef.current = el;
      scrollRef(hasScroll ? el : null);
    },
    [hasScroll, scrollRef],
  );

  const revealStop = useCallback(
    (stop: HTMLElement | null) => {
      const strip = stripRef.current;
      if (!hasScroll || !strip || !stop) {
        return;
      }
      const stripBox = strip.getBoundingClientRect();
      const stopBox = stop.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0;
      const pastEnd = stopBox.right - (stripBox.right - inset);
      const pastStart = stopBox.left - (stripBox.left + inset);
      // A stop wider than the space kept clear cannot be shown whole, so show
      // its reading start, the way `scrollIntoView({inline: 'nearest'})` does.
      const tooWide = stopBox.width > stripBox.width - 2 * inset;
      const delta = tooWide
        ? isRtlElement(strip)
          ? pastEnd
          : pastStart
        : pastEnd > 0
          ? pastEnd
          : pastStart < 0
            ? pastStart
            : 0;
      if (delta !== 0) {
        // Not an animation: the strip has to arrive already showing the right
        // tab, so this overrides the CSS smooth behaviour arrow presses use.
        strip.scrollBy({left: delta, behavior: 'instant'});
      }
    },
    [hasScroll],
  );

  const revealSelectedTab = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    revealStop(
      Array.from(strip.querySelectorAll<HTMLElement>('[data-tab-value]')).find(
        el => el.dataset.tabValue === value,
      ) ?? null,
    );
  }, [revealStop, value]);

  // Both reveals below reach the callback through a ref instead of depending
  // on it: its identity also changes with `overflow`, and that is not a reason
  // to scroll anything.
  const revealSelectedTabRef = useRef(revealSelectedTab);
  useEffect(() => {
    revealSelectedTabRef.current = revealSelectedTab;
  }, [revealSelectedTab]);

  // The tab you are on has to be visible. Selection can move without focus —
  // on mount, or when the host sets `value` itself — and neither scrolls the
  // strip the way clicking or arrowing to a tab does. The check is what makes
  // a selection change the trigger, rather than the effect happening to run.
  const revealedValueRef = useRef<string | null>(null);
  useEffect(() => {
    if (revealedValueRef.current === value) {
      return;
    }
    revealedValueRef.current = value;
    revealSelectedTabRef.current();
  }, [value]);

  // ...and it has to stay visible when the strip is what moved. A strip that
  // fitted at one width can hide the selected tab at a narrower one, and no
  // prop changes when that happens. This one re-reveals the same selection by
  // design, which is why the check above sits in the effect rather than in
  // `revealSelectedTab`.
  //
  // The wrapper is observed rather than the strip because the shared observer
  // keeps one callback per element and `useScrollOverflow` already holds the
  // strip's.
  useEffect(() => {
    const root = listRef.current;
    if (!hasScroll || !root) {
      return;
    }
    const onResize = () => revealSelectedTabRef.current();
    observeResize(root, onResize);
    return () => unobserveResize(root);
  }, [hasScroll, listRef]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    // Under RTL the scroll axis is inverted, so flip the physical delta.
    const rtlSign = isRtlElement(strip) ? -1 : 1;
    strip.scrollBy({
      left: rtlSign * direction * strip.clientWidth * SCROLL_PAGE_RATIO,
    });
  }, []);

  const scrollToStart = useCallback(() => scrollByPage(-1), [scrollByPage]);
  const scrollToEnd = useCallback(() => scrollByPage(1), [scrollByPage]);

  const contextValue = useMemo(
    () => ({
      value,
      onChange,
      size,
      layout,
      pattern: isTabList ? ('tabs' as const) : ('nav' as const),
      // PROPOSED — not in core. Tells each Tab to keep its own indicator in the
      // tree but hidden, so the strip's single bar is the only one painted.
      hasTravellingIndicator,
    }),
    [value, onChange, size, layout, isTabList, hasTravellingIndicator],
  );

  const handleRootKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintKeyDown(e);
      handleKeyDown(e);
    },
    [onKeyDownProp, onHintKeyDown, handleKeyDown],
  );

  const handleRootFocus = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      onFocusProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintFocus(e);
      handleFocus(e);
      // The browser scrolls a focused element into view only when it is
      // entirely outside the scrollport, so arrowing onto a half-visible stop
      // leaves it cut off under the fade. Finish the job it started.
      revealStop(e.target.closest(TAB_STOP_SELECTOR));
    },
    [onFocusProp, onHintFocus, handleFocus, revealStop],
  );

  const handleRootBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      onBlurProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintBlur(e);
    },
    [onBlurProp, onHintBlur],
  );

  // `role="tablist"` owns only tabs, so anything else in the strip is invalid
  // markup. Dev-only, and only under the asserted role — nothing else in the
  // component reads the rendered DOM.
  const hasWarnedContentRef = useRef(false);
  useEffect(() => {
    const strip = stripRef.current;
    if (
      process.env.NODE_ENV === 'production' ||
      !isTabList ||
      !strip ||
      hasWarnedContentRef.current
    ) {
      return;
    }
    const stranger = Array.from(strip.children).find(
      child =>
        child.getAttribute('role') !== 'tab' &&
        // PROPOSED — not in core. The travelling indicator lives in the strip
        // but is `aria-hidden`, so it is not in the accessibility tree and the
        // tablist does not own it. Without this the fork would warn about its
        // own decoration on every mount.
        child.getAttribute('aria-hidden') !== 'true',
    );
    if (stranger) {
      hasWarnedContentRef.current = true;
      devWarn(
        'TabList',
        `role="tablist" owns only tabs, but the strip contains a <${stranger.tagName.toLowerCase()}> that is not one. ` +
          'Render menus and other controls outside the strip, or drop the role for the navigation pattern.',
      );
    }
    // No dependency list: the check is on rendered DOM, which can change
    // without any prop this component could watch.
  });

  // ===========================================================================
  // PROPOSED — not in core. One indicator, owned by the strip.
  // ===========================================================================

  const travellingIndicatorRef = useRef<HTMLSpanElement | null>(null);
  // The bar has nowhere sensible to be until it has been measured once, so it
  // renders hidden and reveals itself on the first successful placement.
  const [isIndicatorMeasured, setIsIndicatorMeasured] = useState(false);

  /**
   * Why the position is read out of the DOM instead of tracked in React state:
   * there is no state to track. A tab's geometry is not a prop of anything —
   * the tabs size themselves from their own content, so `layout="fill"`
   * redistributing width, a webfont swapping in and re-measuring every label,
   * a container query narrowing the strip, or the strip simply being scrolled
   * all move the target while React renders nothing at all. Anything derived
   * from props would be stale for exactly the cases the indicator most needs
   * to be right about, so the measurement is the source of truth and the
   * effect writes it straight onto the element.
   *
   * That is also why the cost below is real and worth naming: a
   * `ResizeObserver` on the strip is the ONE thing this proposal adds that
   * core does not already pay. Everything else is a style swap. It is one
   * observer per TabList, it fires only when the strip's box actually changes,
   * and its callback is two `getBoundingClientRect()` reads and two style
   * writes — but a reviewer should be pricing it deliberately, not
   * discovering it. (Core's own resize handling can't be reused here: the
   * shared observer keeps a single callback per element and `useScrollOverflow`
   * already holds the strip's.)
   *
   * `useEffect`, deliberately, not `useLayoutEffect`: the sandbox statically
   * prerenders every route, and a layout effect warns on the server. Nothing
   * is lost by running a frame later, because the bar is hidden until the
   * first measurement lands — there is no pre-paint position to correct.
   */
  useEffect(() => {
    const strip = stripRef.current;
    const indicator = travellingIndicatorRef.current;
    if (!hasTravellingIndicator || !strip || !indicator) {
      return;
    }

    const place = () => {
      const selected = strip.querySelector<HTMLElement>(SELECTED_TAB_SELECTOR);
      if (!selected) {
        // Nothing is selected — a valid state for the navigation pattern —
        // so there is nothing to point at. Hide rather than leave the bar
        // stranded under whichever tab was selected last.
        setIsIndicatorMeasured(false);
        return;
      }
      const stripBox = strip.getBoundingClientRect();
      const tabBox = selected.getBoundingClientRect();
      // Both rects are viewport coordinates, so their delta is where the tab
      // sits on screen. Two corrections turn that into the coordinate the
      // indicator is laid out in:
      //
      // - `scrollLeft`, because the indicator is a child of the strip, which
      //   is the scroll container: it lives in the strip's *content*
      //   coordinates and scrolls with the tabs. Without this the bar would be
      //   right only at scrollLeft 0 and drift by the scroll distance.
      // - the strip's inline padding, because the rect is measured to the
      //   padding edge while the bar is anchored to the content edge (see
      //   `travellingIndicatorBleed`). Zero at rest; non-zero exactly while a
      //   focus ring is drawn inside the strip.
      const padStart = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
      const offset =
        tabBox.left -
        stripBox.left -
        padStart +
        strip.scrollLeft +
        TRAVELLING_INDICATOR_INSET;
      // Clamped: a tab narrower than its own padding would otherwise ask for a
      // negative width, which is invalid CSS and drops the declaration.
      const width = Math.max(0, tabBox.width - TRAVELLING_INDICATOR_INSET * 2);
      indicator.style.width = `${width}px`;
      indicator.style.transform = `translateX(${offset}px)`;
      setIsIndicatorMeasured(true);
    };

    place();

    const observer = new ResizeObserver(place);
    observer.observe(strip);
    return () => observer.disconnect();
    // `children` is here because a tab added, removed, or relabelled moves the
    // target with no other signal — the same reason the position is measured
    // rather than derived. It re-subscribes the observer more often than
    // strictly needed (JSX hands back a fresh `children` each render), which is
    // cheap: `observe()` on an already-measured element costs one extra
    // idempotent `place()` on the next frame.
  }, [hasTravellingIndicator, value, children]);

  const fadeStyle = !hasScroll
    ? null
    : overflowStart && overflowEnd
      ? styles.fadeBoth
      : overflowStart
        ? styles.fadeStart
        : overflowEnd
          ? styles.fadeEnd
          : null;

  // A tablist is not navigation, so the landmark element is only right under
  // the navigation pattern. The role is fixed by a prop rather than by what
  // the strip happens to hold, so this is settled once at the callsite.
  const Wrapper = isTabList ? 'div' : 'nav';

  return (
    <TabListContext value={contextValue}>
      <Wrapper
        ref={useMergedRefs(ref, listRef)}
        {...restProps}
        role={isTabList ? undefined : role}
        aria-label={isTabList ? undefined : ariaLabel}
        aria-labelledby={isTabList ? undefined : ariaLabelledBy}
        onKeyDown={handleRootKeyDown}
        onFocus={handleRootFocus}
        onBlur={handleRootBlur}
        {...{[EDGE_COMP_ATTR]: ''}}
        {...mergeProps(
          themeProps('tab-list', {size}),
          stylex.props(
            styles.nav,
            layout === 'fill' && styles.fill,
            hasDivider && styles.divider,
            xstyle,
          ),
          className,
          style,
        )}>
        <div
          ref={attachStrip}
          role={isTabList ? 'tablist' : undefined}
          aria-label={isTabList ? ariaLabel : undefined}
          // The name belongs to whichever element carries the widget role.
          aria-labelledby={isTabList ? ariaLabelledBy : undefined}
          {...mergeProps(
            themeProps('tab-strip'),
            stylex.props(
              styles.strip,
              hasScroll && styles.stripScroll,
              fadeStyle,
              // PROPOSED — not in core. The containing block for the bar below.
              hasTravellingIndicator && styles.stripPositioned,
            ),
          )}>
          {children}
          {/*
            PROPOSED — not in core. The single indicator, owned by the strip
            rather than by each Tab, so selection moves it instead of
            cross-fading two of them. Inside the strip because the strip is
            what scrolls: an indicator outside it would slide off the tab it
            marks the moment the strip scrolled. Purely decorative and
            `aria-hidden` — selection is already stated by `aria-selected` /
            `aria-current` on the tab itself, and this bar must not add a
            second, contradictory voice.
          */}
          {hasTravellingIndicator && (
            <span
              ref={travellingIndicatorRef}
              aria-hidden="true"
              {...mergeProps(
                themeProps('tab-travelling-indicator'),
                stylex.props(
                  styles.travellingIndicator,
                  hasScroll && styles.travellingIndicatorBleed,
                  !isIndicatorMeasured && styles.travellingIndicatorHidden,
                ),
              )}
            />
          )}
        </div>
        {hasScroll && overflowStart && (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            // Nothing hidden from assistive technology should end up holding
            // focus, and a click would put it here.
            onMouseDown={preventFocus}
            onClick={scrollToStart}
            {...mergeProps(
              themeProps('tab-scroll-button'),
              focusOutlineProps.focusVisible(
                styles.arrow,
                styles.arrowStart,
                arrowSizeStyles[size],
              ),
            )}>
            <Icon
              icon="chevronLeft"
              size="sm"
              color="inherit"
              xstyle={rtlStyles.mirror}
            />
          </button>
        )}
        {hasScroll && overflowEnd && (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onMouseDown={preventFocus}
            onClick={scrollToEnd}
            {...mergeProps(
              themeProps('tab-scroll-button'),
              focusOutlineProps.focusVisible(
                styles.arrow,
                styles.arrowEnd,
                arrowSizeStyles[size],
              ),
            )}>
            <Icon
              icon="chevronRight"
              size="sm"
              color="inherit"
              xstyle={rtlStyles.mirror}
            />
          </button>
        )}
        {hintElement}
      </Wrapper>
    </TabListContext>
  );
}

TabList.displayName = 'TabList';
