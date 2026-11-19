// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HStack.tsx
 * @input Uses Stack component
 * @output Exports HStack as a thin wrapper around Stack
 * @position Layout/Stack component; wraps Stack with direction='horizontal'
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Stack/Stack.doc.mjs
 * - /packages/core/src/HStack/HStack.test.tsx
 * - /packages/cli/assets/templates/blocks/components/HStack/ (showcase blocks)
 */

import {Stack, type StackProps} from '../Stack/Stack';
import type {
  StackCrossAlignment,
  StackMainAlignment,
} from '../Stack/stack.stylex';

export interface HStackProps extends Omit<
  StackProps,
  'direction' | 'hAlign' | 'vAlign'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Horizontal alignment of items (main-axis for horizontal stack).
   * - `start`: Align to start (left in LTR)
   * - `center`: Center items
   * - `end`: Align to end (right in LTR)
   * - `between`: Space between items
   * - `around`: Space around items
   * - `evenly`: Even space distribution
   */
  hAlign?: StackMainAlignment;

  /**
   * Vertical alignment of items (cross-axis for horizontal stack).
   * @default 'stretch'
   */
  vAlign?: StackCrossAlignment;

  /**
   * Main-axis alignment alias. Maps to `hAlign` on HStack.
   * Mirrors CSS `justify-content` / Tailwind `justify-*`.
   */
  justify?: StackMainAlignment;

  /**
   * Cross-axis alignment alias. Maps to `vAlign` on HStack.
   * Mirrors CSS `align-items` / Tailwind `items-*`.
   */
  align?: StackCrossAlignment;
}

/**
 * Horizontal stack component that arranges items along the inline axis:
 * left to right in LTR, right to left in RTL.
 * Convenience wrapper around `Stack` with `direction="horizontal"`.
 *
 * @example
 * ```
 * <HStack gap={2}>
 *   <Item />
 *   <Item />
 * </HStack>
 * ```
 */
export function HStack({
  ref,
  justify,
  align,
  hAlign,
  vAlign,
  ...props
}: HStackProps) {
  return (
    <Stack
      {...props}
      direction="horizontal"
      hAlign={hAlign ?? justify}
      vAlign={vAlign ?? align}
      ref={ref}
    />
  );
}

HStack.displayName = 'HStack';
