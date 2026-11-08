// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableInfiniteScroll.doc.mjs
 * @input Controlled Table loading configuration
 * @output Consumer documentation for useTableInfiniteScroll
 * @position Discoverable Table plugin documentation
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'useTableInfiniteScroll',
  displayName: 'useTableInfiniteScroll',
  subComponentOf: 'Table',
  description:
    'Incrementally load flat Table data with one shared automatic/manual request lifecycle. Returns a stable TablePlugin<T>. A localized Load more Button stays available while hasMore is true; IntersectionObserver adds automatic loading when the end sentinel is visible. The Button remains mounted and focusable while busy and owns the loading announcement.',
  usage: {
    description:
      'Call useTableInfiniteScroll<T>({hasMore, isLoading, onLoadMore}) and pass the result to <Table plugins={{infiniteScroll: plugin}} />. Keep accumulated rows in your own state. onLoadMore must return a Promise<void> that settles when the batch work completes. A fulfilled request finishes after settlement and a subsequent committed isLoading=false; a true loading phase is not required. Visible short batches can automatically request again in a later task, so update hasMore when the source is exhausted. A resolved request that appends no rows must not incorrectly claim endless more data. Throws, rejections and invalid non-Promise results pause automatic loading; the manual Button can retry once controlled loading is false. The hook does not render product errors or cancel transport. For a new dataset, key and remount the component owning both the hook and its Table, not only the Table child; prevent stale responses from committing caller data yourself. Children mode and unsupported row models do not load and emit a deduplicated development warning. Body modifiers must declare compatible rowModel: flat. Observation uses the browser viewport, with zero look-ahead and no ancestor discovery. Without IntersectionObserver, the same manual command works.',
  },
  props: [
    {
      name: 'hasMore',
      type: 'boolean',
      required: true,
      description:
        'Whether the source can provide another batch. False removes loading chrome and observation. Only a focused removed command hands focus to the shared Table viewport, without scrolling.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      required: true,
      description:
        'Caller-controlled loading. Blocks requests while true. The outstanding request latch also keeps the Button busy through Promise settlement and the next false commit.',
    },
    {
      name: 'onLoadMore',
      type: '() => Promise<void>',
      required: true,
      description:
        'Fetch and append the next batch, returning its completion Promise. Rows, cursors, errors and stale-response suppression stay caller-owned. Callback identity changes do not reset pending work or failure pause.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Stable flat-data TablePlugin<T>. Three controlled fields: hasMore, isLoading, onLoadMore():Promise<void>. Always-available manual Button; visible sentinel adds automatic loads. Shared latch and post-settlement false commit gate completion. Failure pauses automatic loads; manual retry recovers. Reset by remounting the hook owner and Table together.',
  propDescriptions: {
    hasMore:
      'Allow another batch. False removes observation/chrome and hands off only owned Button focus.',
    isLoading:
      'Controlled busy flag; pending Promise and its completion commit also block requests.',
    onLoadMore:
      'Return batch completion Promise; append rows and suppress stale product responses yourself.',
  },
};
