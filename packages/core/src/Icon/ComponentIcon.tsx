// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ComponentIcon.tsx
 * @input A component icon slot, its state, the component's fallback, and
 *   optional caller-supplied icon content
 * @output Exports the internal ComponentIcon renderer
 * @position Shared renderer that components use for a themeable icon slot:
 *   caller content, then the theme's slot, then the component's fallback
 */

import type {ReactNode} from 'react';
import {Icon, type IconColor} from './Icon';
import type {
  ComponentIconFallback,
  ComponentIconSlotState,
} from './globalIconRegistry';
import type {ComponentIconSlotName, IconVariant} from './index';
import {useComponentIcon} from './useIcon';

type ComponentIconProps<Slot extends ComponentIconSlotName> = {
  slot: Slot;
  state: ComponentIconSlotState<Slot>;
  fallback: ComponentIconFallback;
  color?: IconColor;
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
  color,
}: Omit<ComponentIconProps<Slot>, 'content'>): ReactNode {
  const {icon, variant, size} = useComponentIcon(slot, state, fallback);
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
    />
  );
}
