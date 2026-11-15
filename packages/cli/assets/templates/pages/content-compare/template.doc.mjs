// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Content Compare',
  displayName: 'Content Compare',
  description:
    'Two text versions of one item with changed lines marked: a shared brief, side-by-side, unified and changes-only views with a resizable desktop split, a swap control, and a preferred-version choice with notes. Narrow screens show one version or the unified diff at a time.',
  keywords: [
    'side by side',
    'diff',
    'before and after',
    'two versions',
    'pairwise',
    'a/b',
    'draft vs baseline',
    'a/b content preference',
    'side-by-side diff',
    'pairwise judging',
    'human evaluation',
  ],
  isReady: false,
  category: 'Tools - Diff Compare Viewer',
  icons: {
    ArrowsRightLeftIcon: 'transfer',
    ChevronLeftIcon: 'chevronLeft',
    ChevronRightIcon: 'chevronRight',
    PencilSquareIcon: 'edit',
  },
};
