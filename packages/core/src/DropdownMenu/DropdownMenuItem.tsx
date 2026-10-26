// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuItem.tsx
 * @output Exports DropdownMenuItem component
 * @position Sub-component; used inside DropdownMenu
 *
 * Interactive menu item with role="menuitem". Keyboard navigation
 * is handled by useListFocus on the parent menu container.
 *
 * Composes Item for the shared start content + label + description + end content layout.
 * Passes role="menuitem" so Item puts onClick on the root div instead of
 * creating an invisible button (keyboard access is provided by the parent menu).
 * With an `href` the root is a real anchor carrying the role.
 *
 * Host attributes and DOM handlers the caller passes (aria-*, data-*, id, drag
 * and drop, …) reach that row root; the row's own role, tab stop and hover
 * focus are set after them, so a caller cannot overwrite them.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DropdownMenu/DropdownMenu.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenuItem.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenu.test.tsx
 * - /packages/core/src/DropdownMenu/index.ts
 * - /apps/storybook/stories/DropdownMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DropdownMenu/ (showcase blocks)
 */

import {
  useCallback,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {renderIconSlot, type IconType} from '../Icon';
import {Item} from '../Item';
import {useLinkComponent} from '../Link/useLinkComponent';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {composeEventHandlers, mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useDropdownMenuContext} from './DropdownMenuContext';
import {focusMenuItemOnHover} from './menuItemHover';
import {isModifiedClick} from './menuItemRoles';
import {themeProps} from '../utils/themeProps';
import {usePressFeedback} from '../hooks/usePressFeedback';

const menuItemStyles = stylex.create({
  root: {
    boxSizing: 'border-box',
    width: '100%',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: `max(0px, calc(var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':focus': colorVars['--color-overlay-hover'],
      // The pressed look only where hover exists. Under a finger the row a
      // press BEGAN on would otherwise stay painted while the highlight (focus)
      // moves to the row under the finger — two rows lit.
      '@media (hover: hover)': {
        default: null,
        ':active:where(:not(:disabled,[aria-disabled="true"]))':
          colorVars['--color-overlay-pressed'],
      },
    },
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    outline: 'none',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  destructive: {
    // Only recolor the text/icon; the hover / focus background stays the shared
    // neutral overlay from `root` so the hover state matches every other menu
    // item. The semantic status foreground covers the label, description, icon,
    // and any bare text on a plain surface.
    color: colorVars['--color-text-error'],
    '--_item-label-color': colorVars['--color-text-error'],
    '--_item-description-color': colorVars['--color-text-error'],
  },
});

const itemSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {},
});

export interface DropdownMenuItemProps extends Omit<
  BaseProps,
  'role' | 'tabIndex'
> {
  /** Icon to display before the label. */
  icon?: ReactNode | IconType;
  /** Primary label text. */
  label: ReactNode;
  /** Secondary description text displayed below the label. */
  description?: ReactNode;
  /**
   * Callback when the item is selected. Receives the activating click; a
   * keyboard activation (Enter / Space) arrives as a synthesized click that
   * carries the key's modifiers. On a row with an `href` it runs before the
   * browser navigates, and is skipped for a modified click (⌘, Ctrl, Shift,
   * Alt, a middle button), which is left to the browser.
   */
  onClick?: (event: MouseEvent) => void;
  /**
   * Address the row navigates to. The row then renders as a real anchor with
   * `role="menuitem"` — a modified click and a middle click keep the
   * browser's meaning (a new tab), and `LinkProvider` routes it.
   */
  href?: string;
  /** Link target. Only used with `href`. */
  target?: '_blank' | '_self';
  /**
   * Link relationship. `noopener noreferrer` is added for `target="_blank"`.
   * Only used with `href`.
   */
  rel?: string;
  /** Whether the item is disabled. @default false */
  isDisabled?: boolean;
  /** Additional content to render after the label/description. */
  endContent?: ReactNode;
  /**
   * Whether activating the item closes the menu. Set `false` for an action
   * that reports its result on the item itself (a copy row swapping to
   * "Copied"), matching the checkbox and radio items, which already decide
   * this for themselves.
   * @default true
   */
  hasCloseOnSelect?: boolean;
  /**
   * Visual variant. `'destructive'` renders the label, description, and icon in
   * the error color for dangerous actions (e.g. Delete). @default 'default'
   */
  variant?: 'default' | 'destructive';
  /**
   * Ref forwarded to the row root — the element carrying `role="menuitem"`.
   * Lets a caller register the row with an element-keyed observer (an
   * IntersectionObserver for an impression, a measurement, a debug overlay)
   * the way `Item` and `DropdownMenuDivider` already allow.
   */
  ref?: React.Ref<HTMLElement>;
}

/**
 * An interactive dropdown menu item with icon, label, and optional description.
 *
 * Must be used inside DropdownMenu. Keyboard navigation is provided
 * automatically by the parent via useListFocus.
 *
 * @example
 * ```
 * <DropdownMenu button={{ label: 'Actions' }}>
 *   <DropdownMenuItem icon={PencilIcon} label="Edit" onClick={handleEdit} />
 *   <DropdownMenuItem label="Delete" variant="destructive" onClick={handleDelete} />
 * </DropdownMenu>
 * ```
 */
export function DropdownMenuItem({
  icon,
  label,
  description,
  onClick,
  href,
  target,
  rel,
  isDisabled = false,
  endContent,
  hasCloseOnSelect = true,
  variant = 'default',
  xstyle,
  className,
  style,
  ref,
  onPointerMove,
  onAuxClick,
  ...rest
}: DropdownMenuItemProps) {
  const ctx = useDropdownMenuContext();
  const menuSize = ctx?.menuSize ?? 'md';
  // Item marks itself as a pressable surface too; naming the row here as well
  // keeps this file's own press arms (above) verifiably reachable by the
  // touch press controller (pressableCoverage.test.ts).
  const pressable = usePressFeedback();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (isDisabled) {
        // A disabled link row has no href, but a stray click must still not
        // navigate anywhere.
        event.preventDefault();
        return;
      }
      // A modified click on a link row is the browser's: it opens the
      // address its own way, so the row's handler stays out of it.
      // The menu still closes: the row acted.
      const isBrowserNavigation = href != null && isModifiedClick(event);
      if (!isBrowserNavigation) {
        onClick?.(event);
      }
      if (hasCloseOnSelect) {
        ctx?.closeMenu();
      }
    },
    [isDisabled, href, onClick, hasCloseOnSelect, ctx],
  );

  // A middle click fires `auxclick`, never `click`, so the row's own click
  // handler never sees it: the tab opened and the menu stayed open behind
  // it. The browser does the navigating; the row only has to close.
  const handleAuxClick = useCallback(
    (event: MouseEvent) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      // Button 1 is the middle button. A right click opens the context menu
      // and must leave the row's menu alone.
      if (href == null || event.button !== 1) {
        return;
      }
      if (hasCloseOnSelect) {
        ctx?.closeMenu();
      }
    },
    [isDisabled, href, hasCloseOnSelect, ctx],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => focusMenuItemOnHover(e, isDisabled),
    [isDisabled],
  );

  const isDestructive = variant === 'destructive';

  const LinkComponent = useLinkComponent();

  return (
    <Item
      {...rest}
      ref={ref}
      // A row that navigates IS the link: its root is the application's
      // anchor, so a modified click, a middle click, copying the address and
      // the status bar all keep the browser's meaning. A row without an
      // address keeps the default root.
      as={href != null ? LinkComponent : undefined}
      role="menuitem"
      tabIndex={isDisabled ? undefined : -1}
      // The row's own handling runs first, then the caller's.
      onPointerMove={composeEventHandlers(handlePointerMove, onPointerMove)}
      {...pressable}
      startContent={
        icon
          ? renderIconSlot(icon, {
              size: 'sm',
              color: isDestructive ? 'error' : 'secondary',
            })
          : undefined
      }
      label={label}
      description={description}
      endContent={endContent}
      onClick={handleClick}
      onAuxClick={composeEventHandlers(handleAuxClick, onAuxClick)}
      href={href}
      target={target}
      rel={rel}
      // A menu row is never a draggable link. Under a mouse, the browser's
      // native link drag starts a few pixels into a press and cancels the
      // pointer stream (`pointercancel`), so the press model could not let
      // the row under the release act.
      draggable={href != null ? false : undefined}
      isDisabled={isDisabled}
      xstyle={[
        menuItemStyles.root,
        itemSizeStyles[menuSize],
        isDestructive && menuItemStyles.destructive,
        isDisabled && menuItemStyles.disabled,
        xstyle,
      ]}
      {...mergeProps(
        themeProps('dropdown-menu-item', {
          size: menuSize,
          variant: isDestructive ? 'destructive' : null,
        }),
        {
          className,
          style,
        },
      )}
    />
  );
}

DropdownMenuItem.displayName = 'DropdownMenuItem';
