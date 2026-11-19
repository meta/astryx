// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LogStream',
  displayName: 'Log Stream',
  group: 'LogStream',
  category: 'Content',
  keywords: ['log', 'stream', 'terminal', 'console', 'output', 'logs', 'tail'],

  usage: {
    description:
      'Experimental streaming log viewer: mono grid rows (timestamp | level | source | message) with token-derived level accents, expandable per-row detail panels, follow-scroll live tailing with a "Jump to latest" affordance, and an always-dark terminal variant. In the default variant, warning and error labels use their plain-surface status foreground roles. Appended rows fade in via @starting-style. Live announcements follow the pinning state: the role="log" region is aria-live="polite" only while following the tail, and aria-live="off" while unfollowed, so a busy stream never floods assistive tech.',
  },

  props: [
    {
      name: 'entries',
      type: 'LogEntry[]',
      description: 'Array of log entry objects to render.',
      required: true,
    },
    {
      name: 'variant',
      type: "'default' | 'terminal'",
      description: "Visual variant style: 'default' uses theme surface background, 'terminal' uses fixed dark background.",
      default: "'default'",
    },
    {
      name: 'isFollowing',
      type: 'boolean',
      description: 'Controlled follow-pinning state to auto-scroll to the newest entry.',
    },
    {
      name: 'onFollowChange',
      type: '(following: boolean) => void',
      description: 'Callback fired when follow-pinning state changes.',
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description: 'Maximum container height before vertical scrolling.',
    },
    {
      name: 'hasTimestamps',
      type: 'boolean',
      description: 'Show or hide the timestamp column.',
      default: 'true',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the log region.',
      default: "'Log stream'",
    },
    {
      name: 'renderEntry',
      type: '(entry: LogEntry) => ReactNode',
      description: 'Custom render function for replacing individual row layout.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
  ],
};
