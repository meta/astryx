// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useIcon.ts
 * @input Semantic icon name
 * @output Exports useIcon hook for theme-aware icon lookup (node-valued; a
 *   function entry is read at `{size: 'md'}`)
 * @position Client hook for components that render registry icons directly
 */

import type {ReactNode} from 'react';
import {useThemeName} from '../theme/useTheme';
import {
  getIcon,
  type IconName,
  type NamespacedIconName,
} from './globalIconRegistry';

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
