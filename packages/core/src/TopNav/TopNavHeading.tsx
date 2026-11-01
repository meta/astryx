// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavHeading.tsx
 * @input Uses React, useRef, useCallback, ReactNode, StyleX, usePopover
 * @output Exports TopNavHeading component and TopNavHeadingProps
 * @position Companion component for TopNav heading slot
 *
 * Product/suite/account heading with smart interaction boundary logic.
 * Mirrors SideNavHeading features: superheading, subheading, menu popover,
 * chevron indicator, and independent link boundaries.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TopNav/TopNav.doc.mjs
 * - /packages/core/src/TopNav/TopNav.test.tsx
 * - /packages/core/src/TopNav/index.ts
 * - /apps/storybook/stories/TopNav.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/TopNav/ (showcase blocks)
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
import {usePopover} from '../Popover/usePopover';
import {Link} from '../Link';
import {Icon} from '../Icon';
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
import {NavHeadingCloseContext} from '../NavMenu/NavMenuContext';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minHeight: spacingVars['--spacing-8'],
    minWidth: 0,
    paddingInlineStart: {
      default: spacingVars['--spacing-2'],
      ':has(.astryx-nav-icon)': 0,
    },
    paddingInlineEnd: spacingVars['--spacing-2'],
    paddingBlock: 0,
    boxSizing: 'border-box',
    textDecoration: 'none',
    color: colorVars['--color-text-primary'],
    cursor: 'default',
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
  logo: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
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
  },
  // The registry chevron is a 1em SVG, so it has always rendered at the
  // heading's inherited font size. Icon's size box would repin it to a fixed
  // rem (the nearest, sm, is 1rem = 16px vs the 14px base here), so hold the
  // glyph on the inherited em — the 28px chevron box above is unchanged, and
  // the glyph keeps tracking the surrounding text.
  chevronGlyph: {
    width: '1em',
    height: '1em',
    fontSize: 'inherit',
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
  // Composes over `chevron` — the flipped popover copy differs only by the
  // rotation, so it carries just that.
  popoverChevron: {
    transform: 'rotate(180deg)',
  },
  popover: {
    minWidth: 'anchor-size(width)',
    marginBlockStart: spacingVars['--spacing-1'],
  },
  popoverOverlap: {
    minWidth: 'calc(anchor-size(width) + 16px)',
    marginBlockStart: 'calc(-1 * anchor-size(height) - 8px)',
    marginInlineStart: '-8px',
  },
});

// =============================================================================
// Types
// =============================================================================

export interface TopNavHeadingProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Logo element to display before the heading.
   * Can be an image, NavIcon, or any ReactNode.
   */
  logo?: ReactNode;
  /**
   * Accessible name for the logo when it links somewhere (`headingHref`) and
   * has no adjacent text to name it (for example a logo-only heading). Defaults
   * to `heading` when available. Ignored when the logo is not a link.
   */
  logoLabel?: string;
  /**
   * Product/app name.
   */
  heading?: string;
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
  /**
   * Custom component to render instead of `<a>`.
   * Overrides the provider-level default set by LinkProvider.
   * Must accept href, className, style, and children props.
   */
  as?: LinkComponentType;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Product/suite/account heading for TopNav.
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
 * <TopNavHeading logo={<NavIcon icon={<HomeIcon />} />} heading="My App" headingHref="/" />
 * <TopNavHeading
 *   logo={<NavIcon icon={<SuiteIcon />} />}
 *   superheading="Suite Name"
 *   superheadingHref="/suite"
 *   heading="Product Name"
 *   headingHref="/product"
 *   menu={<ProductSwitcher />}
 * />
 * ```
 */
export function TopNavHeading({
  as,
  logo,
  logoLabel,
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
}: TopNavHeadingProps) {
  const t = useTranslator();
  const LinkComponent = useLinkComponent(as);
  // When the logo is wrapped in a link it needs its own accessible name (the
  // logo image itself is decorative). Prefer an explicit logoLabel, fall back
  // to the heading text. axe: link-name.
  const logoLinkLabel = logoLabel ?? heading;

  const rootRef = useRef<HTMLElement>(null);

  const popover = usePopover({
    dialogLabel: t('@astryx.topNav.heading.dialogLabel'),
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
  });

  // A press that slides across the product menu's items acts on the item it
  // lifts on, the highlight following the pointer (`family:action-groups`
  // FR1-FR3, FR5); a mouse released outside closes it. Only the role="menu"
  // region is tracked, not the heading above it.
  const productMenuRef = useRef<HTMLDivElement>(null);
  const productMenuPress = useMenuPress({
    menuRef: productMenuRef,
    itemSelector: '[role="menuitem"]:not([aria-disabled="true"])',
    onDismiss: closeMenu,
    isEnabled: !!menu,
  });
  const productMenuPointerDown = pressOnItemsOnly(
    productMenuPress.menuProps.onPointerDown,
    '[role="menuitem"]:not([aria-disabled="true"])',
  );
  const productMenuTouch = stylex.props(
    useMenuOverflow(productMenuRef, menu, popover.isOpen)
      ? menuTouchActionStyles.scrolls
      : menuTouchActionStyles.fits,
  );

  const closeMenuCtx = useMemo(() => ({closeMenu}), [closeMenu]);

  // setTriggerEl belongs on the chevron button, not this root: it is the
  // focus-restore target and a <div> cannot take focus. triggerRef stays here
  // because the panel anchors to the whole heading.
  const setRef = useMergedRefs<HTMLElement>(
    rootRef,
    ref,
    menu ? popover.triggerRef : undefined,
  );

  const showChevron = !!menu;
  const hasAnyHref = !!(headingHref || superheadingHref || subheadingHref);

  // Determine interaction mode
  const isWholeHeadingTrigger = !!menu && !hasAnyHref;
  const isWholeHeadingLink =
    !!headingHref && !menu && !superheadingHref && !subheadingHref;

  // Render text content with optional inline chevron
  const renderTextContent = (inlineChevron?: ReactNode) => (
    <span {...stylex.props(styles.textContainer)}>
      {superheading &&
        (hasAnyHref && superheadingHref && menu ? (
          <Link
            href={superheadingHref}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            color="secondary"
            size="xsm">
            {superheading}
          </Link>
        ) : (
          <span {...stylex.props(styles.superheading)}>{superheading}</span>
        ))}
      <span {...stylex.props(styles.headingRow)}>
        {hasAnyHref && headingHref && menu ? (
          <LinkComponent
            href={headingHref}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            {...stylex.props(styles.heading, styles.headingLink)}>
            {heading}
          </LinkComponent>
        ) : (
          <span {...stylex.props(styles.heading)}>{heading}</span>
        )}
        {inlineChevron}
      </span>
      {subheading &&
        (hasAnyHref && subheadingHref && menu ? (
          <Link
            href={subheadingHref}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            color="secondary"
            size="xsm">
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
      xstyle={[styles.chevron, styles.chevronGlyph]}
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
      {...stylex.props(styles.popoverHeading)}
      // A close affordance, not the trigger: dismiss only.
      onClick={closeMenu}>
      {logo && <span {...stylex.props(styles.logo)}>{logo}</span>}
      {renderTextContent(
        <Icon
          icon="chevronDown"
          size="sm"
          color="secondary"
          xstyle={[styles.chevron, styles.chevronGlyph, styles.popoverChevron]}
        />,
      )}
    </button>
  );

  // Simple: no heading text, just logo (backward compat for logo-only usage)
  if (!heading && !menu) {
    const Element = headingHref ? LinkComponent : 'div';
    return (
      <Element
        ref={ref as React.Ref<HTMLAnchorElement & HTMLDivElement>}
        href={headingHref}
        aria-label={headingHref ? logoLabel : undefined}
        data-testid={testId}
        {...mergeProps(
          themeProps('top-nav-heading'),
          stylex.props(
            styles.root,
            !!headingHref && styles.menuTrigger,
            xstyle,
          ),
          className,
          style,
        )}
        {...props}>
        {logo && <span {...stylex.props(styles.logo)}>{logo}</span>}
      </Element>
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
          themeProps('top-nav-heading'),
          stylex.props(styles.root, styles.menuTrigger, xstyle),
          className,
          style,
        )}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {logo && <span {...stylex.props(styles.logo)}>{logo}</span>}
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
            themeProps('top-nav-heading'),
            stylex.props(styles.root, styles.menuTrigger, xstyle),
            className,
            style,
          )}>
          {logo && <span {...stylex.props(styles.logo)}>{logo}</span>}
          {renderTextContent(
            // Stays a <button>: this box is the popover trigger, so it carries
            // the accessible name and handlers — only the glyph moves to Icon.
            <button
              ref={setTriggerEl}
              type="button"
              aria-label={t('@astryx.topNav.heading.openMenu')}
              onClick={e => {
                e.stopPropagation();
                triggerProps.onClick();
              }}
              {...popover.triggerProps}
              {...stylex.props(styles.chevron, styles.interactive)}>
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
              ref={productMenuRef}
              role="menu"
              aria-label={heading ?? t('@astryx.topNav.heading.dialogLabel')}
              {...productMenuPress.menuProps}
              onPointerDown={productMenuPointerDown}
              {...productMenuTouch}>
              <NavHeadingCloseContext value={closeMenuCtx}>
                {menu}
              </NavHeadingCloseContext>
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
  if (menu && hasAnyHref) {
    return (
      <>
        <div
          ref={setRef}
          data-testid={testId}
          {...triggerProps}
          {...mergeProps(
            themeProps('top-nav-heading'),
            stylex.props(styles.root, xstyle),
            className,
            style,
          )}>
          {logo &&
            (headingHref ? (
              <LinkComponent
                href={headingHref}
                aria-label={logoLinkLabel}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                {...stylex.props(styles.logo)}>
                {logo}
              </LinkComponent>
            ) : (
              <span {...stylex.props(styles.logo)}>{logo}</span>
            ))}
          {renderTextContent(
            showChevron ? (
              // Stays a <button>: this box is the popover trigger, so it
              // carries the accessible name and handlers — only the glyph
              // moves to Icon.
              <button
                ref={setTriggerEl}
                type="button"
                aria-label={t('@astryx.topNav.heading.openMenu')}
                onClick={e => {
                  e.stopPropagation();
                  triggerProps.onClick();
                }}
                {...popover.triggerProps}
                {...stylex.props(styles.chevron, styles.interactive)}>
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
              ref={productMenuRef}
              role="menu"
              aria-label={heading ?? t('@astryx.topNav.heading.dialogLabel')}
              {...productMenuPress.menuProps}
              onPointerDown={productMenuPointerDown}
              {...productMenuTouch}>
              <NavHeadingCloseContext value={closeMenuCtx}>
                {menu}
              </NavHeadingCloseContext>
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
        ref={ref as React.Ref<HTMLDivElement>}
        data-testid={testId}
        {...mergeProps(
          themeProps('top-nav-heading'),
          stylex.props(styles.root, xstyle),
          className,
          style,
        )}
        {...props}>
        {logo &&
          (headingHref ? (
            <LinkComponent
              href={headingHref}
              aria-label={logoLinkLabel}
              {...stylex.props(styles.logo)}>
              {logo}
            </LinkComponent>
          ) : (
            <span {...stylex.props(styles.logo)}>{logo}</span>
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
            <span {...stylex.props(styles.heading)}>{heading}</span>
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
      ref={ref as React.Ref<HTMLDivElement>}
      data-testid={testId}
      {...mergeProps(
        themeProps('top-nav-heading'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...props}>
      {logo && <span {...stylex.props(styles.logo)}>{logo}</span>}
      {renderTextContent()}
      {headerEndContentElement}
      {chevronElement}
    </div>
  );
}

TopNavHeading.displayName = 'TopNavHeading';
