// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavSection.tsx
 * @input Uses React, StyleX
 * @output Exports SideNavSection component and SideNavSectionProps
 * @position Core implementation; used inside SideNav children
 *
 * Section grouping for navigation items with optional title and end content.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/SideNav/SideNav.doc.mjs
 * - /packages/core/src/SideNav/SideNav.test.tsx
 * - /packages/core/src/SideNav/index.ts
 * - /apps/storybook/stories/SideNav.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/SideNav/ (showcase blocks)
 */

import React, {useId, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useSideNavCollapse} from './SideNavCollapseContext';
import {VisuallyHidden} from '../VisuallyHidden';
import {themeProps} from '../utils/themeProps';
import {isRenderable} from '../utils/isRenderable';
// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: spacingVars['--spacing-1'],
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
    cursor: 'default',
    userSelect: 'none',
  },

  titleContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  endContent: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },

  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
});

// =============================================================================
// Types
// =============================================================================

export interface SideNavSectionProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Section title.
   */
  title: string;
  /**
   * Section subtitle.
   */
  subtitle?: string;
  /**
   * Section items.
   */
  children: ReactNode;
  /**
   * Right-side content in the section header.
   */
  endContent?: ReactNode;
  /**
   * Whether the section header is visually hidden.
   * The section title is still accessible to screen readers.
   * @default false
   */
  isHeaderHidden?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Section grouping for SideNav items.
 *
 * Renders a labeled group of navigation items.
 * Uses `role="group"` with `aria-labelledby` for accessibility.
 *
 * @example
 * ```
 * <SideNavSection title="Main">
 *   <SideNavItem label="Dashboard" icon={HomeIcon} isSelected />
 *   <SideNavItem label="Projects" icon={FolderIcon} />
 * </SideNavSection>
 * ```
 */
export function SideNavSection({
  ref,
  title,
  subtitle,
  children,
  endContent,
  isHeaderHidden = false,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...rest
}: SideNavSectionProps) {
  const {isCollapsed} = useSideNavCollapse();
  const id = useId();
  const titleId = `${id}-title`;

  const headerContent = (
    <>
      <span {...stylex.props(styles.titleContainer)}>
        <span id={titleId} {...stylex.props(styles.title)}>
          {title}
        </span>
        {subtitle && <span {...stylex.props(styles.subtitle)}>{subtitle}</span>}
      </span>
      {isRenderable(endContent) && (
        <span {...stylex.props(styles.endContent)}>{endContent}</span>
      )}
    </>
  );

  const shouldHideHeader = isHeaderHidden || isCollapsed;

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('side-nav-section'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...rest}
      role="group"
      aria-labelledby={titleId}
      data-testid={testId}>
      {shouldHideHeader ? (
        <VisuallyHidden as="div">{headerContent}</VisuallyHidden>
      ) : (
        <div {...stylex.props(styles.header)}>{headerContent}</div>
      )}
      <div {...stylex.props(styles.items)}>{children}</div>
    </div>
  );
}

SideNavSection.displayName = 'SideNavSection';
