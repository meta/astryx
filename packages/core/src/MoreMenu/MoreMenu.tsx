// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MoreMenu.tsx
 * @input Uses DropdownMenu, getIcon
 * @output Exports MoreMenu component and MoreMenuProps type
 * @position Core implementation; consumed by index.ts
 *
 * Overflow menu with a three-dot icon trigger. A thin wrapper around
 * DropdownMenu with icon-only button defaults.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/MoreMenu/MoreMenu.test.tsx
 * - /packages/core/src/MoreMenu/index.ts
 * - /apps/storybook/stories/MoreMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/MoreMenu/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import {useIcon} from '../Icon';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {useSize} from '../SizeContext/SizeContext';
import type {
  DropdownMenuOption,
  DropdownMenuPresentation,
} from '../DropdownMenu';
import type {LayerAlignment, LayerPlacement} from '../Layer';
import type {ButtonVariant, ButtonSize} from '../Button';
import type {BaseProps} from '../BaseProps';
import {stableClassName} from '../naming';
import {useTranslator} from '../i18n';

export interface MoreMenuProps extends Pick<
  BaseProps,
  'xstyle' | 'className' | 'style'
> {
  /** Ref forwarded to the trigger button */
  ref?: React.Ref<HTMLButtonElement>;

  /**
   * Menu items \u2014 data array of actions, dividers, and sections.
   * Same type as DropdownMenu's `items` prop.
   */
  items: DropdownMenuOption[];

  /**
   * Accessible label for the trigger button.
   * Always used as aria-label (the button is always icon-only).
   * @default 'More options'
   */
  label?: string;

  /**
   * Visual style variant of the trigger button.
   * @default 'ghost'
   */
  variant?: ButtonVariant;

  /**
   * Size of the trigger button.
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Override the default three-dot icon.
   * @default Three horizontal dots from the icon registry ('moreHorizontal')
   */
  icon?: ReactNode;

  /**
   * Whether the menu trigger is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Position of the menu relative to the trigger button.
   * Forwarded to DropdownMenu, which owns the default.
   * @default 'below'
   */
  placement?: LayerPlacement;

  /**
   * Alignment of the menu along the placement axis.
   * Forwarded to DropdownMenu, which owns the default.
   * @default 'start'
   */
  alignment?: LayerAlignment;

  /**
   * Menu presentation policy, forwarded to DropdownMenu. `adaptive` uses a
   * BottomSheet on compact coarse-pointer viewports and an anchored popover
   * elsewhere. Omitted, the menu is the anchored popover, and the finger that
   * opened it follows UIMenu's handoff on every device; `'popover'` pins the
   * pointer behavior on every device.
   */
  presentation?: DropdownMenuPresentation;

  /**
   * Controlled open state for the menu.
   */
  isMenuOpen?: boolean;

  /**
   * Callback fired when the menu visibility changes.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /** Test ID for testing frameworks. */
  'data-testid'?: string;
}

/**
 * Overflow menu with a three-dot icon trigger.
 *
 * A convenience wrapper around DropdownMenu with icon-only button defaults.
 *
 * @example
 * ```
 * <MoreMenu
 *   items={[
 *     { label: 'Edit', onClick: handleEdit },
 *     { label: 'Delete', onClick: handleDelete },
 *   ]}
 * />
 * ```
 */
export function MoreMenu({
  items,
  label: labelFromProps,
  variant = 'ghost',
  size: sizeProp,
  icon,
  isDisabled = false,
  placement,
  alignment,
  presentation,
  isMenuOpen,
  onOpenChange,
  xstyle,
  className: classNameProp,
  style,
  'data-testid': testId,
  ref,
}: MoreMenuProps) {
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.moreMenu.label');
  const size = useSize(sizeProp, 'md');
  const moreIcon = useIcon('moreHorizontal');

  return (
    <DropdownMenu
      className={
        classNameProp
          ? `${stableClassName('more-menu')} ${classNameProp}`
          : stableClassName('more-menu')
      }
      xstyle={xstyle}
      style={style}
      isMenuOpen={isMenuOpen}
      onOpenChange={onOpenChange}
      placement={placement}
      alignment={alignment}
      presentation={presentation}
      button={{
        label,
        icon: icon ?? moreIcon,
        variant,
        size,
        isDisabled,
        tooltip: label,
        isIconOnly: true,
        ref,
      }}
      items={items}
      hasChevron={false}
      data-testid={testId}
    />
  );
}

MoreMenu.displayName = 'MoreMenu';
