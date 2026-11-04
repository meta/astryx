// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Badge',
  displayName: 'Badge',
  category: 'Feedback & Status',
  keywords: ["badge","tag","chip","label","status","indicator","count","counter","pill","notification","marker"],
  props: [
    {
      name: 'variant',
      type: "'neutral' | 'info' | 'success' | 'warning' | 'error' | 'blue' | 'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
      description:
        'Visual style variant. Semantic variants (neutral, info, success, warning, error) use solid backgrounds. Non-semantic color variants use tinted backgrounds with colored text for categorization and tagging.',
      default: "'neutral'",
    },
    {
      name: 'label',
      type: 'ReactNode',
      required: true,
      description:
        'Badge text content. A badge is one line and at least as tall as that line of its label, so it grows with its text (a larger text size); a label wider than the space available is cut with an ellipsis rather than escaping its container; a string or number label is also set as the badge\'s title so the full text stays reachable on hover.',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Optional leading icon.',
      slotElements: [{__element: 'Icon', props: {icon: 'check', size: 'sm'}}],
    },
  ],
  playground: {
    defaults: {
      label: 'Badge',
      variant: 'neutral',
    },
  },
  theming: {
    targets: [
      {className: 'astryx-badge', visualProps: ['variant']},
    ],
  },
  usage: {
    description:
      'Badge highlights a status or category at a glance. Use it sparingly: only when a value represents a distinct state (Active, Failed) or a grouping tag (Engineering, Design). Most metadata (dates, durations, counts, descriptions) should be plain description text, not badges.',
    bestPractices: [
      {guidance: true, description: 'Every status badge steals attention. Only badge states where the user needs to notice or act: errors, warnings, items requiring follow-up. If no action is needed, plain text is fine.'},
      {guidance: true, description: 'Use success, warning, and error variants only for system status that demands attention: "Failed", "Degraded", "Action Required". These have bold solid backgrounds designed to stand out.'},
      {guidance: true, description: 'Use color variants (blue, purple, teal, etc.) for category tags that group or classify items: team names, content types, priority levels.'},
      {guidance: true, description: 'Keep labels to one or two words. If you need more detail, put it in surrounding text instead of the badge.'},
      {guidance: true, description: 'Add an icon when it helps identify the badge type quickly, but always include a text label alongside it.'},
      {guidance: false, description: 'Apply a "success" badge to every healthy/active/normal item. If all rows show green "Active" badges, none stand out; the badge adds noise, not information. Show only the states that need user attention (errors, warnings, pending actions).'},
      {guidance: false, description: 'Use badges for metadata. Durations ("6h window"), counts ("12 trigger types"), dates, and descriptions are not statuses or categories; use description text (Text with type="supporting") instead.'},
      {guidance: false, description: 'Use semantic status variants (success, warning, error, info) for categories or informational content. These are visually loud and should only indicate system state.'},
      {guidance: false, description: 'Repeat the same badge in every row of a table or list. If the same value appears in most rows, it\'s not adding information; use plain text for common states and reserve badges for the exceptional ones.'},
      {guidance: false, description: 'Make badges clickable; they are read-only indicators. Use a button or link if the user needs to take action.'},
    ],
    anatomy: [
      {name: 'Icon', required: false, description: 'An optional leading icon that helps identify the badge type at a glance.'},
      {name: 'Label', required: true, description: 'The text or number shown inside the badge.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Badge',
  displayName: 'Badge',
  usage: {
    description:
      'Badge highlights a status or category at a glance. Use it sparingly: only when a value represents a distinct state (Active, Failed) or a grouping tag (Engineering, Design). Most metadata (dates, durations, counts, descriptions) should be plain description text, not badges.',
    bestPractices: [
      {guidance: true, description: 'Every status badge steals attention. Only badge states where the user needs to notice or act: errors, warnings, items requiring follow-up. If no action is needed, plain text is fine.'},
      {guidance: true, description: 'Use success, warning, and error variants only for system status that demands attention: "Failed", "Degraded", "Action Required". These have bold solid backgrounds designed to stand out.'},
      {guidance: true, description: 'Use color variants (blue, purple, teal, etc.) for category tags that group or classify items: team names, content types, priority levels.'},
      {guidance: true, description: 'Keep labels to one or two words. If you need more detail, put it in surrounding text instead of the badge.'},
      {guidance: true, description: 'Add an icon when it helps identify the badge type quickly, but always include a text label alongside it.'},
      {guidance: false, description: 'Apply a "success" badge to every healthy/active/normal item. If all rows show green "Active" badges, none stand out; the badge adds noise, not information. Show only the states that need user attention (errors, warnings, pending actions).'},
      {guidance: false, description: 'Use badges for metadata. Durations ("6h window"), counts ("12 trigger types"), dates, and descriptions are not statuses or categories; use description text (Text with type="supporting") instead.'},
      {guidance: false, description: 'Use semantic status variants (success, warning, error, info) for categories or informational content. These are visually loud and should only indicate system state.'},
      {guidance: false, description: 'Repeat the same badge in every row of a table or list. If the same value appears in most rows, it\'s not adding information; use plain text for common states and reserve badges for the exceptional ones.'},
      {guidance: false, description: 'Make badges clickable; they are read-only indicators. Use a button or link if the user needs to take action.'},
    ],
    anatomy: [
      {name: 'Icon', required: false, description: 'An optional leading icon that helps identify the badge type at a glance.'},
      {name: 'Label', required: true, description: 'The text or number shown inside the badge.'},
    ],
  },
  props: [
    {
      name: 'variant',
      type:
        "'neutral' | 'info' | 'success' | 'warning' | 'error' | 'blue' | 'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
      description: '视觉样式变体。语义变体使用实色背景，非语义颜色变体使用浅色背景配彩色文字。',
      default: "'neutral'",
    },
    {name: 'label', type: 'ReactNode', required: true, description: '徽章文本内容。'},
    {name: 'icon', type: 'ReactNode', description: '可选的前置图标。'},
  ],
  theming: {
    targets: [
      {
        className: 'astryx-badge',
        visualProps: [
          'variant',
        ],
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'highlights a status or category tag, NOT for general metadata',
  usage: {
    description:
      'Badge is for status (Active, Failed) and category tags (Engineering, Design). It is NOT for metadata like dates, durations, counts, or descriptions; use description text (Text type="supporting") for those.',
    bestPractices: [
      {guidance: true, description: 'Every badge steals attention. Only badge states where the user needs to act. If no follow-up is needed, use plain text.'},
      {guidance: true, description: 'Use success/warning/error ONLY for system status requiring attention (Failed, Degraded, Action Required). These are visually loud: solid colored backgrounds.'},
      {guidance: true, description: 'Use color variants (blue, purple, teal) for category tags that classify items: team names, content types, priority levels.'},
      {guidance: true, description: 'Keep labels to one or two words. If more detail is needed, put it in surrounding text instead of the badge.'},
      {guidance: true, description: 'Add an icon when it helps identify the badge type quickly, but always include a text label alongside it.'},
      {guidance: false, description: 'Apply "success" badges to every healthy/normal item. If most rows are green "Active", none stand out. Skip the badge for the default state; only highlight exceptions that need attention.'},
      {guidance: false, description: 'Use badges for metadata. Durations, counts, dates, descriptions → use Text with type="supporting" instead.'},
      {guidance: false, description: 'Use status variants for non-status info. "6h window", "12 types", category names are NOT statuses.'},
      {guidance: false, description: 'Repeat loud badges in every row. Common/default states should be plain text; reserve badges for the exceptional.'},
      {guidance: false, description: 'Make badges clickable; they are read-only. Use a button or link for actions.'},
    ],
    anatomy: [
      {name: 'Icon', required: false, description: 'Optional leading icon.'},
      {name: 'Label', required: true, description: 'Text or number shown inside the badge.'},
    ],
  },
  propDescriptions: {
    variant: 'visual style variant',
    label: 'badge text content; over-wide labels clip with an ellipsis, full text in title',
    icon: 'optional leading icon',
  },
};
