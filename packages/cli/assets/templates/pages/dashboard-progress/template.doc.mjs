// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Project Status Dashboard',
  displayName: 'Project Status Dashboard',
  description:
    'Status analytics mixing progress and time-axis shapes: a completion donut, a horizontal timeline of dated bars against a today marker, a per-owner table with progress and status, an at-risk list, and a burndown.',
  keywords: [
    'project',
    'program',
    'milestone',
    'roadmap',
    'launch',
    'delivery status',
    'workstreams and milestones',
    'gates',
    'blockers',
    'gantt',
    'rollout',
    'release planning',
    'readiness',
    'tracker',
  ],
  isReady: true,
  category: 'Dashboard - Project Status',
  icons: {
    ArrowDownTrayIcon: 'download',
    CheckCircleIcon: 'success',
    ExclamationTriangleIcon: 'warning',
    FlagIcon: 'flag',
    StopIcon: 'stop',
  },
};
