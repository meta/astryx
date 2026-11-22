// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ComponentIcon.tsx
 * @input A component icon slot, its state, the component's fallback, an
 *   optional extension key when the theme sets no slot, and optional caller
 *   content
 * @output Exports the internal ComponentIcon renderer
 * @position Shared renderer for a themeable icon slot: caller content, then
 *   the theme's slot, then an extension key, then the fallback
 */

import type {ReactNode} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import {useThemeDefinition} from '../theme/useTheme';
import {Icon, type IconColor} from './Icon';
import {
  hasComponentIconSlot,
  type ComponentIconFallback,
  type ComponentIconSlotState,
  type NamespacedIconName,
} from './globalIconRegistry';
import type {ComponentIconSlotName, IconVariant} from './index';
import {useComponentIcon} from './useIcon';

type ComponentIconProps<Slot extends ComponentIconSlotName> = {
  slot: Slot;
  state: ComponentIconSlotState<Slot>;
  fallback: ComponentIconFallback;
  /**
   * Registry key drawn when the theme sets no value for this slot. A mapping
   * uses `fallback` instead, so an existing override of the key keeps drawing.
   */
  extensionKey?: NamespacedIconName;
  color?: IconColor;
  /**
   * StyleX styles for the resolved glyph, so a state the component draws as a
   * transform or transition stays on the element a theme targets. Ignored for
   * caller content, which the caller styles itself.
   */
  xstyle?: StyleXStyles;
  /**
   * Icon content the component's caller supplied. When set (`null`
   * included), it renders instead of the slot.
   */
  content?: ReactNode;
};

/**
 * Render a component's themeable icon. Caller content wins. Otherwise the
 * active theme's `componentIcons[slot]` adjusts the component's fallback,
 * and the result renders through `Icon`, so shared icon resolution chooses
 * the artwork. A resolved `null` renders nothing.
 * @internal
 */
export function ComponentIcon<Slot extends ComponentIconSlotName>({
  content,
  ...props
}: ComponentIconProps<Slot>): ReactNode {
  if (content !== undefined) {
    return content;
  }
  return <SlotIcon {...props} />;
}

function SlotIcon<Slot extends ComponentIconSlotName>({
  slot,
  state,
  fallback,
  extensionKey,
  color,
  xstyle,
}: Omit<ComponentIconProps<Slot>, 'content'>): ReactNode {
  const theme = useThemeDefinition();
  const {icon, variant, size} = useComponentIcon(slot, state, fallback);
  if (extensionKey != null && !hasComponentIconSlot(slot, theme)) {
    const own =
      fallback === null || typeof fallback === 'string'
        ? {icon: fallback}
        : fallback;
    return (
      <Icon
        icon={extensionKey}
        variant={own.variant}
        size={own.size}
        color={color}
        xstyle={xstyle}
      />
    );
  }
  if (icon == null) {
    return null;
  }
  return (
    <Icon
      icon={icon}
      // Resolution keeps only a variant the active theme lists.
      variant={variant as IconVariant | undefined}
      size={size}
      color={color}
      xstyle={xstyle}
    />
  );
}
