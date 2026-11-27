// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfinityScrollbar.tsx
 * @input Scroll geometry and a logical navigation target
 * @output Keyboard and pointer control across the full range
 * @position Scrollbar for a clipped Lab viewport
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
  logicalPosition,
  positionAtFraction,
  type ScrollGeometry,
  type ScrollPosition,
} from './scrollWindow';

const styles = stylex.create({
  track: {
    position: 'relative',
    backgroundColor: colorVars['--color-background-surface'],
  },
  trackVertical: (extent: number) => ({
    inlineSize: spacingVars['--spacing-3'],
    blockSize: extent,
    alignSelf: 'end',
  }),
  trackHorizontal: {blockSize: spacingVars['--spacing-3'], gridColumn: 1},
  thumb: {
    borderRadius: radiusVars['--radius-element'],
    position: 'absolute',
    insetInlineStart: 0,
    insetBlockStart: 0,
    touchAction: 'none',
    cursor: {
      default: 'grab',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    forcedColorAdjust: {'@media (forced-colors: active)': 'none'},
    backgroundColor: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  vertical: (size: number) => ({
    inlineSize: '100%',
    blockSize: size,
    transform: 'translateY(var(--infinity-thumb-offset, 0px))',
  }),
  horizontal: (size: number) => ({
    blockSize: '100%',
    inlineSize: size,
    transform: 'translateX(var(--infinity-thumb-offset, 0px))',
  }),
});

interface InfinityScrollbarProps {
  geometry: ScrollGeometry;
  controls: string;
  label: string;
  thumbHeight: number;
  thumbRef: RefObject<HTMLDivElement | null>;
  orientation?: 'vertical' | 'horizontal';
  readInlineSign: () => number;
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
  orientation = 'vertical',
  readInlineSign,
  navigate,
  move,
  readFraction,
}: InfinityScrollbarProps) {
  const drag = useRef<{
    pointer: number;
    start: number;
    fraction: number;
    sign: number;
  } | null>(null);
  const {viewportHeight: extent, itemHeight: pitch} = geometry;
  const vertical = orientation === 'vertical';
  const axisSign = () => (vertical ? 1 : readInlineSign());
  const travel = extent - thumbHeight;
  return (
    <div
      {...stylex.props(
        styles.track,
        vertical ? styles.trackVertical(extent) : styles.trackHorizontal,
      )}
      onPointerDown={event => {
        if (event.button !== 0 || event.target !== event.currentTarget) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const local = vertical
          ? event.clientY - rect.top
          : axisSign() === 1
            ? event.clientX - rect.left
            : rect.right - event.clientX;
        navigate(positionAtFraction(geometry, local / extent));
      }}>
      <div
        {...stylex.props(
          styles.thumb,
          vertical
            ? styles.vertical(thumbHeight)
            : styles.horizontal(thumbHeight),
          focusOutlineStyles.focusVisible,
        )}
        ref={thumbRef}
        role="scrollbar"
        tabIndex={0}
        aria-orientation={orientation}
        aria-label={label}
        aria-controls={controls}
        aria-valuemin={0}
        aria-valuemax={logicalPosition(geometry, endPosition(geometry))}
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
            case 'PageDown':
              move(extent);
              break;
            case 'PageUp':
              move(-extent);
              break;
            case vertical ? 'ArrowDown' : 'ArrowRight':
              move(pitch * axisSign());
              break;
            case vertical ? 'ArrowUp' : 'ArrowLeft':
              move(-pitch * axisSign());
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
            start: vertical ? event.clientY : event.clientX,
            fraction: readFraction(),
            sign: axisSign(),
          };
        }}
        onPointerMove={event => {
          const active = drag.current;
          if (active?.pointer !== event.pointerId || travel <= 0) {
            return;
          }
          const coordinate = vertical ? event.clientY : event.clientX;
          navigate(
            positionAtFraction(
              geometry,
              active.fraction +
                (active.sign * (coordinate - active.start)) / travel,
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
