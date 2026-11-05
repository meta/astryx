// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuDivider.tsx
 * @input Uses Divider, spacing tokens, themeProps; forwards host props to Divider
 * @output Exports DropdownMenuDivider component and DropdownMenuDividerProps
 * @position Sub-component; used inside DropdownMenu
 *
 * The compound-mode peer of the data API's `{type: 'divider'}` option. The
 * data path renders this same component, so neither mode can drift from the
 * other in DOM, spacing, or theme target.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DropdownMenu/DropdownMenu.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenuDivider.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenu.test.tsx
 * - /packages/core/src/DropdownMenu/index.ts
 * - /packages/core/src/ContextMenu/index.ts
 * - /packages/core/src/Breadcrumbs/index.ts
 * - /apps/storybook/stories/DropdownMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DropdownMenu/ (showcase blocks)
 */

import * as stylex from '@stylexjs/stylex';
import {Divider} from '../Divider';
import {spacingVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  divider: {
    marginBlock: spacingVars['--spacing-1'],
  },
});

const THEME_CLASS_NAME = themeProps('dropdown-menu-divider').className;

export interface DropdownMenuDividerProps extends Omit<
  BaseProps<HTMLDivElement>,
  'role' | 'aria-orientation'
> {
  /** Ref forwarded to the separator element. */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * A horizontal rule separating groups of menu rows.
 *
 * Renders `role="separator"`, so it is never a stop in the menu's arrow-key
 * order. Equivalent to `{type: 'divider'}` in the `items` data API. Host
 * attributes (`id`, `data-*`, `aria-*`) and DOM handlers reach the separator;
 * its role and orientation stay component-owned.
 *
 * @example
 * ```
 * <DropdownMenu button={{ label: 'Actions' }}>
 *   <DropdownMenuItem label="Edit" onClick={handleEdit} />
 *   <DropdownMenuDivider />
 *   <DropdownMenuItem label="Delete" variant="destructive" onClick={handleDelete} />
 * </DropdownMenu>
 * ```
 */
export function DropdownMenuDivider({
  xstyle,
  className,
  style,
  ref,
  ...rest
}: DropdownMenuDividerProps) {
  return (
    <Divider
      {...rest}
      ref={ref}
      xstyle={[styles.divider, xstyle]}
      className={
        className ? `${THEME_CLASS_NAME} ${className}` : THEME_CLASS_NAME
      }
      style={style}
    />
  );
}

DropdownMenuDivider.displayName = 'DropdownMenuDivider';
