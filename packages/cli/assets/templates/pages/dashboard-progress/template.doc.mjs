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
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with program title, overall status badge, release-phase segmented filter and download action.',
    },
    {
      name: 'timeline',
      kind: 'chart',
      description:
        'First content section: milestone Gantt chart of dated bars with a today marker, or phase empty state.',
    },
    {
      name: 'summary',
      kind: 'chart',
      description:
        'Three-up card grid in second section: task progress donut and scope burndown line chart.',
    },
    {
      name: 'risks',
      kind: 'list',
      description:
        'Third card in the summary grid: blockers and risks list with severity badges and hover detail.',
    },
    {
      name: 'workstreams',
      kind: 'table',
      description:
        'Bottom card: per-owner workstream table with progress bars, due dates and status badges.',
    },
  ],
};
