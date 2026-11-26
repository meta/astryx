// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfinityList.tsx
 * @input A fixed item height, a viewport height, and labels indexed by position
 * @output A native scroll area that mounts only nearby items
 * @position Lab experiment for lists beyond browser layout limits
 */
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  INITIAL_POSITION,
  jumpToItem,
  readScrollWindow,
  updateScrollWindow,
} from './scrollWindow';

const styles = stylex.create({
  viewport: {maxBlockSize: 'none', overflowAnchor: 'none'},
  list: {
    boxSizing: 'border-box',
    listStyle: 'none',
    margin: 0,
    paddingInlineStart: 0,
    paddingBlockEnd: 0,
  },
  extent: (height: number, offset: number) => ({
    blockSize: height,
    paddingBlockStart: offset,
  }),
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
  /** Native scroll viewport height in whole CSS pixels. */
  viewportHeight: number;
  /** Supplies the text for a mounted item. No array of all items is needed. */
  getItemLabel: (index: number) => string;
  ref?: Ref<InfinityListHandle>;
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

/** Fixed-height text items in a bounded native scroll area. */
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
  ref,
}: InfinityListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(INITIAL_POSITION);
  const geometry = {itemCount, itemHeight, viewportHeight};
  const window = readScrollWindow(geometry, position);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(index) {
        if (Number.isSafeInteger(index)) {
          setPosition(
            jumpToItem({itemCount, itemHeight, viewportHeight}, index),
          );
        }
      },
    }),
    [itemCount, itemHeight, viewportHeight],
  );

  // Sync the native viewport with the range that just committed.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (
      viewport !== null &&
      Math.abs(viewport.scrollTop - position.scrollTop) > 0.5
    ) {
      viewport.scrollTop = position.scrollTop;
    }
  }, [position]);

  const itemProps = stylex.props(styles.item, styles.pitch(itemHeight));
  return (
    <ScrollableArea
      ref={viewportRef}
      label={label}
      height={viewportHeight}
      stickyContainment={
        itemCount * itemHeight > viewportHeight ? 'always' : undefined
      }
      xstyle={styles.viewport}
      onScroll={event => {
        const scrollTop = event.currentTarget.scrollTop;
        setPosition(previous =>
          updateScrollWindow(geometry, previous, scrollTop),
        );
      }}>
      <ul
        role="list"
        aria-label={label}
        {...stylex.props(
          styles.list,
          styles.extent(window.height, window.offset),
        )}>
        {Array.from({length: window.end - window.start}, (_, i) => {
          const index = window.start + i;
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
    </ScrollableArea>
  );
}
