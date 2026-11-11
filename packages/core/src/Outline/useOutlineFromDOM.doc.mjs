// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useOutlineFromDOM',
  displayName: 'useOutlineFromDOM',
  keywords: [
    'outline',
    'table of contents',
    'toc',
    'headings',
    'dom',
    'same-page navigation',
  ],
  params: [
    {
      name: 'containerRef',
      type: 'React.RefObject<HTMLElement | null>',
      description:
        'The element that holds the headings. The hook reads h1 through h6 inside it.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'items',
      type: 'OutlineItem[]',
      description:
        "One item per heading that has both an id and text, in document order, ready for Outline's items prop. id is the heading's id, label is its trimmed text, and level is its depth from 1 to 6.",
    },
  ],
  usage: {
    description:
      'Builds outline items from the headings already in the page. Use it when the article is not a Markdown string, and pass the items to Outline. The list updates when headings are added, removed, renamed, or given a new id. A null ref returns an empty list.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Put an id on every heading the outline should list. A heading with no id, or with no text, is omitted.',
      },
      {
        guidance: true,
        description:
          'Point the ref at the article, not the page, so headings outside the article stay out of the outline.',
      },
      {
        guidance: false,
        description:
          'Expect the hook to invent ids. It only reads the ids the headings already have.',
      },
      {
        guidance: false,
        description:
          'Use it for a Markdown string. useOutlineFromMarkdown follows the same parser and slugs as Markdown.',
      },
    ],
  },
  relatedComponents: ['Outline'],
  relatedHooks: ['useOutlineFromMarkdown'],
  importPath: '@astryxdesign/core/Outline',
  category: 'Navigation',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Outline items from h1-h6 inside a DOM element. Updates when those headings change. Empty when the ref is null.',
  paramDescriptions: {
    containerRef: 'element that holds the headings.',
  },
  returnDescriptions: {
    items:
      'one item per heading with an id and text, in order: id, trimmed label, level 1-6.',
  },
  usage: {
    description:
      'Outline items from headings already in the page. Pass them to Outline. A heading needs an id and text.',
    bestPractices: [
      {
        guidance: true,
        description: 'Give each listed heading an id. A heading without one is omitted.',
      },
      {
        guidance: true,
        description: 'Point the ref at the article, not the whole page.',
      },
      {
        guidance: false,
        description: 'Expect the hook to invent heading ids.',
      },
      {
        guidance: false,
        description:
          'Use it for a Markdown string. useOutlineFromMarkdown matches Markdown.',
      },
    ],
  },
};
