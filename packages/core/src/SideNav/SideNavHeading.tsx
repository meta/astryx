// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavHeading.tsx
 * @input Uses React, useRef, useCallback, ReactNode, StyleX, usePopover,
 *        useMenuHover
 * @output Exports SideNavHeading component and SideNavHeadingProps
 * @position Core implementation; used inside SideNav header slot
 *
 * Product/suite/account heading with smart interaction boundary logic.
 * Composes usePopover internally when menu prop is provided.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/SideNav/SideNav.doc.mjs
 * - /packages/core/src/SideNav/SideNav.test.tsx
 * - /packages/core/src/SideNav/index.ts
 * - /apps/storybook/stories/SideNav.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/SideNav/ (showcase blocks)
 */

import {useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  fontWeightVars,
  radiusVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
// TODO(#264): Lazy-load usePopover so the popover/layer bundle is not
// eagerly imported when `menu` is not provided. See Text for an example
// of lazy loading layer resources.
import {usePopover} from '../Popover/usePopover';
import {Link} from '../Link';
import {Icon} from '../Icon';
import {Tooltip} from '../Tooltip';
import {navItemStyles} from '../NavItem/navItemStyles.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useSideNavCollapse} from './SideNavCollapseContext';
import {useLinkComponent} from '../Link/useLinkComponent';
import type {LinkComponentType} from '../Link/types';
import {mergeProps} from '../utils';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {useMenuHover} from '../hooks/useMenuHover';
import {useMenuPress} from '../hooks/useMenuPress';
import {pressOnItemsOnly} from '../hooks/menuPressOnItems';
import {menuTouchActionStyles} from '../DropdownMenu/menuTouchAction.stylex';
import {useMenuOverflow} from '../DropdownMenu/useMenuOverflow';
import {
  NavHeadingCloseContext,
  NavHeadingDismissContext,
} from '../NavMenu/NavMenuContext';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

// =============================================================================
// Styles
// =============================================================================

/** The rows a press can act on in the heading's menu. */
const HEADING_MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([aria-disabled="true"])';

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minHeight: spacingVars['--spacing-8'],
    paddingInlineStart: {
      default: spacingVars['--spacing-2'],
      ':has(.astryx-nav-icon)': 0,
    },
    paddingInlineEnd: spacingVars['--spacing-2'],
    paddingBlock: 0,
    boxSizing: 'border-box',
    textDecoration: 'none',
    color: 'inherit',
    cursor: 'default',
  },
  rootCollapsed: {
    justifyContent: 'center',
    paddingInline: 0,
  },
  interactive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-element'],
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: fontWeightVars['--font-weight-normal'],
    textAlign: 'start',
    ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
      '@media (hover: hover)': {
        backgroundColor: colorVars['--color-overlay-hover'],
      },
    },
  },
  // Menu trigger: like interactive but no hover background.
  // Only cursor:pointer signals interactivity; the popover provides context.
  menuTrigger: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-element'],
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: fontWeightVars['--font-weight-normal'],
    textAlign: 'start',
  },
  interactiveCollapsed: {
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'transparent',
      },
    },
  },
  icon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  superheading: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  heading: {
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-large-leading'],
    color: colorVars['--color-text-primary'],
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // When super/sub headings are present, keep same size but allow compact layout
  headingCompact: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  subheading: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  headingLink: {
    textDecoration: 'none',
    color: 'inherit',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: spacingVars['--spacing-7'],
    minHeight: spacingVars['--spacing-7'],
    color: colorVars['--color-icon-secondary'],
    // 28px is the hit/alignment box, not the glyph. Icon sizes its own span
    // with a matching font-size (the registry chevron is a 1em SVG), so pin
    // font-size back to inherit to keep the glyph at the 14px it renders at
    // today. The 28px min box still wins over Icon's width/height.
    fontSize: 'inherit',
  },
  // The link part of a whole-heading link row that also has end content.
  linkBesideEndContent: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacingVars['--spacing-2'],
    flexGrow: 1,
    minWidth: 0,
    textDecoration: 'none',
    color: 'inherit',
  },
  headerEndContent: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    marginInlineStart: 'auto',
  },
  popoverContent: {
    padding: spacingVars['--spacing-1'],
    overflow: 'hidden',
  },
  // Static heading replica inside the popover — matches inline heading layout.
  // Clickable to close the popover.
  popoverHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    textAlign: 'start',
    minHeight: spacingVars['--spacing-8'],
    paddingInlineStart: {
      default: spacingVars['--spacing-2'],
      ':has(.astryx-nav-icon)': 0,
    },
    paddingInlineEnd: spacingVars['--spacing-2'],
    paddingBlock: 0,
    marginBlockStart: spacingVars['--spacing-1'],
    marginBlockEnd: spacingVars['--spacing-2'],
    marginInline: spacingVars['--spacing-1'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // Chevron inside the popover heading — same as chevron but rotated up
  popoverChevron: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: spacingVars['--spacing-7'],
    minHeight: spacingVars['--spacing-7'],
    color: colorVars['--color-icon-secondary'],
    // See `chevron` — keep the glyph on the inherited font-size.
    fontSize: 'inherit',
    transform: 'rotate(180deg)',
  },
  // Glyph inside a chevron *trigger* (the button already carries the 28px box
  // and the color, so the Icon only has to avoid resizing itself).
  chevronGlyph: {
    fontSize: 'inherit',
  },
  popover: {
    minWidth: 'anchor-size(width)',
    marginBlockStart: spacingVars['--spacing-1'],
  },
  // Overlap variant: popover covers the trigger so heading appears "in place".
  // Add 4px padding inside, then widen and shift to compensate so the
  // heading text inside the popover still aligns with the inline heading.
  popoverOverlap: {
    minWidth: 'calc(anchor-size(width) + 16px)',
    marginBlockStart: 'calc(-1 * anchor-size(height) - 8px)',
    marginInlineStart: '-8px',
  },
});

// =============================================================================
// Types
// =============================================================================

export interface SideNavHeadingProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Product/app icon.
   */
  icon?: ReactNode;
  /**
   * Custom component to render instead of `<a>`.
   * Overrides the provider-level default set by LinkProvider.
   * Must accept href, className, style, and children props.
   */
  as?: LinkComponentType;
  /**
   * Product/app name.
   */
  heading: string;
  /**
   * Link for the heading (e.g., product home).
   */
  headingHref?: string;
  /**
   * Text above the heading (e.g., suite name).
   */
  superheading?: string;
  /**
   * Link for the superheading (e.g., suite home).
   */
  superheadingHref?: string;
  /**
   * Text below the heading (e.g., account context).
   */
  subheading?: string;
  /**
   * Link for the subheading.
   */
  subheadingHref?: string;
  /**
   * Content rendered at the trailing edge of the heading row.
   * Hidden in collapsed mode.
   */
  headerEndContent?: ReactNode;
  /**
   * Menu content shown in a popover. When provided, the header composes
   * usePopover internally and shows a dropdown chevron. The trigger
   * boundary is determined automatically:
   * - No hrefs → whole header is the trigger
   * - With hrefs → links are independent, chevron/remaining area is the trigger
   */
  menu?: ReactNode;
}

// =============================================================================

// =============================================================================
// Component
// =============================================================================

/**
 * Product/suite/account heading for SideNav.
 *
 * Supports smart interaction boundary logic:
 * - No hrefs + menu → whole heading is the popover trigger
 * - headingHref only, no menu → whole heading is one link
 * - headingHref + superheadingHref, no menu → each is an independent link
 * - menu + hrefs → links are independent, chevron/remaining area is the trigger
 *
 * The chevron indicator is automatically shown when `menu` is provided.
 *
 * @example
 * ```
 * <SideNavHeading icon={<AppIcon />} heading="My App" headingHref="/" />
 * <SideNavHeading
 *   icon={<SuiteIcon />}
 *   superheading="Suite Name"
 *   superheadingHref="/suite"
 *   heading="Product Name"
 *   headingHref="/product"
 *   menu={<ProductSwitcher />}
 * />
 * <SideNavHeading
 *   icon={<AppIcon />}
 *   heading="Product Name"
 *   subheading="Business Account"
 *   menu={<AccountSwitcher />}
 * />
 * ```
 */
export function SideNavHeading({
  as,
  icon,
  heading,
  headingHref,
  superheading,
  superheadingHref,
  subheading,
  subheadingHref,
  headerEndContent,
  menu,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  ...props
}: SideNavHeadingProps) {
  const pressable = usePressFeedback();
  const t = useTranslator();
  const LinkComponent = useLinkComponent(as);
  const {isCollapsed} = useSideNavCollapse();
  const rootRef = useRef<HTMLDivElement>(null);
  const collapsedItemRef = useRef<HTMLElement>(null);

  const popover = usePopover({
    dialogLabel: t('@astryx.sideNav.heading.dialogLabel'),
    // The popup exposes its own role="menu" semantics; a role="dialog"
    // aria-modal wrapper would announce "dialog, Navigation menu" around a
    // menu (the anti-pattern removed in a478a3dcf).
    role: 'none',
    hasCloseButton: false,
  });

  const {
    triggerProps,
    contentProps,
    menuRef,
    setTriggerEl,
    close: closeMenu,
  } = useMenuHover<HTMLDivElement>({
    show: popover.show,
    hide: popover.hide,
    isOpen: popover.isOpen,
    isEnabled: !!menu,
    showDelay: 0,
    // Collapsed, the flyout opens beside the icon button, so a press on the
    // button lands outside the auto popover and the browser would light-dismiss
    // a hover-open before the click guard can confirm it. Expanded, the panel
    // overlaps the heading, and the trigger is a <div> whose click must not be
    // default-prevented: it holds the heading's own links.
    popoverId: isCollapsed ? popover.id : undefined,
  });

  // A press that slides across the menu's items acts on the item it lifts on,
  // the highlight following the pointer (`family:action-groups` FR1-FR3,
  // FR5); a mouse released outside closes it. Only the role="menu" region is
  // tracked, not the heading button above it.
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const headingMenuPress = useMenuPress({
    menuRef: headingMenuRef,
    itemSelector: HEADING_MENU_ITEM_SELECTOR,
    onDismiss: closeMenu,
    isEnabled: !!menu,
  });
  const headingMenuPointerDown = pressOnItemsOnly(
    headingMenuPress.menuProps.onPointerDown,
    HEADING_MENU_ITEM_SELECTOR,
  );
  const dismissCtx = useMemo(() => ({dismiss: closeMenu}), [closeMenu]);
  const headingMenuTouch = stylex.props(
    useMenuOverflow(headingMenuRef, menu, popover.isOpen)
      ? menuTouchActionStyles.scrolls
      : menuTouchActionStyles.fits,
  );

  const closeMenuCtx = useMemo(() => ({closeMenu}), [closeMenu]);

  // setTriggerEl belongs on the chevron button, not this root: it is the
  // focus-restore target and a <div> cannot take focus. triggerRef stays here
  // because the panel anchors to the whole heading.
  const setRef = useMergedRefs<HTMLDivElement>(
    rootRef,
    ref,
    menu ? popover.triggerRef : undefined,
  );
  const collapsedSetRef = useMergedRefs<HTMLElement>(
    collapsedItemRef,
    ref,
    // Collapsed, this button is the trigger, so it takes both roles.
    menu ? popover.triggerRef : undefined,
    menu ? setTriggerEl : undefined,
  );

  // In collapsed mode: hide if no icon, show icon-only if has icon
  if (isCollapsed && !icon) {
    return null;
  }
  if (isCollapsed && icon) {
    const collapsedIcon = <span {...stylex.props(styles.icon)}>{icon}</span>;

    let collapsedElement: ReactNode;

    if (headingHref) {
      collapsedElement = (
        <LinkComponent
          ref={collapsedSetRef as React.Ref<HTMLAnchorElement>}
          href={headingHref}
          aria-label={heading}
          {...pressable}
          data-testid={testId}
          {...mergeProps(
            themeProps('side-nav-heading'),
            focusOutlineProps.focusVisible(
              navItemStyles.item,
              interactionOverlayStyles.backgroundColor,
              styles.rootCollapsed,
              xstyle,
            ),
            className,
            style,
          )}>
          {collapsedIcon}
        </LinkComponent>
      );
    } else if (menu) {
      collapsedElement = (
        <>
          <button
            ref={collapsedSetRef}
            type="button"
            aria-label={heading}
            {...pressable}
            data-testid={testId}
            {...popover.triggerProps}
            {...triggerProps}
            {...mergeProps(
              themeProps('side-nav-heading'),
              focusOutlineProps.focusVisible(
                navItemStyles.item,
                interactionOverlayStyles.backgroundColor,
                styles.rootCollapsed,
                styles.menuTrigger,
                xstyle,
              ),
              className,
              style,
            )}>
            {collapsedIcon}
          </button>
          {popover.render(
            <div
              ref={menuRef}
              {...stylex.props(styles.popoverContent)}
              {...contentProps}>
              <button
                type="button"
                {...focusOutlineProps.focusVisible(styles.popoverHeading)}
                // A close affordance, not the trigger: dismiss only.
                onClick={closeMenu}>
                {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
                <span {...stylex.props(styles.textContainer)}>
                  {superheading && (
                    <span {...stylex.props(styles.superheading)}>
                      {superheading}
                    </span>
                  )}
                  <span {...stylex.props(styles.headingRow)}>
                    <span
                      {...stylex.props(
                        styles.heading,
                        !!(superheading || subheading) && styles.headingCompact,
                      )}>
                      {heading}
                    </span>
                    <Icon
                      icon="chevronDown"
                      size="sm"
                      color="secondary"
                      xstyle={styles.popoverChevron}
                    />
                  </span>
                  {subheading && (
                    <span {...stylex.props(styles.subheading)}>
                      {subheading}
                    </span>
                  )}
                </span>
              </button>
              {/* The menu role is scoped to the actual menu items so the
                  heading button above stays a valid sibling, not an invalid
                  child of a role="menu" element. */}
              <div
                ref={headingMenuRef}
                role="menu"
                aria-label={heading}
                {...headingMenuPress.menuProps}
                onPointerDown={headingMenuPointerDown}
                {...headingMenuTouch}>
                <NavHeadingCloseContext value={closeMenuCtx}>
                  {menu}
                </NavHeadingCloseContext>
              </div>
            </div>,
            {placement: 'below', alignment: 'start', xstyle: styles.popover},
          )}
        </>
      );
    } else {
      collapsedElement = (
        <div
          ref={collapsedSetRef}
          data-testid={testId}
          {...mergeProps(
            themeProps('side-nav-heading'),
            stylex.props(styles.root, styles.rootCollapsed, xstyle),
            className,
            style,
          )}
          {...props}>
          {collapsedIcon}
        </div>
      );
    }

    return (
      <>
        {collapsedElement}
        <Tooltip
          content={heading}
          placement="end"
          anchorRef={collapsedItemRef}
        />
      </>
    );
  }

  const showChevron = !!menu;
  const hasAnyHref = !!(headingHref || superheadingHref || subheadingHref);
  const hasCompactHeading = !!(superheading || subheading);

  // Determine interaction mode
  const isWholeHeadingTrigger = !!menu && !hasAnyHref;
  const isWholeHeadingLink =
    !!headingHref && !menu && !superheadingHref && !subheadingHref;

  // Render text content with optional inline chevron
  const renderTextContent = (inlineChevron?: ReactNode) => (
    <span {...stylex.props(styles.textContainer)}>
      {superheading &&
        (hasAnyHref && superheadingHref && menu ? (
          <Link href={superheadingHref} color="secondary" size="xsm">
            {superheading}
          </Link>
        ) : (
          <span {...stylex.props(styles.superheading)}>{superheading}</span>
        ))}
      <span {...stylex.props(styles.headingRow)}>
        {hasAnyHref && headingHref && menu ? (
          <LinkComponent
            href={headingHref}
            {...focusOutlineProps.focusVisible(
              styles.heading,
              styles.headingLink,
            )}>
            {heading}
          </LinkComponent>
        ) : (
          <span {...stylex.props(styles.heading)}>{heading}</span>
        )}
        {inlineChevron}
      </span>
      {subheading &&
        (hasAnyHref && subheadingHref && menu ? (
          <Link href={subheadingHref} color="secondary" size="xsm">
            {subheading}
          </Link>
        ) : (
          <span {...stylex.props(styles.subheading)}>{subheading}</span>
        ))}
    </span>
  );

  const chevronElement = showChevron && (
    <Icon
      icon="chevronDown"
      size="sm"
      color="secondary"
      xstyle={styles.chevron}
    />
  );

  const headerEndContentElement = headerEndContent && (
    <span {...stylex.props(styles.headerEndContent)}>{headerEndContent}</span>
  );

  // Shared popover heading content — uses renderTextContent for consistent
  // sizing, with flipped chevron inline after the title. Always static (no links).
  const popoverHeadingContent = (
    <button
      type="button"
      {...focusOutlineProps.focusVisible(styles.popoverHeading)}
      // A close affordance, not the trigger: dismiss only.
      onClick={closeMenu}>
      {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
      {renderTextContent(
        <Icon
          icon="chevronDown"
          size="sm"
          color="secondary"
          xstyle={styles.popoverChevron}
        />,
      )}
    </button>
  );

  // Whole heading is a link (no menu, single headingHref). End content may
  // be a control, which must not sit inside the link (no interactive content
  // in an <a>), so with end content the row is a div holding the link and the
  // end content side by side, as the mixed mode does.
  if (isWholeHeadingLink && headingHref && headerEndContentElement) {
    return (
      <div
        ref={ref}
        data-testid={testId}
        {...mergeProps(
          themeProps('side-nav-heading'),
          stylex.props(styles.root, xstyle),
          className,
          style,
        )}>
        <LinkComponent
          href={headingHref}
          {...focusOutlineProps.focusVisible(
            styles.linkBesideEndContent,
            styles.menuTrigger,
          )}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
          {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
          {renderTextContent()}
        </LinkComponent>
        {headerEndContentElement}
      </div>
    );
  }

  // Whole heading is a link (no menu, single headingHref)
  if (isWholeHeadingLink && headingHref) {
    return (
      <LinkComponent
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={headingHref}
        data-testid={testId}
        {...mergeProps(
          themeProps('side-nav-heading'),
          focusOutlineProps.focusVisible(
            styles.root,
            styles.menuTrigger,
            xstyle,
          ),
          className,
          style,
        )}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
        {renderTextContent()}
        {headerEndContentElement}
        {chevronElement}
      </LinkComponent>
    );
  }

  // Whole header is the popover trigger (menu, no hrefs)
  if (isWholeHeadingTrigger) {
    return (
      <>
        <div
          ref={setRef}
          data-testid={testId}
          {...triggerProps}
          {...mergeProps(
            themeProps('side-nav-heading'),
            stylex.props(styles.root, styles.menuTrigger, xstyle),
            className,
            style,
          )}>
          {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
          {renderTextContent(
            <button
              ref={setTriggerEl}
              type="button"
              aria-label={t('@astryx.sideNav.heading.openMenu')}
              onClick={e => {
                e.stopPropagation();
                triggerProps.onClick();
              }}
              {...popover.triggerProps}
              {...focusOutlineProps.focusVisible(
                styles.chevron,
                styles.interactive,
              )}>
              <Icon
                icon="chevronDown"
                size="sm"
                color="inherit"
                xstyle={styles.chevronGlyph}
              />
            </button>,
          )}
          {headerEndContentElement}
        </div>
        {popover.render(
          <div
            ref={menuRef}
            {...stylex.props(styles.popoverContent)}
            {...contentProps}>
            {popoverHeadingContent}
            {/* The menu role is scoped to the actual menu items so the
                heading button above stays a valid sibling, not an invalid
                child of a role="menu" element. */}
            <div
              ref={headingMenuRef}
              role="menu"
              aria-label={heading}
              {...headingMenuPress.menuProps}
              onPointerDown={headingMenuPointerDown}
              {...headingMenuTouch}>
              <NavHeadingDismissContext value={dismissCtx}>
                {menu}
              </NavHeadingDismissContext>
            </div>
          </div>,
          {
            placement: 'below',
            alignment: 'start',
            xstyle: styles.popoverOverlap,
          },
        )}
      </>
    );
  }

  // Mixed mode: independent links + chevron trigger for menu
  // Popover anchors to the full heading div, not the chevron, so it
  // appears in the same position as the no-links case.
  if (menu && hasAnyHref) {
    return (
      <>
        <div
          ref={setRef}
          data-testid={testId}
          {...triggerProps}
          {...mergeProps(
            themeProps('side-nav-heading'),
            stylex.props(styles.root, xstyle),
            className,
            style,
          )}>
          {icon &&
            (headingHref ? (
              <LinkComponent
                href={headingHref}
                aria-label={heading}
                {...focusOutlineProps.focusVisible(styles.icon)}>
                {icon}
              </LinkComponent>
            ) : (
              <span {...stylex.props(styles.icon)}>{icon}</span>
            ))}
          {renderTextContent(
            showChevron ? (
              <button
                ref={setTriggerEl}
                type="button"
                aria-label={t('@astryx.sideNav.heading.openMenu')}
                onClick={e => {
                  e.stopPropagation();
                  triggerProps.onClick();
                }}
                {...popover.triggerProps}
                {...focusOutlineProps.focusVisible(
                  styles.chevron,
                  styles.interactive,
                )}>
                <Icon
                  icon="chevronDown"
                  size="sm"
                  color="inherit"
                  xstyle={styles.chevronGlyph}
                />
              </button>
            ) : undefined,
          )}
          {headerEndContentElement}
        </div>
        {popover.render(
          <div
            ref={menuRef}
            {...stylex.props(styles.popoverContent)}
            {...contentProps}>
            {popoverHeadingContent}
            {/* The menu role is scoped to the actual menu items so the
                heading button above stays a valid sibling, not an invalid
                child of a role="menu" element. */}
            <div
              ref={headingMenuRef}
              role="menu"
              aria-label={heading}
              {...headingMenuPress.menuProps}
              onPointerDown={headingMenuPointerDown}
              {...headingMenuTouch}>
              <NavHeadingDismissContext value={dismissCtx}>
                {menu}
              </NavHeadingDismissContext>
            </div>
          </div>,
          {
            placement: 'below',
            alignment: 'start',
            xstyle: styles.popoverOverlap,
          },
        )}
      </>
    );
  }

  // Static heading with independent links (no menu)
  if (hasAnyHref && !isWholeHeadingLink) {
    return (
      <div
        ref={ref}
        data-testid={testId}
        {...mergeProps(
          themeProps('side-nav-heading'),
          stylex.props(styles.root, xstyle),
          className,
          style,
        )}
        {...props}>
        {icon &&
          (headingHref ? (
            <LinkComponent
              href={headingHref}
              aria-label={heading}
              {...focusOutlineProps.focusVisible(styles.icon)}>
              {icon}
            </LinkComponent>
          ) : (
            <span {...stylex.props(styles.icon)}>{icon}</span>
          ))}
        <span {...stylex.props(styles.textContainer)}>
          {superheading &&
            (superheadingHref ? (
              <Link href={superheadingHref} color="secondary" size="xsm">
                {superheading}
              </Link>
            ) : (
              <span {...stylex.props(styles.superheading)}>{superheading}</span>
            ))}
          {headingHref ? (
            <Link href={headingHref} color="primary" weight="semibold">
              {heading}
            </Link>
          ) : (
            <span
              {...stylex.props(
                styles.heading,
                hasCompactHeading && styles.headingCompact,
              )}>
              {heading}
            </span>
          )}
          {subheading &&
            (subheadingHref ? (
              <Link href={subheadingHref} color="secondary" size="xsm">
                {subheading}
              </Link>
            ) : (
              <span {...stylex.props(styles.subheading)}>{subheading}</span>
            ))}
        </span>
        {headerEndContentElement}
        {chevronElement}
      </div>
    );
  }

  // Default: static heading, no links, no menu
  return (
    <div
      ref={ref}
      data-testid={testId}
      {...mergeProps(
        themeProps('side-nav-heading'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...props}>
      {icon && <span {...stylex.props(styles.icon)}>{icon}</span>}
      {renderTextContent()}
      {headerEndContentElement}
      {chevronElement}
    </div>
  );
}

SideNavHeading.displayName = 'SideNavHeading';
