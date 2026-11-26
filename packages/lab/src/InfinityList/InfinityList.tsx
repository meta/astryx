// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfinityList.tsx
 * @input Fixed item geometry and labels indexed by position
 * @output Nearby items in a clipped viewport with logical scrolling
 * @position Lab experiment for lists beyond browser layout limits
 */
import {useId, useImperativeHandle, useMemo, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {InfinityScrollbar} from './InfinityScrollbar';
import {endPosition, jumpToItem} from './scrollWindow';
import {useInfinityScroll} from './useInfinityScroll';

const styles = stylex.create({
  root: {display: 'flex'},
  viewport: {overflow: 'clip', flex: '1 1 auto', minInlineSize: 0},
  height: (height: number) => ({blockSize: height}),
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    transform: 'translateY(var(--infinity-translate, 0px))',
    willChange: 'transform',
  },
  item: {
    boxSizing: 'border-box',
    overflow: 'hidden',
    paddingInline: spacingVars['--spacing-3'],
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pitch: (height: number) => ({blockSize: height, lineHeight: `${height}px`}),
});

export interface InfinityListHandle {
  /** Scroll to a zero-based position, clamped at the list boundaries. */
  scrollToIndex: (index: number) => void;
}

export interface InfinityListProps {
  label: string;
  /** Number of items, up to one billion. */
  itemCount: number;
  /** Fixed item height in whole CSS pixels. */
  itemHeight: number;
  /** Viewport height in whole CSS pixels. */
  viewportHeight: number;
  /** Supplies the text for a mounted item. No array of all items is needed. */
  getItemLabel: (index: number) => string;
  handleRef?: Ref<InfinityListHandle>;
}

function assertGeometry(
  itemCount: number,
  itemHeight: number,
  viewportHeight: number,
) {
  const isSize = (n: number) => Number.isInteger(n) && n > 0 && n <= 65_536;
  if (
    !Number.isInteger(itemCount) ||
    itemCount < 0 ||
    itemCount > 1_000_000_000 ||
    !isSize(itemHeight) ||
    !isSize(viewportHeight) ||
    viewportHeight / itemHeight > 1_024
  ) {
    throw new RangeError(
      'InfinityList requires a supported item count and fixed viewport geometry.',
    );
  }
}

/** Fixed-height text items in a clipped scroll viewport. */
export function InfinityList(props: InfinityListProps) {
  const {itemCount, itemHeight, viewportHeight} = props;
  assertGeometry(itemCount, itemHeight, viewportHeight);
  return (
    <InfinityListViewport
      key={`${itemCount}:${itemHeight}:${viewportHeight}`}
      {...props}
    />
  );
}

function InfinityListViewport({
  label,
  itemCount,
  itemHeight,
  viewportHeight,
  getItemLabel,
  handleRef,
}: InfinityListProps) {
  const id = useId();
  const geometry = useMemo(
    () => ({itemCount, itemHeight, viewportHeight}),
    [itemCount, itemHeight, viewportHeight],
  );
  const end = endPosition(geometry);
  const canScroll = end.index > 0 || end.offset > 0;
  const thumbHeight = Math.min(
    viewportHeight,
    Math.max(24, viewportHeight ** 2 / (Math.max(1, itemCount) * itemHeight)),
  );
  const {viewportRef, listRef, thumbRef, range, navigate, move, readFraction} =
    useInfinityScroll(geometry, viewportHeight - thumbHeight);

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToIndex(index) {
        if (Number.isSafeInteger(index)) {
          navigate(jumpToItem(geometry, index));
        }
      },
    }),
    [geometry, navigate],
  );

  const itemProps = stylex.props(styles.item, styles.pitch(itemHeight));
  return (
    <div {...stylex.props(styles.root)}>
      <div
        ref={viewportRef}
        role="group"
        aria-label={label}
        {...stylex.props(styles.viewport, styles.height(viewportHeight))}>
        <ul
          id={id}
          ref={listRef}
          role="list"
          aria-label={label}
          {...stylex.props(styles.list)}>
          {Array.from({length: range.end - range.start}, (_, i) => {
            const index = range.start + i;
            return (
              <li
                key={index}
                aria-posinset={index + 1}
                aria-setsize={itemCount}
                {...itemProps}>
                {getItemLabel(index)}
              </li>
            );
          })}
        </ul>
      </div>
      {canScroll && (
        <InfinityScrollbar
          geometry={geometry}
          controls={id}
          label={label}
          thumbHeight={thumbHeight}
          thumbRef={thumbRef}
          navigate={navigate}
          move={move}
          readFraction={readFraction}
        />
      )}
    </div>
  );
}
