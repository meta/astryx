// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useIcon.ts
 * @input Semantic icon name, or a component icon slot with its state and
 *   fallback
 * @output Exports useIcon hook for theme-aware icon lookup (node-valued; a
 *   function entry is read at `{size: 'md'}`) and the internal
 *   useComponentIcon hook that resolves a slot from the nearest Theme
 * @position Client hooks for components that render registry icons directly
 */

import type {ReactNode} from 'react';
import {useThemeName} from '../theme/useTheme';
import {
  getIcon,
  resolveComponentIcon,
  type ComponentIconFallback,
  type ComponentIconSlotState,
  type IconName,
  type NamespacedIconName,
  type ResolvedComponentIcon,
} from './globalIconRegistry';
import type {ComponentIconSlotName} from './index';

/**
 * Resolve a semantic icon name from the nearest Theme, falling back through
 * root theme registration, global icon overrides, and built-in defaults.
 *
 * Accepts a namespaced extension key (`'richtext:bold'`) as well as a built-in
 * name; both resolve through the same registry.
 *
 * Returns a React node: a function entry is read at `{size: 'md'}`. Render
 * `<Icon icon={name} />` to resolve the entry at another size.
 */
export function useIcon(name: IconName | NamespacedIconName): ReactNode {
  const themeName = useThemeName();
  return getIcon(name, themeName);
}

/**
 * Resolve a component icon slot from the nearest Theme: the theme's
 * `componentIcons[slot]` applied to the component's own fallback.
 * @internal
 */
export function useComponentIcon<Slot extends ComponentIconSlotName>(
  slot: Slot,
  state: ComponentIconSlotState<Slot>,
  fallback: ComponentIconFallback,
): ResolvedComponentIcon {
  const themeName = useThemeName();
  return resolveComponentIcon(slot, state, fallback, themeName);
}
