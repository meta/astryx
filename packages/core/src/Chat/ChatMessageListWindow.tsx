// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatMessageListWindow.tsx
 * @input ChatMessageList's items, ChatLayout's context and the stream scroll
 *   that runs on its scroll container
 * @output The mounted message rows, the gaps for the other items and the
 *   scrollToItem handle; every row when no ChatLayout is present
 * @position The renderer that useChatMessageListVirtualization carries. Only
 *   that hook imports this module. The shared windowing module computes the
 *   window; the stream scroll writes every scroll position.
 */
import {
  Fragment,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type FocusEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {useDevWarning} from '../hooks/useDevWarning';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isPositiveFinite} from '../virtualization/listWindow';
import {useMeasuredListWindow} from '../virtualization/useMeasuredListWindow';
import type {ListWindowKey} from '../virtualization/useListFocusIsland';
import {
  useChatLayoutContext,
  type ChatDensity,
  type ChatLayoutContextValue,
} from './ChatContext';
import type {
  ChatMessageListWindowing,
  ChatMessageListWindowProps,
} from './chatMessageListVirtualization';
import {
  streamScrollPositionListeners,
  streamScrollShifts,
} from './chatStreamScrollChannel';
import {isFollowingNewest} from './useChatStreamScroll';

/** The size of a message that has not rendered yet, in CSS px. */
const DEFAULT_ITEM_SIZE = 96;

const styles = stylex.create({
  // A flex item of the list's column: it must keep the full height.
  body: {
    display: 'flow-root',
    flexShrink: 0,
  },
  // Holds a correction while another writer moves the position.
  bodyOffset: (offset: number) => ({
    marginBlockStart: offset,
  }),
  // A row holds its item's margins, so its measured size includes them.
  row: {
    display: 'flow-root',
  },
  gap: (height: number) => ({
    height,
  }),
});

// The space between rows is padding inside each row after the first, so
// every row's measured size includes it.
const rowGapStyles = stylex.create({
  0: {paddingBlockStart: spacingVars['--spacing-0']},
  0.5: {paddingBlockStart: spacingVars['--spacing-0-5']},
  1: {paddingBlockStart: spacingVars['--spacing-1']},
  1.5: {paddingBlockStart: spacingVars['--spacing-1-5']},
  2: {paddingBlockStart: spacingVars['--spacing-2']},
  3: {paddingBlockStart: spacingVars['--spacing-3']},
  4: {paddingBlockStart: spacingVars['--spacing-4']},
  5: {paddingBlockStart: spacingVars['--spacing-5']},
  6: {paddingBlockStart: spacingVars['--spacing-6']},
  8: {paddingBlockStart: spacingVars['--spacing-8']},
  10: {paddingBlockStart: spacingVars['--spacing-10']},
});

const densityRowGap: Record<ChatDensity, stylex.StyleXStyles> = {
  compact: rowGapStyles[2],
  balanced: rowGapStyles[4],
  spacious: rowGapStyles[6],
};

/**
 * Moves the position through the stream scroll on `scroller`, so it never
 * reads a correction as the reader's scroll.
 */
function shiftScroller(scroller: HTMLElement, delta: number) {
  const shift = streamScrollShifts.get(scroller);
  if (shift == null) {
    scroller.scrollTop += delta;
  } else {
    shift.shiftBy(delta);
  }
}

/** Takes the position the stream scroll on `scroller` reads for each scroll event. */
function subscribePosition(
  scroller: HTMLElement,
  listener: (top: number) => void,
): () => void {
  let listeners = streamScrollPositionListeners.get(scroller);
  if (listeners == null) {
    listeners = new Set();
    streamScrollPositionListeners.set(scroller, listeners);
  }
  const subscribed = listeners;
  subscribed.add(listener);
  return () => {
    subscribed.delete(listener);
  };
}

interface WindowRowProps {
  itemKey: ListWindowKey;
  index: number;
  item: unknown;
  renderItem: (item: unknown, index: number) => ReactNode;
  gapStyle: stylex.StyleXStyles;
  observeItem: (key: ListWindowKey, element: HTMLElement) => () => void;
  onItemFocus: (key: ListWindowKey, focusTarget?: HTMLElement) => void;
  onItemBlur: () => void;
  /** The layout's content registration, for the newest item's row only. */
  contentRef: ((element: HTMLElement | null) => void) | undefined;
}

const WindowRow = memo(function WindowRow({
  itemKey,
  index,
  item,
  renderItem,
  gapStyle,
  observeItem,
  onItemFocus,
  onItemBlur,
  contentRef,
}: WindowRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Syncs the row's size measurement with its element.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    return element == null ? undefined : observeItem(itemKey, element);
  }, [itemKey, observeItem]);
  // Syncs ChatLayout's content observer with the newest item's row. Its
  // growth is new content, and a new row there is a new message; a
  // correction above it changes neither.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (contentRef == null || element == null) {
      return undefined;
    }
    contentRef(element);
    return () => contentRef(null);
  }, [contentRef]);
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    onItemFocus(itemKey, event.target);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      onItemBlur();
    }
  };
  return (
    <div
      ref={ref}
      onFocus={onFocus}
      onBlur={onBlur}
      {...stylex.props(styles.row, index > 0 && gapStyle)}>
      {renderItem(item, index)}
    </div>
  );
});

function WindowedItems({
  layout,
  items,
  getItemKey,
  renderItem,
  estimateItemSize,
  density,
  gap,
  handleRef,
}: ChatMessageListWindowProps & {layout: ChatLayoutContextValue}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = layout.scrollContainerRef;
  const keys = useMemo(
    () => items.map((item, index) => getItemKey(item, index)),
    [items, getItemKey],
  );
  const estimateSize = useCallback(
    (index: number) => {
      const size =
        typeof estimateItemSize === 'function'
          ? estimateItemSize(items[index], index)
          : estimateItemSize;
      return size !== undefined && isPositiveFinite(size)
        ? size
        : DEFAULT_ITEM_SIZE;
    },
    [items, estimateItemSize],
  );
  const writer = useMemo(
    () => ({
      shiftBy: (delta: number) => {
        const scroller = scrollerRef.current;
        if (scroller != null) {
          shiftScroller(scroller, delta);
        }
      },
      jumpTo: (top: number) => {
        const scroller = scrollerRef.current;
        if (scroller != null) {
          streamScrollShifts.get(scroller)?.unlock();
          shiftScroller(scroller, top - scroller.scrollTop);
        }
      },
    }),
    [scrollerRef],
  );
  const isEndAnchored = useCallback(() => {
    const scroller = scrollerRef.current;
    return scroller != null && isFollowingNewest(scroller);
  }, [scrollerRef]);
  // The log takes focus when the focused message is removed: the holder of
  // the rows is not focusable.
  const logRef = useMemo(
    () => ({
      get current(): HTMLElement | null {
        return contentRef.current?.closest<HTMLElement>('[role="log"]') ?? null;
      },
    }),
    [],
  );
  const list = useMeasuredListWindow({
    keys,
    estimateSize,
    scroller: scrollerRef,
    content: contentRef,
    focusTarget: logRef,
    writer,
    subscribePosition,
    isEndAnchored,
    isLastRetained: true,
  });
  const {reveal} = list;
  useImperativeHandle(
    handleRef,
    () => ({
      scrollToItem: (key, options) => reveal(key, options?.align),
    }),
    [reveal],
  );

  const gapStyle = gap == null ? densityRowGap[density] : rowGapStyles[gap];
  // One keyed list, so a row that moves between segments keeps its element.
  const children: ReactNode[] = [];
  let gapCount = 0;
  for (const segment of list.segments) {
    if (segment.type === 'gap') {
      children.push(
        <div
          key={`gap:${gapCount++}`}
          aria-hidden
          {...stylex.props(styles.gap(segment.height))}
        />,
      );
      continue;
    }
    for (let index = segment.start; index < segment.end; index++) {
      children.push(
        <WindowRow
          key={`item:${keys[index]}`}
          itemKey={keys[index]}
          index={index}
          item={items[index]}
          renderItem={renderItem}
          gapStyle={gapStyle}
          observeItem={list.observeItem}
          onItemFocus={list.onItemFocus}
          onItemBlur={list.onItemBlur}
          contentRef={
            index === items.length - 1 ? layout.contentRef : undefined
          }
        />,
      );
    }
  }
  return (
    <div
      ref={contentRef}
      aria-busy={list.isMountingHistory || undefined}
      {...stylex.props(
        styles.body,
        list.offset !== 0 && styles.bodyOffset(list.offset),
      )}>
      {children}
    </div>
  );
}

function ChatMessageListWindow(props: ChatMessageListWindowProps) {
  const layout = useChatLayoutContext();
  useDevWarning(
    'ChatMessageList',
    'virtualization windows the list only inside a ChatLayout, which owns the scroll container. Outside one, every item renders.',
    layout == null,
  );
  if (layout != null) {
    return <WindowedItems {...props} layout={layout} />;
  }
  const {items, getItemKey, renderItem} = props;
  return items.map((item, index) => (
    <Fragment key={getItemKey(item, index)}>{renderItem(item, index)}</Fragment>
  ));
}

export const CHAT_MESSAGE_LIST_WINDOWING: ChatMessageListWindowing =
  Object.freeze({Window: ChatMessageListWindow});
