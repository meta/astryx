// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Documentation Technical',
  displayName: 'Documentation Technical',
  description:
    'Reference article ordered as sequential numbered steps with code at each stage, plus callout cards for prerequisites and onward links. A linear walkthrough rather than a browsable reference.',
  keywords: [
    'getting started',
    'install',
    'setup',
    'tutorial',
    'quickstart',
    'onboarding guide',
  ],
  isReady: true,
  category: 'Content - Documentation Technical',
  icons: {
    ChevronDownIcon: 'chevronDown',
    ClipboardDocumentIcon: 'clipboard',
    SparklesIcon: 'sparkles',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the content column: display title, last-updated date, and mobile on-this-page selector.',
    },
    {
      name: 'ai-prompt',
      kind: 'content',
      description:
        'Card below the header with the AI assistance prompt, copy button, and open-in menu.',
    },
    {
      name: 'prerequisites',
      kind: 'list',
      description:
        'Prerequisites section with a heading and a compact bulleted list of required tools.',
    },
    {
      name: 'steps',
      kind: 'content',
      description:
        'Install and theming sections with numbered steps, explanatory text, and code blocks, separated by dividers.',
    },
    {
      name: 'next-steps',
      kind: 'list',
      description:
        'Final section with a heading and a bulleted list of onward links to further documentation.',
    },
    {
      name: 'outline',
      kind: 'panel',
      description:
        'Sticky end-side panel with the on-this-page outline linking to article sections.',
    },
  ],
};
