// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteEmpty.tsx
 * @input Uses React, StyleX
 * @output Exports CommandPaletteEmpty component
 * @position Sub-component; empty state shown when there are no items to display
 *
 * SYNC: When modified, update:
 * - /packages/cli/assets/templates/blocks/components/CommandPalette/ (showcase blocks)
 */

'use client';

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: spacingVars['--spacing-8'],
    paddingInline: spacingVars['--spacing-4'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    textAlign: 'center' as const,
    // Lets an unbroken token (a path or URL echoed into the message) wrap
    // instead of setting the centered line's minimum width, which pushes text
    // past both inline edges where neither side can scroll to it.
    overflowWrap: 'anywhere',
  },
});

export interface CommandPaletteEmptyProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /** The message or content to display. */
  children: ReactNode;
}

/**
 * Empty state for the command palette list area.
 *
 * Rendered automatically by CommandPalette in two situations:
 * - `emptyBootstrapText`: no search term and bootstrap() returns nothing
 * - `emptySearchText`: a search query returned no results
 *
 * Can also be composed as a standalone empty result surface. Render actionable
 * empty content outside listbox and option semantics.
 *
 * @example
 * ```
 * <CommandPalette
 *   emptyBootstrapText="Start typing to search"
 *   emptySearchText="No results found"
 *   searchSource={source}
 * />
 * ```
 */
export function CommandPaletteEmpty({
  ref,
  children,
  xstyle,
  className,
  style,
  ...props
}: CommandPaletteEmptyProps) {
  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('command-palette-empty'),
        stylex.props(styles.empty, xstyle),
        className,
        style,
      )}
      {...props}>
      {children}
    </div>
  );
}

CommandPaletteEmpty.displayName = 'CommandPaletteEmpty';
