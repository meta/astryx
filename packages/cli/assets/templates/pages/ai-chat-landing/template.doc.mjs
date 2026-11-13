// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'AI Chat Landing',
  displayName: 'AI Chat Landing',
  description:
    'Zero-state entry surface centered on a single composer with suggestion chips instead of history, sized for the moment before any content exists. The empty counterpart to a transcript.',
  keywords: [
    'chat',
    'conversation',
    'assistant',
    'prompt',
    'messages launcher',
  ],
  isReady: true,
  category: 'AI Chat - Landing',
  icons: {
    AtSymbolIcon: 'mention',
    ClockIcon: 'clock',
    CodeBracketIcon: 'code',
    Cog6ToothIcon: 'settings',
    LightBulbIcon: 'lightbulb',
    LockClosedIcon: 'lock',
    MagnifyingGlassIcon: 'search',
    PencilSquareIcon: 'compose',
    SparklesIcon: 'sparkles',
  },
  slots: [
    {
      name: 'greeting',
      kind: 'header',
      description:
        'Top of the centered column: sparkles icon, personalized hello, and the \'Where should we start?\' display title.',
    },
    {
      name: 'composer',
      kind: 'chat',
      description:
        'Centered ChatComposer below the greeting with input, attachment drawer, mode and settings menus, and dictation.',
    },
    {
      name: 'categories',
      kind: 'toolbar',
      description:
        'ToggleButtonGroup under the composer for picking a prompt category: Writing, Coding, Research, Creative.',
    },
    {
      name: 'suggestions',
      kind: 'list',
      description:
        'Grid of clickable suggestion cards below the category toggles that insert a starter prompt into the composer.',
    },
  ],
};
