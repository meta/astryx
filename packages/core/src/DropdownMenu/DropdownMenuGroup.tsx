// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuGroup.tsx
 * @input Uses spacing/typography/color tokens, themeProps (heading target);
 *   forwards host props to the group element
 * @output Exports DropdownMenuGroup component and DropdownMenuGroupProps
 * @position Sub-component; used inside DropdownMenu
 *
 * The compound-mode peer of the data API's `{type: 'section', title, items}`
 * option: the same heading typography and `dropdown-menu-section-heading`
 * theme target, with the group named by its visible heading.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DropdownMenu/DropdownMenu.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenuGroup.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenu.test.tsx
 * - /packages/core/src/DropdownMenu/index.ts
 * - /packages/core/src/ContextMenu/index.ts
 * - /packages/core/src/Breadcrumbs/index.ts
 * - /apps/storybook/stories/DropdownMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DropdownMenu/ (showcase blocks)
 */

import {useId, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  heading: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
  },
});

export interface DropdownMenuGroupProps extends Omit<
  BaseProps<HTMLDivElement>,
  'role'
> {
  /**
   * Heading shown above the group's rows and used as the group's accessible
   * name (`aria-labelledby`). Omit it for an unnamed group. Keep this content
   * non-interactive; controls belong in DropdownMenu's `header` or `footer`.
   */
  title?: ReactNode;
  /** The rows of the group: menu items, selectable items, sub-menus. */
  children?: ReactNode;
  /** Ref forwarded to the `role="group"` element. */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * A titled group of menu rows.
 *
 * Renders `role="group"` named by its heading. The heading is not a
 * `menuitem`, so arrow-key navigation and typeahead skip it. Keep heading
 * content non-interactive; place controls in DropdownMenu's `header` or
 * `footer`. The compound peer of
 * `{type: 'section', title, items}` in the `items` data API. Host attributes
 * (`id`, `data-*`, `aria-*`) and DOM handlers reach the group element; its
 * role, and its name while it has a title, stay component-owned.
 *
 * @example
 * ```
 * <DropdownMenu button={{ label: 'Actions' }}>
 *   <DropdownMenuGroup title="Version history">
 *     <DropdownMenuItem label="Restore" onClick={handleRestore} />
 *     <DropdownMenuItem label="Compare" onClick={handleCompare} />
 *   </DropdownMenuGroup>
 *   <DropdownMenuDivider />
 *   <DropdownMenuItem label="Delete" variant="destructive" onClick={handleDelete} />
 * </DropdownMenu>
 * ```
 */
export function DropdownMenuGroup({
  title,
  children,
  xstyle,
  className,
  style,
  ref,
  'aria-labelledby': ariaLabelledBy,
  ...rest
}: DropdownMenuGroupProps) {
  const headingId = useId();
  const hasTitle = title != null && title !== '' && title !== false;

  return (
    <div
      {...rest}
      ref={ref}
      role="group"
      aria-labelledby={hasTitle ? headingId : ariaLabelledBy}
      {...mergeProps(stylex.props(xstyle), className, style)}>
      {hasTitle && (
        <div
          id={headingId}
          {...mergeProps(
            themeProps('dropdown-menu-section-heading'),
            stylex.props(styles.heading),
          )}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

DropdownMenuGroup.displayName = 'DropdownMenuGroup';
