// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TruncatableText.tsx
 * @input Text's or Heading's element, its resolved props and truncation props
 * @output Exports TruncatableText, the client part of Text and Heading. It
 *   measures overflow, mounts the full-text tooltip and scopes Text's clamp.
 * @position Rendered by the directive-free Text.tsx and Heading.tsx: always
 *   in a client render, and in a Server Component for an explicit `maxLines`
 *   with the tooltip on. Its first render is the server markup.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Text/Text.doc.mjs
 * - /packages/core/src/serverSafeComponents.test.ts (CLIENT_ISLANDS)
 */

import {
  useRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {truncationTooltipStyles} from './text.stylex';
import {useTruncation} from './useTruncation';
import {
  TruncationTooltip,
  useTruncationTooltipInterest,
} from './TruncationTooltip';
import {TextClampScope} from './TextClampScope';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import type {LayerPlacement} from '../Layer';
import {useMergedRefs} from '../hooks/useMergedRefs';

export interface TruncatableTextProps {
  /** The element that Text or Heading renders. */
  as: ElementType;
  /** The element's resolved props: classes, style, ARIA and the caller's rest. */
  elementProps: HTMLAttributes<HTMLElement>;
  /** Lines before the text clips; 0 clips nothing. */
  maxLines: number;
  /** Text's and Heading's `hasTruncateTooltip`. */
  hasTruncateTooltip: boolean | LayerPlacement;
  /**
   * Whether the element clamps its own lines. Text sets it and tells its
   * children whether they are in clamped text; Heading leaves it unset.
   */
  isClamped?: boolean;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}

/**
 * Renders Text's or Heading's element. Once the text overflows, the first
 * hover, tap or focus mounts a tooltip with the full text.
 */
export function TruncatableText({
  as: Component,
  elementProps,
  maxLines,
  hasTruncateTooltip,
  isClamped,
  ref,
  children,
}: TruncatableTextProps) {
  // Only the tooltip reads the measured overflow. With the tooltip off, CSS
  // alone clips the text, and the hook measures and observes nothing.
  const truncation = useTruncation({
    maxLines: hasTruncateTooltip === false ? 0 : maxLines,
  });

  const tooltipPlacement: LayerPlacement =
    typeof hasTruncateTooltip === 'string' ? hasTruncateTooltip : 'above';
  const tooltipEnabled =
    maxLines > 0 && hasTruncateTooltip !== false && truncation.isTruncated;
  // The tooltip mounts on the first hover, tap or focus, not with the text.
  const tooltipInterest = useTruncationTooltipInterest(tooltipEnabled);

  const anchorRef = useRef<HTMLElement>(null);

  // Keep the merged ref stable across rerenders.
  const mergedRef = useMergedRefs(ref, truncation.ref, anchorRef);

  return (
    <>
      <Component
        ref={mergedRef}
        {...elementProps}
        onPointerEnter={composeEventHandlers(
          tooltipInterest.onPointerEnter,
          elementProps.onPointerEnter,
        )}
        onPointerLeave={composeEventHandlers(
          tooltipInterest.onPointerLeave,
          elementProps.onPointerLeave,
        )}
        onPointerDown={composeEventHandlers(
          tooltipInterest.onPointerDown,
          elementProps.onPointerDown,
        )}
        onFocus={composeEventHandlers(
          tooltipInterest.onFocus,
          elementProps.onFocus,
        )}
        onBlur={composeEventHandlers(
          tooltipInterest.onBlur,
          elementProps.onBlur,
        )}>
        {isClamped === undefined ? (
          children
        ) : (
          <TextClampScope isClamped={isClamped}>{children}</TextClampScope>
        )}
      </Component>
      {tooltipEnabled && tooltipInterest.isWanted && (
        <TruncationTooltip
          anchorRef={anchorRef}
          content={
            <span {...stylex.props(truncationTooltipStyles.content)}>
              {truncation.fullText}
            </span>
          }
          placement={tooltipPlacement}
          interest={tooltipInterest}
        />
      )}
    </>
  );
}

TruncatableText.displayName = 'TruncatableText';
