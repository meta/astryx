// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Run Console',
  displayName: 'Run Console',
  description:
    'A CI run console where New run, Re-run and Cancel update a list of pipeline and test runs. A status-filtered run history opens a detail view with progress, numbered steps, per-step logs, and test results with failures listed first.',
  keywords: [
    'CI run console',
    'pipeline runs',
    'run history',
    'build logs',
    'test results',
    'job status',
  ],
  isReady: false,
  category: 'Tools - Run Console',
  icons: {
    ArrowDownTrayIcon: 'download',
    ArrowLeftIcon: 'arrowLeft',
    ArrowPathIcon: 'refresh',
    PlayIcon: 'play',
    StopIcon: 'stop',
  },
};
