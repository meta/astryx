// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Breadcrumbs.tsx
 * @input Uses React, layer-scoped context, stylex, theme tokens
 * @output Exports Breadcrumbs component, BreadcrumbsProps, BreadcrumbContext
 * @position Core container component; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Breadcrumbs/Breadcrumbs.doc.mjs
 * - /packages/core/src/Breadcrumbs/Breadcrumbs.test.tsx
 * - /packages/core/src/Breadcrumbs/index.ts
 * - /apps/storybook/stories/Breadcrumbs.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Breadcrumbs/ (showcase blocks)
 */

import {useMemo, type ReactNode} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import type {BreadcrumbsVariantMap} from './index';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Breadcrumbs/Breadcrumbs.generated';

registerEnglishFallback(english);

// =============================================================================
// Variant type
// =============================================================================

/**
 * Visual variant for the breadcrumb trail.
 * - `'default'`: Standard text styling
 * - `'supporting'`: Smaller, secondary text for supporting context
 *
 * Extensible via module augmentation of BreadcrumbsVariantMap.
 */
export type BreadcrumbsVariant = keyof BreadcrumbsVariantMap;

// =============================================================================
// Context shared with BreadcrumbItem
// =============================================================================

/** @internal Context for passing variant and separator from Breadcrumbs to BreadcrumbItem. */
export interface BreadcrumbContextValue {
  variant: BreadcrumbsVariant;
  separator: ReactNode;
}

export const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  variant: 'default',
  separator: '/',
});
BreadcrumbContext.displayName = 'BreadcrumbContext';

// =============================================================================
// Props
// =============================================================================

export interface BreadcrumbsProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * BreadcrumbItem elements to render as breadcrumb trail.
   */
  children: ReactNode;
  /**
   * Separator rendered between items. Decorative only (aria-hidden).
   * @default '/'
   */
  separator?: ReactNode;
  /**
   * Visual variant for the breadcrumb trail.
   * - `'default'`: Standard text styling
   * - `'supporting'`: Smaller, secondary text for supporting context
   * @default 'default'
   */
  variant?: BreadcrumbsVariant;
  /**
   * Accessible label for the nav landmark.
   * @default 'Breadcrumb'
   */
  label?: string;
}

// =============================================================================
// Styles
// =============================================================================

const navStyles = stylex.create({
  root: {
    display: 'block',
  },
});

const listStyles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gap: spacingVars['--spacing-1'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A navigation breadcrumb trail. Wraps BreadcrumbItem children in
 * semantic `<nav>` + `<ol>` markup with separators between items.
 *
 * Auto-detects the last child as the current page if no item has
 * `isCurrent` explicitly set — handled by each item via DOM inspection,
 * no React child introspection needed.
 *
 * @example
 * ```
 * <Breadcrumbs>
 *   <BreadcrumbItem href="/">Home</BreadcrumbItem>
 *   <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
 *   <BreadcrumbItem isCurrent>My Project</BreadcrumbItem>
 * </Breadcrumbs>
 * ```
 */
export function Breadcrumbs({
  children,
  separator = '/',
  variant = 'default',
  xstyle,
  className,
  style,
  label: labelFromProps,
  ref,
  ...rest
}: BreadcrumbsProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.breadcrumbs.label');
  const ctxValue = useMemo<BreadcrumbContextValue>(
    () => ({variant, separator}),
    [variant, separator],
  );

  return (
    <BreadcrumbContext value={ctxValue}>
      <nav
        ref={ref}
        aria-label={label}
        {...mergeProps(
          themeProps('breadcrumbs', {variant}),
          stylex.props(navStyles.root, xstyle),
          className,
          style,
        )}
        {...rest}>
        <ol {...stylex.props(listStyles.root)}>{children}</ol>
      </nav>
    </BreadcrumbContext>
  );
}

Breadcrumbs.displayName = 'Breadcrumbs';
