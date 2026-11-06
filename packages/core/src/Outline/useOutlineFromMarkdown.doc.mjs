// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useOutlineFromMarkdown',
  displayName: 'useOutlineFromMarkdown',
  keywords: [
    'outline',
    'table of contents',
    'toc',
    'markdown',
    'headings',
    'heading ids',
    'same-page navigation',
  ],
  params: [
    {
      name: 'markdown',
      type: 'string',
      description:
        'The Markdown source. Pass the same string you render with Markdown.',
      required: true,
    },
    {
      name: 'options',
      type: 'ParseOutlineFromMarkdownOptions',
      description:
        'Parse options. Omit them for a document that Markdown renders without plugins.',
      required: false,
    },
    {
      name: 'options.plugins',
      type: 'ReadonlyArray<MarkdownPluginEntry>',
      description:
        'The ordered Markdown plugin list. Pass the same list to Markdown, so transforms, labels and ids agree. The outline is recomputed when the list reference changes.',
      required: false,
    },
    {
      name: 'options.isFinal',
      type: 'boolean',
      description:
        "Whether the source is complete. Pass false while Markdown's isStreaming is true, so both apply the same transforms.",
      default: 'true',
      required: false,
    },
  ],
  returns: [
    {
      name: 'items',
      type: 'OutlineItem[]',
      description:
        "One item per root heading, in document order, ready for Outline's items prop. id is the id Markdown renders on the heading in a complete document without sources, label is the heading's text, and level is its depth from 1 to 6.",
    },
  ],
  usage: {
    description:
      'Extracts the headings of a Markdown string for an Outline next to the rendered document. It uses the parser and heading slugs that Markdown uses, so in a complete document each item links to its heading, and fenced code never counts as a heading. The result is memoized on the source and the options. Outside React, use parseOutlineFromMarkdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the same string, plugin list and finality to Markdown and this hook, so items match the rendered headings once the content is complete.',
      },
      {
        guidance: true,
        description:
          'Declare the plugin list outside the component or memoize it. A new array on each render recomputes the outline.',
      },
      {
        guidance: true,
        description:
          'For several documents on one page, install one createMarkdownHeadingLinks per document with headingIdPrefix, so their ids do not collide.',
      },
      {
        guidance: false,
        description:
          'Write the items by hand or find headings with a regular expression. They drift from the rendered ids.',
      },
      {
        guidance: false,
        description:
          'Expect every item to have a target while content streams. Markdown reveals text gradually and trims unfinished syntax, so a heading can be absent or have another id until the content is complete.',
      },
      {
        guidance: false,
        description:
          "Expect an item to link to a heading that cites a Markdown sources entry. The hook does not receive sources, so the ids differ: for '# Intro [ref]', Markdown renders intro and the hook returns intro-ref.",
      },
      {
        guidance: false,
        description:
          'Expect an item for a nested heading, such as one in a blockquote. Only root headings become items.',
      },
    ],
  },
  relatedComponents: ['Outline', 'Markdown'],
  importPath: '@astryxdesign/core/Outline',
  category: 'Navigation',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headings of a Markdown string as OutlineItem[] for an Outline beside the rendered document. Same parser and heading slugs as Markdown; memoized on source and options.',
  paramDescriptions: {
    markdown: 'Markdown source; the same string you render with Markdown.',
    options: 'parse options; omit for a document without plugins.',
    'options.plugins':
      'ordered plugin list; pass the same list to Markdown. New reference recomputes.',
    'options.isFinal':
      "whether the source is complete; false while Markdown's isStreaming is true.",
  },
  returnDescriptions: {
    items:
      'one item per root heading in document order: id is the rendered id in a complete document without sources, label is its text, level is 1-6.',
  },
  usage: {
    description:
      'Headings of a Markdown string for an Outline next to the rendered document. Same parser and slugs as Markdown, so items link to their headings in a complete document. Outside React, use parseOutlineFromMarkdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the same string, plugin list and finality to Markdown and the hook; items match the headings once content is complete.',
      },
      {
        guidance: true,
        description:
          'Keep the plugin list stable; a new array each render recomputes.',
      },
      {
        guidance: true,
        description:
          'Several documents on one page: one createMarkdownHeadingLinks per document with headingIdPrefix.',
      },
      {
        guidance: false,
        description: 'Write items by hand or find headings with a regex.',
      },
      {
        guidance: false,
        description:
          'Expect every item to have a target while content streams; a heading can be absent or have another id until complete.',
      },
      {
        guidance: false,
        description:
          'Expect an item to link to a heading that cites a Markdown sources entry; the hook does not receive sources, so the ids differ.',
      },
      {
        guidance: false,
        description:
          'Expect items for nested headings; only root headings count.',
      },
    ],
  },
};
