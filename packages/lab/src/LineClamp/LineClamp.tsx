// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LineClamp.tsx
 * @input Uses React, stylex, useTruncation + Tooltip + BaseProps from @astryxdesign/core
 * @output Exports LineClamp component, LineClampProps
 * @position Lab experiment (facebook/astryx#4180); consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/LineClamp/LineClamp.doc.mjs (props table, features)
 * - /packages/lab/src/LineClamp/LineClamp.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/LineClamp/index.ts (exports if types change)
 * - /apps/storybook/stories/LineClamp.stories.tsx (storybook stories)
 */

import {lazy, Suspense, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {useTruncation} from '@astryxdesign/core/Text';
import type {LayerPlacement} from '@astryxdesign/core/Layer';
import {mergeProps, mergeRefs} from '@astryxdesign/core/utils';
import {themeProps} from '@astryxdesign/core/utils';

const LazyTooltip = lazy(async () =>
  import('@astryxdesign/core/Tooltip').then(mod => ({default: mod.Tooltip})),
);

const styles = stylex.create({
  clamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  },
  tooltipContent: {
    maxWidth: '300px',
    wordBreak: 'break-word',
  },
});

export interface LineClampProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Content to clamp. Unlike `Text`'s `maxLines` (which truncates a single
   * text node), `LineClamp` wraps arbitrary children — mixed inline content,
   * nested elements, anything that isn't a single `Text`.
   */
  children: ReactNode;
  /**
   * Maximum number of lines to show before clamping with an ellipsis.
   */
  maxLines: number;
  /**
   * Show a tooltip with the full content on hover/focus when clamped.
   * - `true` (default): show tooltip at default position
   * - `false`: disable tooltip
   * - Position value: show tooltip at specific position
   * @default true
   */
  hasTooltip?: boolean | LayerPlacement;
  /**
   * HTML element to render.
   * @default 'div'
   */
  as?: 'div' | 'span' | 'p';
}

/**
 * Clamps arbitrary content to a fixed number of lines with an ellipsis.
 *
 * `Text`'s `maxLines` truncates the text component's own string content;
 * `LineClamp` is the composable version — wrap it around any children (mixed
 * inline content, nested elements) to clamp the whole block to N lines.
 *
 * Truncation detection reuses `useTruncation` (the same hook `Text` uses),
 * so overflow is measured correctly even while `-webkit-line-clamp` clips
 * `scrollHeight`.
 *
 * @example
 * ```
 * <LineClamp maxLines={2}>
 *   Some <strong>mixed</strong> inline content that may run long.
 * </LineClamp>
 * <LineClamp maxLines={3} hasTooltip={false}>{longDescription}</LineClamp>
 * ```
 */
export function LineClamp({
  children,
  maxLines,
  hasTooltip = true,
  as: Component = 'div',
  xstyle,
  className,
  style,
  ref,
  ...props
}: LineClampProps): ReactNode {
  const truncation = useTruncation({maxLines});
  const elementRef = useRef<HTMLElement>(null);

  const tooltipPlacement: LayerPlacement =
    typeof hasTooltip === 'string' ? hasTooltip : 'above';
  const tooltipEnabled =
    hasTooltip !== false && maxLines > 0 && truncation.isTruncated;

  return (
    <>
      <Component
        ref={mergeRefs(ref, truncation.ref, elementRef)}
        {...mergeProps(
          themeProps('line-clamp'),
          stylex.props(styles.clamp, xstyle),
          className,
          {...style, WebkitLineClamp: maxLines},
        )}
        title={tooltipEnabled ? truncation.fullText : undefined}
        {...props}>
        {children}
      </Component>
      {tooltipEnabled && (
        <Suspense fallback={null}>
          <LazyTooltip
            anchorRef={elementRef}
            content={
              <span {...stylex.props(styles.tooltipContent)}>
                {truncation.fullText}
              </span>
            }
            placement={tooltipPlacement}
          />
        </Suspense>
      )}
    </>
  );
}

LineClamp.displayName = 'LineClamp';
