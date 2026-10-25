// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BreadcrumbItem.tsx
 * @input Uses React use/useRef/useEffect, stylex, theme tokens, BreadcrumbContext,
 *   rtlStyles for the contextual default slash, and (for the menu trigger)
 *   usePopover + the shared DropdownMenu item API (renderDropdownItems,
 *   DropdownMenuContext, MENU_ITEM_SELECTOR, useListFocus)
 * @output Exports BreadcrumbItem component and BreadcrumbItemProps
 * @position Individual breadcrumb item; used inside Breadcrumbs
 *
 * A `menu` prop turns the item's link-styled button into a menu trigger whose
 * popover reuses DropdownMenu's item pipeline — the same wiring ContextMenu
 * uses — so menu-item definitions are portable across the menu family.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Breadcrumbs/Breadcrumbs.doc.mjs
 * - /packages/core/src/Breadcrumbs/Breadcrumbs.test.tsx
 * - /packages/core/src/Breadcrumbs/index.ts
 * - /apps/storybook/stories/Breadcrumbs.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Breadcrumbs/ (showcase blocks)
 */

import React, {
  use,
  useCallback,
  useId,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
  type MouseEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  radiusVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {BreadcrumbContext, type BreadcrumbsVariant} from './Breadcrumbs';
import {useLinkComponent} from '../Link/useLinkComponent';
import type {LinkComponentType} from '../Link/types';
import {mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {Icon} from '../Icon';
import {usePopover} from '../Popover/usePopover';
import {useListFocus} from '../hooks/useListFocus';
import {useTypeahead} from '../hooks/useTypeahead';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {renderDropdownItems} from '../DropdownMenu/renderDropdownItems';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
  type DropdownMenuContextValue,
  type DropdownMenuSize,
} from '../DropdownMenu/DropdownMenuContext';
import {
  MENU_ITEM_ROLES,
  MENU_ITEM_SELECTOR,
  MENU_BOUNDARY_SELECTOR,
} from '../DropdownMenu/menuItemRoles';
import type {DropdownMenuOption} from '../DropdownMenu/DropdownMenu';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useInteractionModalityTracking} from '../utils/interactionModality';
// =============================================================================
// Props
// =============================================================================

export interface BreadcrumbItemProps extends Omit<
  BaseProps<HTMLLIElement>,
  'onClick'
> {
  ref?: React.Ref<HTMLLIElement>;
  /**
   * Custom component to render instead of `<a>` for breadcrumb links.
   * Overrides the provider-level default set by LinkProvider.
   * Only applies for non-current items. Must accept href, className, style, and children props.
   */
  as?: LinkComponentType;
  /**
   * Label content of the breadcrumb item.
   */
  children: ReactNode;
  /**
   * URL for the breadcrumb link. Omit for the current page.
   */
  href?: string;
  /**
   * Click handler. Works with or without href.
   */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /**
   * Marks this item as the current page. Renders as a span with aria-current="page".
   * When omitted, the last item is auto-detected as current if no item is
   * explicitly current. Pass `false` to opt this item out of auto-detection.
   * @default undefined
   */
  isCurrent?: boolean;
  /**
   * Optional icon rendered before the label.
   */
  startIcon?: ReactNode;
  /**
   * Menu opened when the item is activated. Accepts the SAME item API as
   * DropdownMenu / MoreMenu / ContextMenu, so a consumer's existing menu-item
   * definitions are portable into a breadcrumb with no rewrite:
   * - a `DropdownMenuOption[]` data array (items, sections, dividers), or
   * - composed `DropdownMenuItem` / `DropdownMenuCheckboxItem` /
   *   `DropdownMenuRadioGroup` children.
   *
   * When set, the item renders as a link-styled menu trigger (button + a
   * trailing chevron, `aria-haspopup="menu"` / `aria-expanded`) whose popover
   * is a `role="menu"` container that provides `DropdownMenuContext` and runs
   * `useListFocus`. Takes precedence over `href` / `onClick` (which are
   * ignored when `menu` is set — a dev-time warning is logged).
   */
  menu?: DropdownMenuOption[] | ReactNode;
  /**
   * Size passed to the menu items via `DropdownMenuContext` (item
   * padding/typography). Defaults from the breadcrumb variant:
   * `'supporting'` → `'sm'`, otherwise `'md'`.
   */
  menuSize?: DropdownMenuSize;
}

// =============================================================================
// Styles
// =============================================================================

const itemStyles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    margin: 0,
    '--separator-display': {
      default: 'flex',
      ':first-child': 'none',
    },
  },
  defaultSize: {
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  supportingSize: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  contentWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    paddingBlock: spacingVars['--spacing-1'],
    textDecoration: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'underline',
      },
    },
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // Reset native button styles so onClick-only items match link appearance.
  // paddingInline rather than padding: a blanket `padding` also overrides the
  // paddingBlock `link` sets above, which shrank the button crumbs to 20px
  // against their sibling links' 28px.
  buttonReset: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    paddingInline: 0,
    margin: 0,
    font: 'inherit',
  },
  defaultLink: {
    color: colorVars['--color-text-secondary'],
  },
  supportingLink: {
    color: colorVars['--color-text-secondary'],
  },
  current: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  defaultCurrent: {
    color: colorVars['--color-text-primary'],
  },
  supportingCurrent: {
    color: colorVars['--color-text-secondary'],
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  chevron: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    // Sized off supporting text (12px) — exactly Icon's `xsm` box at the
    // default type scale. Width/height stay on the token so the box and the
    // glyph keep matching if a theme retunes the supporting step.
    width: typeScaleVars['--text-supporting-size'],
    height: typeScaleVars['--text-supporting-size'],
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  separator: {
    display: 'var(--separator-display)',
    alignItems: 'center',
    color: colorVars['--color-text-secondary'],
    paddingBlock: spacingVars['--spacing-1'],
    userSelect: 'none',
  },
});

function BreadcrumbSeparator({separator}: {separator: ReactNode}) {
  return (
    <span aria-hidden="true" {...stylex.props(itemStyles.separator)}>
      {separator === '/' ? (
        <span {...stylex.props(rtlStyles.mirror)}>/</span>
      ) : (
        separator
      )}
    </span>
  );
}

const menuStyles = stylex.create({
  menu: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    maxHeight: '300px',
    overflowY: 'auto',
    '--_dropdown-menu-radius': radiusVars['--radius-container'],
    '--_dropdown-menu-padding': spacingVars['--spacing-1'],
    padding: spacingVars['--spacing-1'],
    borderRadius: 'var(--_dropdown-menu-radius)',
    userSelect: 'none',
  },
  popover: {
    minWidth: '160px',
    marginBlock: spacingVars['--spacing-1'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * An individual breadcrumb item. Renders as a link (`<a>`) or a span
 * depending on whether it represents the current page.
 *
 * Each item renders its own leading separator, hidden on :first-child via
 * CSS. Auto-current detection uses a post-render effect that checks the
 * DOM — no React child introspection.
 *
 * @example
 * ```
 * <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
 * <BreadcrumbItem isCurrent>My Project</BreadcrumbItem>
 * ```
 */
export function BreadcrumbItem({
  ref,
  as,
  children,
  href,
  onClick,
  isCurrent: isCurrentProp,
  startIcon,
  menu,
  menuSize,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...rest
}: BreadcrumbItemProps) {
  const ctx = use(BreadcrumbContext);
  const LinkComponent = useLinkComponent(as);
  const isSupporting = ctx.variant === 'supporting';
  const liRef = useRef<HTMLLIElement>(null);
  // Points at the element we render to hold the item's content (the
  // link/button/span in the auto-candidate path). Auto-current detection sets
  // aria-current on this instead of guessing the <li>'s last child.
  const contentRef = useRef<HTMLElement>(null);

  const isCurrent = isCurrentProp === true;
  const isAutoCandidate = isCurrentProp == null;
  const hasMenu = menu != null;
  const resolvedMenuSize: DropdownMenuSize =
    menuSize ?? (isSupporting ? 'sm' : 'md');

  // `menu` owns the click interaction; a label can't both navigate/act and
  // open a menu on the same activation. Warn once so the (ignored) href/onClick
  // don't silently disappear on the consumer.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && hasMenu) {
      if (href != null) {
        console.warn(
          'BreadcrumbItem: `menu` and `href` are mutually exclusive; `menu` ' +
            'takes precedence and `href` is ignored.',
        );
      } else if (onClick != null) {
        console.warn(
          'BreadcrumbItem: `menu` and `onClick` are mutually exclusive; ' +
            '`menu` takes precedence and `onClick` is ignored.',
        );
      }
    }
  }, [hasMenu, href, onClick]);

  // Auto-detect: if no sibling has aria-current="page" and this is the last
  // non-separator item, set aria-current on our content element.
  // Runs as useEffect (not layout) — only sets an aria attribute, no visual change.
  // Placed on the item's content element (the link/button/span after the
  // separator), matching where the explicit `isCurrent` path sets it, so
  // aria-current lands on the actual interactive element — including when the
  // last item is a link — rather than on the outer <li> (navigation-11).
  useEffect(() => {
    if (!isAutoCandidate) {
      return;
    }

    const li = liRef.current;
    if (!li) {
      return;
    }
    const ol = li.parentElement;
    if (!ol) {
      return;
    }

    // All breadcrumb items (li without aria-hidden are items, with aria-hidden are separators — but we no longer have separator lis)
    const items = Array.from(ol.children) as HTMLElement[];
    const isLast = items.length > 0 && items[items.length - 1] === li;
    const hasExplicit = ol.querySelector('[aria-current="page"]');

    if (isLast && !hasExplicit) {
      // We control the element that holds the content (see the auto-candidate
      // render path below), so set aria-current on that ref rather than
      // assuming a positional last child. Fall back to the <li> only if the
      // ref is somehow unresolved.
      const target = contentRef.current ?? li;
      target.setAttribute('aria-current', 'page');
      return () => {
        target.removeAttribute('aria-current');
      };
    }
  });

  const mergedItemRef = useMergedRefs(ref, liRef);

  const content = (
    <>
      {startIcon && <span {...stylex.props(itemStyles.icon)}>{startIcon}</span>}
      {children}
    </>
  );

  if (isCurrent) {
    return (
      <li
        ref={mergedItemRef}
        {...mergeProps(
          themeProps('breadcrumb-item', {variant: ctx.variant}),
          stylex.props(
            itemStyles.root,
            isSupporting ? itemStyles.supportingSize : itemStyles.defaultSize,
            xstyle,
          ),
          className,
          style,
        )}
        data-testid={testId}
        {...rest}>
        <BreadcrumbSeparator separator={ctx.separator} />
        {hasMenu ? (
          // A current crumb can also open a sibling menu — the trigger keeps
          // both aria-current="page" and aria-haspopup="menu".
          <BreadcrumbMenuTrigger
            ref={contentRef}
            menu={menu}
            menuSize={resolvedMenuSize}
            variant={ctx.variant}
            isCurrent>
            {content}
          </BreadcrumbMenuTrigger>
        ) : (
          <span
            {...stylex.props(
              itemStyles.contentWrapper,
              itemStyles.current,
              isSupporting
                ? itemStyles.supportingCurrent
                : itemStyles.defaultCurrent,
            )}
            aria-current="page">
            {content}
          </span>
        )}
      </li>
    );
  }

  // Items without isCurrent set render as links (if href) or plain spans.
  // The effect handles adding aria-current for auto-last detection.
  return (
    <li
      ref={mergedItemRef}
      {...mergeProps(
        themeProps('breadcrumb-item', {variant: ctx.variant}),
        stylex.props(
          itemStyles.root,
          isSupporting ? itemStyles.supportingSize : itemStyles.defaultSize,
          xstyle,
        ),
        className,
        style,
      )}
      data-testid={testId}
      {...rest}>
      <BreadcrumbSeparator separator={ctx.separator} />
      {hasMenu ? (
        <BreadcrumbMenuTrigger
          ref={contentRef}
          menu={menu}
          menuSize={resolvedMenuSize}
          variant={ctx.variant}>
          {content}
        </BreadcrumbMenuTrigger>
      ) : href != null ? (
        <LinkComponent
          ref={contentRef}
          href={href}
          onClick={onClick}
          {...focusOutlineProps.focusVisible(
            itemStyles.link,
            isSupporting ? itemStyles.supportingLink : itemStyles.defaultLink,
          )}>
          {content}
        </LinkComponent>
      ) : onClick != null ? (
        <button
          ref={contentRef as React.RefObject<HTMLButtonElement | null>}
          type="button"
          onClick={onClick}
          {...focusOutlineProps.focusVisible(
            itemStyles.link,
            itemStyles.buttonReset,
            isSupporting ? itemStyles.supportingLink : itemStyles.defaultLink,
          )}>
          {content}
        </button>
      ) : (
        <span
          ref={contentRef}
          {...stylex.props(
            itemStyles.contentWrapper,
            itemStyles.current,
            isSupporting
              ? itemStyles.supportingCurrent
              : itemStyles.defaultCurrent,
          )}>
          {content}
        </span>
      )}
    </li>
  );
}

BreadcrumbItem.displayName = 'BreadcrumbItem';

// =============================================================================
// Menu trigger
// =============================================================================

interface BreadcrumbMenuTriggerProps {
  ref: React.Ref<HTMLElement>;
  /** The link-styled label content rendered inside the trigger button. */
  children: ReactNode;
  menu: DropdownMenuOption[] | ReactNode;
  menuSize: DropdownMenuSize;
  variant: BreadcrumbsVariant;
  isCurrent?: boolean;
}

/**
 * The link-styled `<button>` trigger + its `role="menu"` popover. Reuses the
 * DropdownMenu item pipeline (`renderDropdownItems` for arrays, the item
 * components for children) inside a `useListFocus` container that provides
 * `DropdownMenuContext` — the same wiring ContextMenu uses — so menu-item
 * definitions are portable into a breadcrumb with no rewrite.
 */
function BreadcrumbMenuTrigger({
  ref,
  children,
  menu,
  menuSize,
  variant,
  isCurrent = false,
}: BreadcrumbMenuTriggerProps) {
  const menuId = useId();
  const triggerId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isSupporting = variant === 'supporting';
  // The menu's rows move focus with the last input
  // (`architecture:interaction-modality` INV1); this menu has no press model
  // to activate the tracking they read, so it activates it itself.
  useInteractionModalityTracking();

  const popover = usePopover({
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own role="menu" is the exposed semantics; a modal dialog
    // wrapper would announce an unnamed dialog around the menu.
    role: 'none',
  });

  const closeMenu = useCallback(() => {
    popover.hide();
  }, [popover]);

  const {
    listRef,
    handleKeyDown: listNavKeyDown,
    focusFirst,
    focusItem,
    ownsEvent,
    getItems: getMenuItems,
  } = useListFocus<HTMLDivElement>({
    itemSelector: MENU_ITEM_SELECTOR,
    boundarySelector: MENU_BOUNDARY_SELECTOR,
    wrap: false,
    onEscape: closeMenu,
  });

  const typeahead = useTypeahead({
    getItemLabels: () => getMenuItems().map(el => el.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getMenuItems().findIndex(
        el =>
          el === document.activeElement || el.contains(document.activeElement),
      ),
  });

  const listKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // A submenu flyout renders inline inside this menu; its key events bubble
      // up here. Let that level own them — only handle events from this level.
      if (!ownsEvent(e)) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const focused = document.activeElement as HTMLElement | null;
        if (
          focused &&
          MENU_ITEM_ROLES.has(focused.getAttribute('role') ?? '')
        ) {
          focused.click();
        }
        return;
      }
      // APG menu-button pattern: Tab closes the menu (items are tabIndex={-1}).
      if (e.key === 'Tab') {
        closeMenu();
        return;
      }
      if (typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      listNavKeyDown(e);
    },
    [listNavKeyDown, closeMenu, typeahead, ownsEvent],
  );

  const openAndFocus = useCallback(() => {
    popover.show();
    requestAnimationFrame(() => focusFirst());
  }, [popover, focusFirst]);

  const handleClick = useCallback(() => {
    if (popover.isOpen) {
      popover.hide();
    } else {
      openAndFocus();
    }
  }, [popover, openAndFocus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!popover.isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAndFocus();
        }
      }
    },
    [popover.isOpen, openAndFocus],
  );

  const contextValue = useMemo<DropdownMenuContextValue>(
    () => ({closeMenu, menuSize}),
    [closeMenu, menuSize],
  );

  const menuContent = Array.isArray(menu) ? renderDropdownItems(menu) : menu;

  return (
    <>
      <button
        ref={useMergedRefs(
          ref as React.Ref<HTMLButtonElement>,
          buttonRef,
          popover.triggerRef,
        )}
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...popover.triggerProps}
        id={triggerId}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-current={isCurrent ? 'page' : undefined}
        {...mergeProps(
          themeProps('breadcrumb-item-menu-trigger', {variant}),
          // Through mergeProps, not a second spread: a sibling stylex.props()
          // spread replaces the className themeProps() built, which is how the
          // documented breadcrumb-item-menu-trigger target came to render on
          // nothing.
          focusOutlineProps.focusVisible(
            itemStyles.link,
            itemStyles.buttonReset,
            isSupporting ? itemStyles.supportingLink : itemStyles.defaultLink,
          ),
        )}>
        {children}
        <Icon
          icon="chevronDown"
          // 0.75rem — the 12px supporting-text box the bare glyph already
          // rendered at; `itemStyles.chevron` keeps that box on the token.
          size="xsm"
          // The chevron reads as part of the link label, so it takes the
          // trigger's link color rather than an icon color.
          color="inherit"
          xstyle={itemStyles.chevron}
        />
      </button>

      {popover.render(
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={listKeyDown}
          {...mergeProps(
            themeProps('breadcrumb-menu'),
            stylex.props(menuStyles.menu),
          )}>
          <DropdownMenuContext value={contextValue}>
            <DropdownMenuRootOpenContext value={popover.isOpen}>
              {menuContent}
            </DropdownMenuRootOpenContext>
          </DropdownMenuContext>
        </div>,
        {
          placement: 'below',
          alignment: 'start',
          xstyle: [menuStyles.popover, layerAnimations.below],
        },
      )}
    </>
  );
}

BreadcrumbMenuTrigger.displayName = 'BreadcrumbMenuTrigger';
