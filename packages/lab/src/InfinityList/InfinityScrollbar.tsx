// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfinityScrollbar.tsx
 * @input Scroll geometry and a logical navigation target
 * @output Keyboard and pointer control across the full range
 * @position Scrollbar for the clipped Lab viewport
 */
import {useRef, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {
  endPosition,
  INITIAL_POSITION,
  positionAtFraction,
  type ScrollGeometry,
  type ScrollPosition,
} from './scrollWindow';

const styles = stylex.create({
  track: {
    position: 'relative',
    inlineSize: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  thumb: {
    borderRadius: radiusVars['--radius-element'],
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: 0,
    touchAction: 'none',
    cursor: {
      default: 'grab',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    backgroundColor: colorVars['--color-neutral'],
    transform: 'translateY(var(--infinity-thumb-offset, 0px))',
  },
  size: (height: number) => ({blockSize: height}),
});

interface InfinityScrollbarProps {
  geometry: ScrollGeometry;
  controls: string;
  label: string;
  thumbHeight: number;
  thumbRef: RefObject<HTMLDivElement | null>;
  navigate: (position: ScrollPosition) => boolean;
  move: (delta: number) => boolean;
  readFraction: () => number;
}

export function InfinityScrollbar({
  geometry,
  controls,
  label,
  thumbHeight,
  thumbRef,
  navigate,
  move,
  readFraction,
}: InfinityScrollbarProps) {
  const drag = useRef<{
    pointer: number;
    start: number;
    fraction: number;
  } | null>(null);
  const {viewportHeight, itemHeight} = geometry;
  const travel = viewportHeight - thumbHeight;
  return (
    <div
      {...stylex.props(styles.track)}
      onPointerDown={event => {
        if (event.button !== 0 || event.target !== event.currentTarget) {
          return;
        }
        const top = event.currentTarget.getBoundingClientRect().top;
        navigate(
          positionAtFraction(geometry, (event.clientY - top) / viewportHeight),
        );
      }}>
      <div
        {...stylex.props(
          styles.thumb,
          styles.size(thumbHeight),
          focusOutlineStyles.focusVisible,
        )}
        ref={thumbRef}
        role="scrollbar"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={label}
        aria-controls={controls}
        aria-valuemin={0}
        aria-valuemax={endPosition(geometry).index}
        aria-valuenow={0}
        onKeyDown={event => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          ) {
            return;
          }
          switch (event.key) {
            case 'Home':
              navigate(INITIAL_POSITION);
              break;
            case 'End':
              navigate(endPosition(geometry));
              break;
            case 'ArrowDown':
              move(itemHeight);
              break;
            case 'ArrowUp':
              move(-itemHeight);
              break;
            case 'PageDown':
              move(viewportHeight);
              break;
            case 'PageUp':
              move(-viewportHeight);
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
        onPointerDown={event => {
          if (event.button !== 0 || travel <= 0 || drag.current !== null) {
            return;
          }
          event.preventDefault();
          event.currentTarget.focus({preventScroll: true});
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointer: event.pointerId,
            start: event.clientY,
            fraction: readFraction(),
          };
        }}
        onPointerMove={event => {
          const active = drag.current;
          if (active?.pointer !== event.pointerId || travel <= 0) {
            return;
          }
          navigate(
            positionAtFraction(
              geometry,
              active.fraction + (event.clientY - active.start) / travel,
            ),
          );
        }}
        onLostPointerCapture={event => {
          if (drag.current?.pointer === event.pointerId) {
            drag.current = null;
          }
        }}
      />
    </div>
  );
}
