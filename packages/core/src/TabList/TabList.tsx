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
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {TabListContext} from './TabListContext';
import type {TabListSize} from './TabListContext';
import {useSize} from '../SizeContext/SizeContext';
import {mergeProps, rtlStyles} from '../utils';
import {useListFocus} from '../hooks/useListFocus';
import {useKeyboardHint} from '../hooks/useKeyboardHint';
import {useScrollOverflow} from '../hooks/useScrollOverflow';
import {isRtlElement} from '../hooks/isRtlElement';
import {Icon} from '../Icon';
import {EDGE_COMP_ATTR} from '../Layout/edgeCompensation.stylex';
import {themeProps} from '../utils/themeProps';
import {observeResize} from '../utils/sharedResizeObserver';
import {devWarn} from '../utils/devWarning';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
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
   * Bleeds the strip out to its container's content edges.
   *
   * Both halves are computed from the `--container-padding-*` custom
   * properties a padded Layout container publishes. The strip's box is pulled
   * out through the container's inline padding, so a `hasDivider` underline —
   * or the header's own divider, when the strip is docked on it — spans the
   * full content width. The strip then pads back in by whatever that bleed
   * exceeds a stop's own inline padding, so the first and last label still
   * land on the container's content inset rather than 4px short of it.
   *
   * Outside a padded container the properties are unset, the pad-back clamps
   * to zero, and the strip is left exactly as it was. Block-edge docking stays
   * with the surrounding layout because it cannot be detected through nested
   * wrappers without pulling a mid-content strip into its siblings.
   * @default false
   */
  isFullBleed?: boolean;
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

/**
 * A stop's own inline padding, restated here because a full-bleed strip has to
 * subtract it: the strip pads back in only the part of the container's padding
 * the stop does not already supply, so the edge label lands on the content
 * inset. Kept in step with `Tab`/`TabMenu`'s `paddingInline` by hand — the
 * import would be circular.
 */
const STOP_INLINE_PADDING = spacingVars['--spacing-3'];
const EDGE_PAD_START = `max(var(--container-padding-inline-start, 0px) - ${STOP_INLINE_PADDING}, 0px)`;
const EDGE_PAD_END = `max(var(--container-padding-inline-end, 0px) - ${STOP_INLINE_PADDING}, 0px)`;
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
  // Put back the part of the bleed a stop's own inline padding does not
  // already supply, so the first and last label land on the container's
  // content inset while their boxes still hang out over it. Applied after
  // `stripScroll` because both write the strip's inline padding; the ring
  // bleed is carried through so the negative margin there still cancels it.
  fullBleedStrip: {
    paddingInlineStart: `calc(var(${BLEED_VAR}, 0px) + ${EDGE_PAD_START})`,
    paddingInlineEnd: `calc(var(${BLEED_VAR}, 0px) + ${EDGE_PAD_END})`,
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
  fullBleed: {
    // Cancel the container's inline padding so the strip's box reaches its
    // content edges. Same spelling as Divider's `isFullBleed`.
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    // The `nav` base clamps to 100%, which would pull the widened box back.
    maxWidth: 'none',
    width:
      'calc(100% + var(--container-padding-inline-start, 0px) + var(--container-padding-inline-end, 0px))',
  },
});

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
  isFullBleed = false,
  role,
  overflow = 'auto',
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

  // The tab whose focus revealed it (see `handleRootFocus`), while it keeps
  // focus.
  const focusRevealedValueRef = useRef<string | null>(null);

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
    if (value != null && focusRevealedValueRef.current === value) {
      // A press or an arrow focused this tab first, and focusing it revealed
      // it. Measuring now would force the new selection's style and layout
      // inside the press, before it can paint. The next frame lays them out
      // anyway, so finish there: the selected weight can still widen the tab.
      const frame = requestAnimationFrame(() => revealSelectedTabRef.current());
      return () => cancelAnimationFrame(frame);
    }
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
    return observeResize(root, onResize);
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
    }),
    [value, onChange, size, layout, isTabList],
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
      const stop = e.target.closest<HTMLElement>(TAB_STOP_SELECTOR);
      revealStop(stop);
      focusRevealedValueRef.current = stop?.dataset.tabValue ?? null;
    },
    [onFocusProp, onHintFocus, handleFocus, revealStop],
  );

  const handleRootBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      onBlurProp?.(e);
      focusRevealedValueRef.current = null;
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
      child => child.getAttribute('role') !== 'tab',
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
            isFullBleed && styles.fullBleed,
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
              isFullBleed && styles.fullBleedStrip,
              fadeStyle,
            ),
          )}>
          {children}
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
