// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavMegaMenu.tsx
 * @input Uses React, StyleX, usePopover (Popover API + CSS anchor positioning)
 * @output Exports TopNavMegaMenu component and related types
 * @position Navigation item with hover-triggered full-width mega menu for TopNav
 *
 * Uses usePopover to promote the panel to the top layer via the Popover API,
 * eliminating z-index stacking. CSS anchor positioning places the panel below
 * the nav wrapper.
 *
 * The default (desktop) trigger opens on hover and click. Hover opens are
 * transient; click/keyboard opens are pinned. A click shortly after hover-open
 * confirms and pins the panel instead of closing it. The panel remains an auto
 * popover for native dismissal and sibling exclusivity; `popoverTarget`
 * registers the trigger as its native invoker so the guard runs before any
 * dismiss.
 *
 * Supports three render modes via TopNavRenderContext:
 * - 'default': desktop popover mega menu (hover/click triggered)
 * - 'mobile-bar': returns null (hidden in compact mobile bar)
 * - 'drawer': drill-down navigation with back button
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TopNav/TopNav.doc.mjs
 * - /packages/core/src/TopNav/index.ts
 * - /packages/cli/assets/templates/blocks/components/TopNav/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  fontWeightVars,
  shadowVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import {usePopover} from '../Popover/usePopover';
import {useMenuHover} from '../hooks/useMenuHover';
import {Grid} from '../Grid/Grid';
import {Icon} from '../Icon';
import {mergeProps, composeEventHandlers} from '../utils';
import type {BaseProps} from '../BaseProps';
import {navItemStyles} from '../NavItem/navItemStyles.stylex';
import {useTopNavSlot} from './TopNavContext';
import {useTopNavRenderMode} from './TopNavRenderContext';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

import {useMergedRefs} from '../hooks/useMergedRefs';
// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    textDecoration: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color, color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    borderWidth: 0,
    borderStyle: 'none',
    fontFamily: 'inherit',
  },
  triggerOpen: {
    color: colorVars['--color-text-primary'],
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    // The registry chevron is a 1em SVG, so it has always rendered at the
    // trigger's own font size (--text-label-size). Icon's size box would repin
    // it to a fixed rem (the nearest, sm, is 1rem = 16px vs the 14px here), so
    // hold it on the inherited em: same pixels, and still tracks the type
    // scale when a theme changes the label size.
    width: '1em',
    height: '1em',
    fontSize: 'inherit',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  // Animation styles applied to the layer's popover element. Under
  // `prefers-reduced-motion: reduce` the panel never rises (design:reduced-motion
  // DR1): on a touch screen it cross-fades, 200 ms on easeInOut whatever the
  // theme's duration (DR2, DR4), and with a mouse it opens and closes at once
  // (DR3).
  panelAnimation: {
    opacity: {
      default: 0,
      ':popover-open': 1,
    },
    transform: {
      default: 'translateY(-4px)',
      ':popover-open': 'translateY(0)',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    transitionProperty: {
      default: 'opacity, transform, overlay, display',
      '@media (prefers-reduced-motion: reduce)': 'opacity, overlay, display',
    },
    transitionDuration: {
      default: durationVars['--duration-medium-min'],
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': '200ms',
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
    },
    transitionTimingFunction: {
      default: easeVars['--ease-standard'],
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        'cubic-bezier(0.42, 0, 0.58, 1)',
    },
    transitionBehavior: 'allow-discrete',
    '@starting-style': {
      opacity: 0,
      transform: 'translateY(-4px)',
    },
  },
  // Clamp the anchored layer to the space available below the nav so a tall
  // menu never runs off the bottom of the viewport. The layer is positioned
  // with position-area: self-block-end, so its containing block spans from
  // the nav's block-end to the viewport edge — 100% is exactly that space.
  // The layer is a flex column so panelContainer can shrink and scroll its
  // own content, keeping the surface radius/shadow static at the edges.
  // Internal scroll is a stopgap until the mobile bottom-sheet lands.
  panelViewportFit: {
    display: {
      default: 'none',
      ':popover-open': 'flex',
    },
    flexDirection: 'column',
    maxHeight: `calc(100% - ${spacingVars['--spacing-3']})`,
  },
  // Visual styles for the panel content container.
  panelContainer: {
    backgroundColor: colorVars['--color-background-popover'],
    borderTopWidth: borderVars['--border-width'],
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-low'],
    overflow: 'hidden',
    // Allow the container to shrink inside the height-clamped layer so its
    // content (panelContent) can scroll rather than overflow the viewport.
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  panelContent: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-6'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
    // Clamp to the viewport (minus a gutter) so the anchored panel never
    // overflows the screen edge on narrow viewports; caps at 960px otherwise.
    maxWidth: `min(960px, calc(100dvw - ${spacingVars['--spacing-4']}))`,
    boxSizing: 'border-box',
    // Scroll internally when the menu is taller than the available space
    // below the nav (paired with panelViewportFit on the layer).
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  menuWrapper: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 300,
    minWidth: 0,
  },
  featured: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  // =========================================================================
  // Drawer mode styles (composes navItemStyles.item as base)
  // =========================================================================
  drawerSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  // Header button override — justifyContent and button resets only,
  // base layout/colors come from navItemStyles.item
  drawerHeader: {
    justifyContent: 'space-between',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
  },
  drawerChevron: {
    display: 'inline-flex',
    // Same em pin as styles.chevron above — the drawer header inherits
    // --text-label-size from navItemStyles.item.
    width: '1em',
    height: '1em',
    fontSize: 'inherit',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  drawerChevronExpanded: {
    transform: 'rotate(180deg)',
  },
  // Clips only while collapsed or animating; see TopNavMenu drawerStyles.items.
  drawerItems: {
    display: 'grid',
    gridTemplateRows: '0fr',
    overflow: 'hidden',
    transitionProperty: 'grid-template-rows, overflow',
    transitionBehavior: 'allow-discrete',
    transitionDuration: `${durationVars['--duration-medium']}, 0s`,
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  drawerItemsExpanded: {
    gridTemplateRows: '1fr',
    overflow: 'visible',
    transitionDelay: `0s, ${durationVars['--duration-medium']}`,
  },
  drawerItemsInner: {
    minHeight: 0,
  },

  // Featured card in drawer — compact version
  drawerFeatured: {
    marginBlockStart: spacingVars['--spacing-2'],
    marginInlineStart: spacingVars['--spacing-6'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
    overflow: 'hidden',
  },
});

// =============================================================================
// Types
// =============================================================================

export interface TopNavMegaMenuProps extends BaseProps<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>;
  /** The visible label for the nav item trigger. */
  label: string;
  /**
   * Menu items slot — typically one or more TopNavMegaMenuItem components,
   * but accepts any ReactNode for custom layouts.
   */
  items?: ReactNode;
  /**
   * Featured content slot — rendered in the right panel on desktop,
   * and below the items in the mobile drawer.
   */
  featured?: ReactNode;
  /** Delay before showing the menu on hover (ms). @default 150 */
  delay?: number;
  /** Delay before hiding the menu after mouse leaves (ms). @default 250 */
  hideDelay?: number;
  /**
   * Callback fired when the mega menu opens or closes.
   * Useful for coordinating wrapper styles (e.g. hiding other shadows).
   */
  onOpenChange?: (isOpen: boolean) => void;
}

// =============================================================================
// TopNavMegaMenu
// =============================================================================

/**
 * A navigation item that displays a full-width mega menu on hover.
 *
 * Uses a composed children API with sub-components:
 * - `items` — ReactNode slot, typically TopNavMegaMenuItem components
 * - `featured` — ReactNode slot for the right-panel / drawer featured card
 *
 * Supports three render modes via TopNavRenderContext:
 * - `'default'`: desktop popover with hover/click trigger
 * - `'mobile-bar'`: hidden (returns null)
 * - `'drawer'`: inline collapsible matching TopNavMenu pattern
 *
 * @example
 * ```
 * <TopNav
 *   startContent={
 *     <TopNavMegaMenu
 *       label="Products"
 *       items={
 *         <>
 *           <TopNavMegaMenuItem
 *             title="Analytics"
 *             description="Track behavior"
 *             icon={<ChartIcon />}
 *             href="/analytics"
 *           />
 *           <TopNavMegaMenuItem
 *             title="Messaging"
 *             description="Real-time comms"
 *             icon={<ChatIcon />}
 *             href="/messaging"
 *           />
 *         </>
 *       }
 *       featured={
 *         <>
 *           <strong>New: AI Features</strong>
 *           <p>Explore our latest AI-powered tools.</p>
 *         </>
 *       }
 *     />
 *   }
 * />
 * ```
 */
export function TopNavMegaMenu({
  ref,
  label,
  items,
  featured,
  delay = 150,
  hideDelay = 250,
  onOpenChange,
  ...rest
}: TopNavMegaMenuProps) {
  const renderMode = useTopNavRenderMode();

  // =========================================================================
  // Mobile-bar mode — hidden
  // =========================================================================
  if (renderMode === 'mobile-bar') {
    return null;
  }

  // =========================================================================
  // Drawer mode — inline collapsible
  // =========================================================================
  if (renderMode === 'drawer') {
    return (
      <DrawerMegaMenu
        label={label}
        items={items}
        featured={featured}
        {...rest}
      />
    );
  }

  // =========================================================================
  // Default mode — desktop popover
  // =========================================================================
  return (
    <DefaultMegaMenu
      ref={ref}
      label={label}
      items={items}
      featured={featured}
      delay={delay}
      hideDelay={hideDelay}
      onOpenChange={onOpenChange}
      {...rest}
    />
  );
}

TopNavMegaMenu.displayName = 'TopNavMegaMenu';

// =============================================================================
// DefaultMegaMenu — desktop popover mode
// =============================================================================

/** The panel is a grid of links, not `role="menuitem"` rows. */
const PANEL_ITEM_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DefaultMegaMenu({
  ref,
  label,
  items,
  featured,
  delay = 150,
  hideDelay = 250,
  onOpenChange,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  onMouseEnter: onMouseEnterProp,
  onMouseLeave: onMouseLeaveProp,
  ...rest
}: TopNavMegaMenuProps) {
  const slot = useTopNavSlot();
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  const handlePopoverShow = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handlePopoverHide = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  const popover = usePopover({
    // role: 'none' — the panel exposes its own role="group" labeled by
    // `label`. Pointer/hover opens keep focus on the trigger; keyboard and
    // assistive-tech opens move focus into the panel (a labeled group you exit
    // with Escape or by tabbing out). Either way role="dialog"
    // aria-modal="true" would be wrong: it announces an unnamed modal dialog
    // around a grid of links (and, when focus stays on the trigger, marks the
    // focused control inert).
    role: 'none',
    // hasSurface: false — mega menu provides its own surface (panelContainer)
    // with border-top and custom overflow. Animation is applied via the
    // render() call's xstyle prop (panelAnimation), not the hook options.
    hasSurface: false,
    // Keep native outside-click/Escape dismissal and sibling exclusivity.
    // The trigger's popoverTarget association prevents its activation from
    // being treated as an ordinary outside interaction.
    hasLightDismiss: true,
    onShow: handlePopoverShow,
    onHide: handlePopoverHide,
  });

  // Set the CSS anchor to the parent <nav> element (the TopNav).
  useEffect(() => {
    const nav = triggerButtonRef.current?.closest('nav');
    if (nav) {
      popover.triggerRef(nav);
    }
    return () => {
      popover.triggerRef(null);
    };
  }, [popover]);

  const {
    triggerProps: hoverTriggerProps,
    contentProps,
    menuRef,
    setTriggerEl,
  } = useMenuHover<HTMLDivElement>({
    show: popover.show,
    hide: popover.hide,
    isOpen: popover.isOpen,
    isEnabled: true,
    showDelay: delay,
    hideDelay,
    itemSelector: PANEL_ITEM_SELECTOR,
    // Trigger sits outside an auto popover; the invoker relationship exempts it
    // from light dismiss.
    popoverId: popover.id,
  });

  return (
    <>
      <button
        ref={useMergedRefs(triggerButtonRef, setTriggerEl, ref)}
        type="button"
        {...rest}
        {...popover.triggerProps}
        {...hoverTriggerProps}
        onClick={composeEventHandlers(onClickProp, hoverTriggerProps.onClick)}
        onMouseEnter={composeEventHandlers(
          onMouseEnterProp,
          hoverTriggerProps.onMouseEnter,
        )}
        onMouseLeave={composeEventHandlers(
          onMouseLeaveProp,
          hoverTriggerProps.onMouseLeave,
        )}
        {...mergeProps(
          themeProps('top-nav-mega-menu'),
          focusOutlineProps.focusVisible(
            styles.trigger,
            popover.isOpen && styles.triggerOpen,
            xstyle,
          ),
          className,
          style,
        )}>
        {label}
        <Icon
          icon="chevronDown"
          size="sm"
          color="inherit"
          xstyle={[styles.chevron, popover.isOpen && styles.chevronOpen]}
        />
      </button>
      {popover.render(
        <div
          // role="group" — a mega menu is a browsing grid of links, not an
          // ARIA menu of menuitems (per the WAI-ARIA APG, the menu role is
          // for action menus; link mega menus are the documented anti-case).
          ref={menuRef}
          role="group"
          aria-label={label}
          {...contentProps}
          {...stylex.props(styles.panelContainer)}>
          <div {...stylex.props(styles.panelContent)}>
            {/* Menu items section */}
            {items != null && (
              <Grid columns={2} gap={2} xstyle={styles.menuWrapper}>
                {items}
              </Grid>
            )}

            {/* Featured section */}
            {featured != null && (
              <div {...stylex.props(styles.featured)}>{featured}</div>
            )}
          </div>
        </div>,
        {
          placement: 'below',
          alignment: slot,
          xstyle: [styles.panelAnimation, styles.panelViewportFit],
        },
      )}
    </>
  );
}

// =============================================================================
// DrawerMegaMenu — mobile drawer inline collapsible mode
// =============================================================================

function DrawerMegaMenu({
  label,
  items,
  featured,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  ...rest
}: Pick<TopNavMegaMenuProps, 'label' | 'items' | 'featured'> &
  BaseProps<HTMLButtonElement>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const pressable = usePressFeedback();
  const menuId = `mega-menu-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div {...stylex.props(styles.drawerSection)}>
      {/* Header toggle — same pattern as TopNavMenu drawer */}
      <button
        type="button"
        {...rest}
        onClick={composeEventHandlers(onClickProp, () =>
          setIsExpanded(v => !v),
        )}
        aria-expanded={isExpanded}
        aria-controls={`${menuId}-items`}
        {...pressable}
        {...mergeProps(
          themeProps('top-nav-mega-menu', {mode: 'drawer'}),
          focusOutlineProps.focusVisible(
            navItemStyles.item,
            interactionOverlayStyles.backgroundColor,
            styles.drawerHeader,
            xstyle,
          ),
          className,
          style,
        )}>
        {label}
        <Icon
          icon="chevronDown"
          size="sm"
          color="inherit"
          xstyle={[
            styles.drawerChevron,
            isExpanded && styles.drawerChevronExpanded,
          ]}
        />
      </button>

      {/* Animated expand/collapse container */}
      <div
        id={`${menuId}-items`}
        aria-hidden={!isExpanded}
        inert={!isExpanded ? true : undefined}
        {...stylex.props(
          styles.drawerItems,
          isExpanded && styles.drawerItemsExpanded,
        )}>
        <div {...stylex.props(styles.drawerItemsInner)}>
          {/* Items render themselves in drawer mode via TopNavRenderContext */}
          {items}

          {/* Featured card */}
          {featured != null && (
            <div {...stylex.props(styles.drawerFeatured)}>{featured}</div>
          )}
        </div>
      </div>
    </div>
  );
}
