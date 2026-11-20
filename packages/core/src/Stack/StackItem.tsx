// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StackItem.tsx
 * @input Uses React, ElementType, stackItem utility, StackItemScrollRegion
 * @output Exports StackItem polymorphic component and StackItemProps
 * @position Layout/Stack component; uses stackItem.stylex.ts. A scrollable
 *   `div` or `span` item renders through StackItemScrollRegion, which names
 *   it while it scrolls.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Stack/Stack.doc.mjs
 * - /packages/cli/assets/templates/blocks/components/Stack/ (showcase blocks)
 */

import {createElement, type ElementType, type ReactNode, type Ref} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  stackItem,
  type StackItemCrossAlignSelf,
  type StackItemSize,
} from './stackItem.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {StackItemScrollRegion} from '../hooks/StackItemScrollRegion';

const overflowStyles = stylex.create({
  scrollable: {
    overflow: 'auto',
  },
});

export interface StackItemProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Overrides the default cross-alignment for this item.
   * (hAlign for VStack, vAlign for HStack)
   */
  crossAlignSelf?: StackItemCrossAlignSelf;

  /**
   * Size behavior of the item within the stack.
   * - `static`: Uses intrinsic size, won't grow or shrink (default)
   * - `fill`: Grows to fill remaining space
   *
   * @default "static"
   */
  size?: StackItemSize;

  /**
   * Enables scrollable overflow (`overflow: auto`) for the item.
   *
   * StackItem already applies the flex `min-height: 0` / `min-width: 0`
   * reset, so `<StackItem size="fill" isScrollable>` is a complete scroll
   * region — it grows to fill the stack and scrolls its own overflow with
   * no extra style plumbing. Matches `isScrollable` on `LayoutContent`
   * and `LayoutPanel`. While its content overflows, a `div` or `span` item
   * is a group named by the caller's `aria-label`, or by a translated
   * "Content". Another element keeps its own role.
   * @default false
   */
  isScrollable?: boolean;

  /**
   * The element type to render.
   * @default 'div'
   */
  as?: ElementType;

  /**
   * Content to render inside the stack item.
   */
  children?: ReactNode;
}

/**
 * Stack item component for controlling individual item behavior within a stack.
 *
 * Supports polymorphic rendering via the `as` prop.
 *
 * @example
 * ```
 * <HStack gap={2}>
 *   <StackItem size="static">Logo</StackItem>
 *   <StackItem size="fill">Content</StackItem>
 *   <StackItem size="static">Actions</StackItem>
 * </HStack>
 * ```
 */
export function StackItem({
  crossAlignSelf,
  size,
  isScrollable,
  as: element = 'div',
  xstyle,
  className,
  style,
  children,
  ref,
  ...props
}: StackItemProps) {
  const stylexProps = stylex.props(
    ...stackItem({crossAlignSelf, size}),
    isScrollable && overflowStyles.scrollable,
    xstyle,
  );

  const elementProps = {
    ...mergeProps(
      themeProps('stack-item', {size}),
      stylexProps,
      className,
      style,
    ),
    ...props,
  };

  if (isScrollable && (element === 'div' || element === 'span')) {
    return createElement(
      StackItemScrollRegion,
      {as: element, ref, elementProps},
      children,
    );
  }

  return createElement(
    element,
    {ref: ref as Ref<Element>, ...elementProps},
    children,
  );
}

StackItem.displayName = 'StackItem';
