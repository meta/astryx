// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Review Workspace',
  displayName: 'Review Workspace',
  description:
    'Workspace, three-pane on wide screens, for grading a fixed batch one item at a time: a batch rail with per-item status, the current item read in full in the center, and a scoring panel beside it (1–5 score, a decision, issue checkboxes, a note), with a progress bar overhead, Previous / Skip / Save & next pinned below, and a summary when the batch ends.',
  keywords: [
    'quality review',
    'grading',
    'approve / reject',
    'batch',
    'annotation',
    'one at a time',
    'skip',
    'progress',
    'completion summary',
  ],
  isReady: false,
  category: 'Tools - Review Workspace',
  icons: {
    ArrowDownTrayIcon: 'download',
    ArrowLeftIcon: 'arrowLeft',
    ArrowRightIcon: 'arrowRight',
    ArrowUturnLeftIcon: 'undo',
    CheckCircleIcon: 'success',
    QueueListIcon: 'list',
  },
};
