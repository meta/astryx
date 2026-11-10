// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabBar.tsx
 * @input React, StyleX, Core's theme tokens and hooks, TabBar's touch layer
 *   (TabBarTouch.ts), its geometry (tabBarModel.ts), its UIKit values
 *   (uikitTabBar.ts) and its panel scroll (panelScroll.ts)
 * @output TabBar (iOS 26's floating tab bar) and TabBarItem
 * @position Lab component: the phone presentation of an app's top-level
 *   sections, UITabBarController's counterpart
 *
 * SYNC: When modified, update TabBar.doc.mjs, TabBar.test.tsx and
 * __tests__/TabBar.interaction.browser.spec.ts.
 */

import {
  Children,
  isValidElement,
  useCallback,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useListFocus, useMergedRefs} from '@astryxdesign/core/hooks';
import {useTouchPresentation} from '@astryxdesign/core/internal/touch';
import {
  colorVars,
  durationVars,
  easeVars,
  focusVars,
  fontWeightVars,
  radiusVars,
  shadowVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {useTranslator} from '@astryxdesign/core/i18n';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {tabBarItemMarker} from './tabBar.stylex';
import {tabBar} from './uikitTabBar';
import {useTabBarLens} from './TabBarTouch';
import {itemWidthCss, naturalWidth} from './tabBarModel';
import {scrollPanelToTop} from './panelScroll';

// =============================================================================
// Types
// =============================================================================

export interface TabBarItemProps {
  /** Identifies the tab in `value`, `onChange` and `onReselect`. */
  value: string;
  /** The tab's name, shown under its icon. */
  label: string;
  /** The tab's icon, drawn in the current text colour (an `<Icon />`). */
  icon: ReactNode;
  /** The icon while the tab is selected (a filled variant). Defaults to `icon`. */
  selectedIcon?: ReactNode;
  /**
   * A badge over the icon's top-trailing corner: a count or a short string.
   * Omit it, or pass an empty string, for no badge.
   */
  badge?: string | number;
  /**
   * What assistive technology reads for the badge, after the label
   * ("3 unread"). Defaults to the badge itself.
   */
  badgeLabel?: string;
  /**
   * Id of the panel this tab controls, wired up as `aria-controls`. Put the
   * same id on the panel element. Choosing the selected tab again scrolls
   * that panel to its top: the panel itself when it scrolls, or else the
   * first scroll area inside it.
   */
  panelId?: string;
  /**
   * Disables the tab, as on Core's Tab: it stays focusable, dimmed, and is
   * never chosen. A tap, a click or a key on it, or a lift over it, selects
   * nothing, and the arrow keys skip it.
   */
  'aria-disabled'?: boolean | 'true' | 'false';
}

export interface TabBarProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;
  /** The selected tab's `value`. */
  value: string;
  /** Called with a tab's `value` when a different tab is chosen. */
  onChange: (value: string) => void;
  /**
   * Called with the selected tab's `value` when it is chosen again: pop its
   * navigation stack to the root, as iOS does. Its panel (`panelId`) also
   * scrolls to its top.
   */
  onReselect?: (value: string) => void;
  /**
   * Names the tab bar for assistive technology. Without it, or `aria-label`
   * or `aria-labelledby`, the tab list is named "Tabs" in the reader's
   * language, as TabList's is.
   */
  label?: string;
  /** Names the tab list, as `label` does; it wins over `label`. */
  'aria-label'?: string;
  /** Names the tab list after another element; it wins over both. */
  'aria-labelledby'?: string;
  /** The tabs: `TabBarItem` elements, in order. */
  children: ReactNode;
}

/**
 * One tab of a TabBar. It renders nothing on its own: TabBar reads its props
 * and draws the tab (it must be a direct child of TabBar).
 */
export function TabBarItem(_props: TabBarItemProps): null {
  return null;
}

function readItems(children: ReactNode): TabBarItemProps[] {
  return Children.toArray(children).flatMap(child =>
    isValidElement(child) && child.type === TabBarItem
      ? [(child as ReactElement<TabBarItemProps>).props]
      : [],
  );
}

function isDisabledItem(item: TabBarItemProps | undefined): boolean {
  const disabled = item?.['aria-disabled'];
  return disabled === true || disabled === 'true';
}

function hasBadge(badge: string | number | undefined): boolean {
  return badge != null && badge !== '';
}

// =============================================================================
// Geometry, as CSS on the capsule (a size container: 100cqw is its width)
// =============================================================================

const px = (value: number) => `${value}px`;
const INSET = px(tabBar.itemInset);

/** The distance between neighbouring items' centres. */
function pitch(count: number): string {
  return count > 1
    ? `((100cqw - ${px(2 * tabBar.itemInset)} - ${itemWidthCss(count)}) / ${count - 1})`
    : '0px';
}

/** An item's centre from the capsule's inline start, inside a calc(). */
function center(index: number, count: number): string {
  return count > 1
    ? `${INSET} + ${itemWidthCss(count)} / 2 + ${pitch(count)} * ${index}`
    : '50cqw';
}

/**
 * An item button's column, and where the item starts inside it. The column runs
 * from halfway to the previous item to halfway to the next. The first and last
 * columns end at the capsule's edges.
 */
function column(
  index: number,
  count: number,
): {start: string; width: string; itemStart: string} {
  if (count <= 1) {
    return {
      start: '0px',
      width: '100cqw',
      itemStart: `calc(50cqw - ${itemWidthCss(count)} / 2)`,
    };
  }
  const half = `${pitch(count)} / 2`;
  const edgeWidth = `calc(${INSET} + ${itemWidthCss(count)} / 2 + ${half})`;
  if (index === 0) {
    return {start: '0px', width: edgeWidth, itemStart: INSET};
  }
  return {
    start: `calc(${center(index, count)} - ${half})`,
    width: index === count - 1 ? edgeWidth : `calc(${pitch(count)})`,
    itemStart: `calc(${half} - ${itemWidthCss(count)} / 2)`,
  };
}

/** How far the lens's resting place is from the first item. */
function lensOffset(index: number, count: number): string {
  return count > 1 ? `calc(${pitch(count)} * ${index})` : '0px';
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    // No page-level stacking rank: the lens and the badges order inside the
    // bar's own stacking context.
    isolation: 'isolate',
    display: 'flex',
    justifyContent: 'center',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  rootInset: (inset: string) => ({
    paddingInline: inset,
    paddingBottom: inset,
  }),
  capsule: {
    position: 'relative',
    flexGrow: 1,
    minWidth: 0,
    containerType: 'inline-size',
    pointerEvents: 'auto',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-background-popover']} 78%, transparent)`,
    backdropFilter: 'blur(16px) saturate(180%)',
    boxShadow: shadowVars['--shadow-med'],
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  capsuleSize: (height: string, maxWidth: string) => ({height, maxWidth}),
  item: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    font: 'inherit',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  column: (start: string, width: string) => ({
    insetInlineStart: start,
    width,
  }),
  itemBox: {
    position: 'absolute',
    display: 'block',
    borderRadius: radiusVars['--radius-full'],
    outlineStyle: {
      default: 'none',
      [stylex.when.ancestor(':focus-visible', tabBarItemMarker)]:
        focusVars['--focus-outline-style'],
    },
    outlineWidth: focusVars['--focus-outline-width'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
    // With no tab selected, a held finger paints its tab at once
    // (useTabBarLens.ts writes the attribute). The paint is a layer, and only
    // its opacity fades after the lift, so the compositor runs the fade. It
    // plays the theme's exit duration and curve. Under Reduce Motion the fade
    // stays within 200 ms, whatever the theme's tempo.
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      backgroundColor: colorVars['--color-overlay-pressed'],
      pointerEvents: 'none',
      opacity: {
        default: 0,
        [stylex.when.ancestor('[data-tab-bar-pressed]', tabBarItemMarker)]: 1,
      },
      transitionProperty: 'opacity',
      transitionDuration: {
        default: durationVars['--duration-exit'],
        '@media (prefers-reduced-motion: reduce)': `min(${durationVars['--duration-exit']}, 200ms)`,
        // Repeated inside the Reduce Motion branch, where a media rule
        // outranks the plain one, so the onset stays at once there too.
        [stylex.when.ancestor('[data-tab-bar-pressed]', tabBarItemMarker)]: {
          default: '0s',
          '@media (prefers-reduced-motion: reduce)': '0s',
        },
      },
      transitionTimingFunction: easeVars['--ease-exit'],
    },
  },
  box: (start: string, top: string, width: string, height: string) => ({
    insetInlineStart: start,
    top,
    width,
    height,
  }),
  icon: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    insetInline: 0,
    overflow: 'hidden',
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: typographyVars['--font-family-body'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  labelGeometry: (top: string, height: string, fontSize: string) => ({
    top,
    height,
    fontSize,
    lineHeight: height,
  }),
  labelSelected: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  lens: {
    position: 'absolute',
    pointerEvents: 'none',
    transitionProperty: 'translate',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      // Under a finger the animator moves it (TabBarTouch.ts); under Reduce
      // Motion a touch screen cross-fades it there and a mouse jumps.
      '@media (pointer: coarse)': '0s',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': '0s',
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // At rest the lens is the pill under the selected item, which draws its own
  // selected look. While it slides it carries the copy over the items.
  lensUnder: {
    zIndex: -1,
  },
  lensRest: (offset: string) => ({
    translate: {
      default: `${offset} 0`,
      ':is([dir="rtl"] *)': `calc(-1 * ${offset}) 0`,
    },
  }),
  lensBody: {
    position: 'absolute',
    inset: 0,
    // The lifted lens's shadow, outside the clip: the animator fades it in.
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-full'],
      boxShadow: shadowVars['--shadow-med'],
      opacity: 0,
      // The animator promotes it while it moves (core's animator.ts).
      willChange: 'var(--astryx-motion-will-change-before, auto)',
    },
  },
  lensClip: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-full'],
    // Opaque: while it slides it hides the plain items under the copy.
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-text-primary']} 9%, ${colorVars['--color-background-popover']})`,
    // The lifted lens: the capsule's own surface with a light rim, opaque so
    // the plain copy under it stays hidden; the animator fades it in.
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-full'],
      backgroundColor: colorVars['--color-background-popover'],
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colorVars['--color-text-primary']} 10%, transparent)`,
      opacity: 0,
      // The animator promotes it while it moves (core's animator.ts).
      willChange: 'var(--astryx-motion-will-change-before, auto)',
    },
  },
  copyInner: {
    position: 'absolute',
    inset: 0,
  },
  // Mounted only while the lens slides under a finger, where the animator
  // moves it: no transition of its own.
  copyOuter: {
    position: 'absolute',
    width: '100cqw',
  },
  copyOuterGeometry: (inset: string, height: string) => ({
    insetInlineStart: `calc(-1 * ${inset})`,
    top: `calc(-1 * ${inset})`,
    height,
  }),
  copyRest: (offset: string) => ({
    translate: {
      default: `calc(-1 * ${offset}) 0`,
      ':is([dir="rtl"] *)': `${offset} 0`,
    },
  }),
  copyItem: {
    position: 'absolute',
    color: colorVars['--color-accent'],
  },
  // The selected tab's own look at rest: the copy's accent.
  itemSelectedLook: {
    color: colorVars['--color-accent'],
  },
  itemDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  badges: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  badge: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    fontFamily: typographyVars['--font-family-body'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    fontVariantNumeric: 'tabular-nums',
    backgroundColor: colorVars['--color-error'],
    color: colorVars['--color-on-error'],
  },
  badgeGeometry: (
    start: string,
    top: string,
    height: string,
    paddingInline: string,
    fontSize: string,
  ) => ({
    insetInlineStart: start,
    top,
    height,
    minWidth: height,
    paddingInline,
    borderRadius: `calc(${height} / 2)`,
    fontSize,
    lineHeight: height,
  }),
});

// =============================================================================
// Pieces
// =============================================================================

const ITEM_TOP = px(tabBar.itemInset);
const ITEM_HEIGHT = px(tabBar.itemHeight);
const ICON_START = `calc(50% - ${px(tabBar.iconSize / 2)})`;
const ICON_TOP = px(tabBar.iconCenterY - tabBar.iconSize / 2);
const ICON_SIZE = px(tabBar.iconSize);
const LABEL_TOP = px(tabBar.labelTop);
const LABEL_HEIGHT = px(tabBar.labelSize * 1.2);
const LABEL_SIZE = px(tabBar.labelSize);

/**
 * An item's icon and label, in the plain or the selected look; the lens's
 * copy keeps them out of the accessibility tree.
 */
function ItemFace({
  item,
  isSelectedLook,
  isCopy = false,
}: {
  item: TabBarItemProps;
  isSelectedLook: boolean;
  isCopy?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden
        {...stylex.props(
          styles.icon,
          styles.box(ICON_START, ICON_TOP, ICON_SIZE, ICON_SIZE),
        )}>
        {isSelectedLook ? (item.selectedIcon ?? item.icon) : item.icon}
      </span>
      <span
        aria-hidden={isCopy || undefined}
        {...stylex.props(
          styles.label,
          styles.labelGeometry(LABEL_TOP, LABEL_HEIGHT, LABEL_SIZE),
          isSelectedLook && styles.labelSelected,
        )}>
        {item.label}
      </span>
    </>
  );
}

// =============================================================================
// TabBar
// =============================================================================

/*
 * Layout is CSS, so the bar is right before hydration and through a resize.
 * Each button spans to halfway to its neighbours, so a press goes to the
 * nearest item. While the lens moves under a finger, a copy of the items rides
 * in it, so an item half under the lens is half tinted.
 */
/**
 * The iOS 26 tab bar: the app's top-level sections as a floating capsule at
 * the bottom of the screen. A selection lens slides between them.
 *
 * @example
 * ```
 * <TabBar value={tab} onChange={setTab} onReselect={popToRoot} label="Sections">
 *   <TabBarItem value="home" label="Home" icon={<Icon icon={HomeIcon} />} />
 *   <TabBarItem value="inbox" label="Inbox" icon={<Icon icon={InboxIcon} />} badge={3} />
 * </TabBar>
 * ```
 */
export function TabBar({
  value,
  onChange,
  onReselect,
  label,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  children,
  xstyle,
  className,
  style,
  ref,
  ...props
}: TabBarProps) {
  const t = useTranslator();
  // The tab list always has a name, and the aria naming props reach it rather
  // than the root, as TabList's do.
  const tabListLabel =
    ariaLabelledBy != null
      ? undefined
      : (ariaLabel ?? label ?? t('@astryx.tabList.label'));
  const items = readItems(children);
  const count = items.length;
  const selectedIndex = items.findIndex(item => item.value === value);
  const baseId = useId();

  // UIKit's motion belongs to a finger (a coarse primary pointer, iOS and
  // Android alike). Under a fine pointer a press is a plain button press, and
  // the lens keeps the theme's motion.
  const isTouch = useTouchPresentation().isTouch;

  const capsuleRef = useRef<HTMLDivElement | null>(null);
  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    itemSelector: '[role="tab"]',
    orientation: 'horizontal',
    hasRovingTabIndex: true,
  });
  const choose = useCallback(
    (item: TabBarItemProps) => {
      if (isDisabledItem(item)) {
        return;
      }
      if (item.value === value) {
        const document = capsuleRef.current?.ownerDocument;
        if (document != null) {
          scrollPanelToTop(document, item.panelId);
        }
        onReselect?.(item.value);
      } else {
        onChange(item.value);
      }
    },
    [value, onChange, onReselect],
  );
  const lens = useTabBarLens({
    capsuleRef,
    count,
    selectedIndex,
    isTouch,
    onLift: index => choose(items[index]),
    isDisabled: index => isDisabledItem(items[index]),
  });
  const mergedCapsuleRef = useMergedRefs(capsuleRef, listRef, lens.capsule);

  const restIndex = Math.max(selectedIndex, 0);
  const capsuleInset = px(tabBar.itemInset);
  const itemSize = `calc(${itemWidthCss(count)})`;

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('tab-bar'),
        stylex.props(
          styles.root,
          styles.rootInset(px(tabBar.barInset)),
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      <div
        ref={mergedCapsuleRef}
        role="tablist"
        aria-label={tabListLabel}
        aria-labelledby={ariaLabelledBy}
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        {...stylex.props(
          styles.capsule,
          styles.capsuleSize(px(tabBar.barHeight), px(naturalWidth(count))),
        )}>
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isDisabled = isDisabledItem(item);
          const {start, width, itemStart} = column(index, count);
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={isSelected}
              aria-disabled={isDisabled || undefined}
              aria-controls={item.panelId}
              tabIndex={
                isSelected || (selectedIndex < 0 && index === 0) ? 0 : -1
              }
              // A badge is part of the name: one message with both.
              aria-label={
                hasBadge(item.badge)
                  ? t('@astryx.tabBar.badgedItem', {
                      label: item.label,
                      badge: item.badgeLabel ?? String(item.badge),
                    })
                  : undefined
              }
              data-tab-bar-value={item.value}
              onClick={() => choose(item)}
              {...mergeProps(
                themeProps('tab-bar-item', {
                  selected: isSelected ? 'selected' : null,
                }),
                stylex.props(
                  tabBarItemMarker,
                  styles.item,
                  styles.column(start, width),
                ),
              )}>
              <span
                {...stylex.props(
                  styles.itemBox,
                  // At rest the tab draws its selected look; while the lens
                  // slides, the copy inside it does.
                  isSelected && !lens.isCopyShown && styles.itemSelectedLook,
                  isDisabled && styles.itemDisabled,
                  styles.box(itemStart, ITEM_TOP, itemSize, ITEM_HEIGHT),
                )}>
                <ItemFace
                  item={item}
                  isSelectedLook={
                    isSelected && !isDisabled && !lens.isCopyShown
                  }
                />
              </span>
            </button>
          );
        })}
        {selectedIndex >= 0 ? (
          <div
            aria-hidden
            data-tab-bar-lens=""
            {...stylex.props(
              styles.lens,
              !lens.isCopyShown && styles.lensUnder,
              styles.box(capsuleInset, capsuleInset, itemSize, ITEM_HEIGHT),
              styles.lensRest(lensOffset(restIndex, count)),
            )}>
            <div
              ref={lens.body}
              data-tab-bar-lens-body=""
              {...stylex.props(styles.lensBody)}>
              <div
                ref={lens.clip}
                data-tab-bar-lens-clip=""
                {...stylex.props(styles.lensClip)}>
                {lens.isCopyShown ? (
                  <div
                    ref={lens.copy}
                    data-tab-bar-copy=""
                    {...stylex.props(styles.copyInner)}>
                    <div
                      {...stylex.props(
                        styles.copyOuter,
                        styles.copyOuterGeometry(
                          capsuleInset,
                          px(tabBar.barHeight),
                        ),
                        styles.copyRest(lensOffset(restIndex, count)),
                      )}>
                      {items.map((item, index) => (
                        <span
                          key={item.value}
                          ref={lens.copyItem(index)}
                          data-tab-bar-copy-item={item.value}
                          {...stylex.props(
                            styles.copyItem,
                            styles.box(
                              `calc(${center(index, count)} - ${itemWidthCss(count)} / 2)`,
                              ITEM_TOP,
                              itemSize,
                              ITEM_HEIGHT,
                            ),
                            isDisabledItem(item) && styles.itemDisabled,
                          )}>
                          <ItemFace
                            item={item}
                            isSelectedLook={!isDisabledItem(item)}
                            isCopy
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <div aria-hidden {...stylex.props(styles.badges)}>
          {items.map((item, index) =>
            hasBadge(item.badge) ? (
              <span
                key={item.value}
                data-tab-bar-badge={item.value}
                {...stylex.props(
                  styles.badge,
                  styles.badgeGeometry(
                    `calc(${center(index, count)} + ${px(tabBar.badge.offsetX)})`,
                    px(tabBar.itemInset + tabBar.badge.offsetY),
                    px(tabBar.badge.height),
                    px(tabBar.badge.paddingInline),
                    px(tabBar.badge.fontSize),
                  ),
                )}>
                {item.badge}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
