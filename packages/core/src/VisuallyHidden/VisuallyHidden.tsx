// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VisuallyHidden.tsx
 * @input Uses React createElement/ElementType, stylex
 * @output Exports VisuallyHidden component and VisuallyHiddenProps
 * @position Accessibility primitive; renders content in the a11y tree while
 *   hiding it visually (icon-only labels, aria-live regions, SR-only context)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/VisuallyHidden/VisuallyHidden.doc.mjs
 * - /packages/core/src/VisuallyHidden/VisuallyHidden.test.tsx
 * - /apps/storybook/stories/VisuallyHidden.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/VisuallyHidden/ (showcase blocks)
 */

import {createElement, type ElementType, type ReactNode, type Ref} from 'react';
import type {BaseProps} from '../BaseProps';
import type {StyleXStyles} from '@stylexjs/stylex';
import * as stylex from '@stylexjs/stylex';

/**
 * VisuallyHidden is deliberately styling-free: it exists to *not* be seen, so it
 * omits `className`/`style` and applies a fixed, non-overridable clip block —
 * styling a visually-hidden node is always a mistake. The accessibility
 * pass-throughs from `BaseProps` (`aria-*`, `role`, `id`, `data-*`, event
 * handlers) remain, since the live-region use case needs them.
 *
 * `xstyle` stays declared and documented as ignored, because released 0.7.2
 * accepted it through `BaseProps`: narrowing the interface would force every
 * consumer to edit code, which is a `[breaking]` change for a planned minor
 * (`spec:AST-017/FR53`). It carries no `@deprecated` marker either — under
 * `spec:AST-017/FR28` a patch may only deprecate a surface it ships an exact
 * migration for, and this fix ships none. Dropping the prop from the interface,
 * with the migration being to delete it, belongs to a planned minor.
 */
export interface VisuallyHiddenProps extends Omit<
  BaseProps<HTMLElement>,
  'className' | 'style'
> {
  /** Ref forwarded to the rendered element. */
  ref?: React.Ref<HTMLElement>;

  /** Content to expose to assistive technology while hidden from sight. */
  children: ReactNode;

  /**
   * HTML tag to render as. Defaults to `'span'` (inline) for the common
   * icon-label case; pass a block element such as `'div'` when wrapping block
   * content or hosting an `aria-live` region. This is a structural choice, not
   * a visual one.
   *
   * @default 'span'
   */
  as?: ElementType;

  /**
   * Ignored: VisuallyHidden has no styling surface. The clip block is the only
   * style applied, and nothing a caller passes can displace it.
   *
   * Accepted only so that code written against 0.7.2 keeps compiling. It is not
   * applied to the element, and a planned minor removes it — the migration is to
   * delete the prop.
   */
  xstyle?: StyleXStyles;
}

const styles = stylex.create({
  // Canonical "visually hidden" clip block. Uses `clip: rect(...)` (not
  // clip-path) for the widest assistive-tech/browser support. `inset` pins the
  // 1px box to the top-left so a positioned ancestor cannot reveal it, and
  // pointer/selection are disabled so the hidden node can't catch clicks or be
  // text-selected.
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderStyle: 'none',
    insetBlockStart: 0,
    insetInlineStart: 0,
    pointerEvents: 'none',
    userSelect: 'none',
  },
});

/**
 * Renders its children in the accessibility tree while hiding them visually.
 *
 * Use for content that assistive technology must perceive but sighted users
 * should not see: accessible names for icon-only controls, `aria-live`
 * announcement regions, and supplementary screen-reader context.
 *
 * @example
 * ```
 * <IconButton icon="trash" label="">
 *   <VisuallyHidden>Delete incident</VisuallyHidden>
 * </IconButton>
 * <VisuallyHidden as="div" aria-live="polite">
 *   {`Moved ${task} to ${column}`}
 * </VisuallyHidden>
 * ```
 */
export function VisuallyHidden({
  children,
  as: element = 'span',
  ref,
  ...rest
}: VisuallyHiddenProps) {
  // `className` and `style` are off the interface, and the ignored `xstyle`
  // is off by intent. Take all three back off at runtime so a cast cannot reach
  // the element either: `xstyle` is not a valid attribute, so spreading it writes
  // xstyle="[object Object]" into the DOM, and a cast `style` keeps the last word
  // on `position` and un-hides the node.
  const {
    xstyle: _xstyle,
    className: _className,
    style: _style,
    ...props
  } = rest as typeof rest & {
    className?: unknown;
    style?: unknown;
  };
  return createElement(
    element,
    {
      ref: ref as Ref<Element>,
      // Spread consumer props (aria-*, role, id, data-*, handlers) first, then
      // the fixed clip styles, so the visually-hidden class can never be
      // displaced. There is no consumer className/style to merge — by design.
      ...props,
      ...stylex.props(styles.visuallyHidden),
    },
    children,
  );
}

VisuallyHidden.displayName = 'VisuallyHidden';
