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
    'mutation observer',
    'same-page navigation',
  ],
  params: [
    {
      name: 'containerRef',
      type: 'React.RefObject<HTMLElement | null>',
      description:
        'The container whose h1-h6 descendants become outline items. Pass the ref of the element that renders the headings.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'items',
      type: 'OutlineItem[]',
      description:
        "One item per h1-h6 element that has a non-empty id and text, in document order, ready for Outline's items prop. id is the element's id, label is its trimmed text, and level is its depth from 1 to 6.",
    },
  ],
  usage: {
    description:
      "Builds an Outline from the headings already in the DOM. Use it when the headings are rendered by something that is not this library's Markdown component - hand-written JSX, CMS output, a third-party renderer. A MutationObserver keeps the items in sync with the container while it renders, streams or is edited, so the outline follows the content without a re-render from you. For Markdown sources, useOutlineFromMarkdown shares the parser and heading slugs with Markdown; this hook trusts the ids the DOM already has.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Give every heading you want listed a non-empty id. Headings without an id or without text are skipped, because an Outline item cannot link without a target.',
      },
      {
        guidance: true,
        description:
          'Keep the heading ids stable across edits when the outline is used for navigation - links and history entries point at them.',
      },
      {
        guidance: true,
        description:
          'Pass the ref of the element that actually contains the headings. A container that holds them behind a portal or a shadow root will not be observed.',
      },
      {
        guidance: false,
        description:
          'Derive the outline by querying headings yourself in an effect - the observer wiring, the id/label filtering and the ordering are easy to get subtly wrong.',
      },
      {
        guidance: false,
        description:
          'Use this hook for Markdown content. useOutlineFromMarkdown agrees with what Markdown renders, including slug rules and streaming trims.',
      },
    ],
  },
  relatedComponents: ['Outline'],
  importPath: '@astryxdesign/core/Outline',
  category: 'Navigation',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'OutlineItem[] from the h1-h6 elements inside a DOM container: id, trimmed label, level 1-6. Kept in sync by a MutationObserver.',
  paramDescriptions: {
    containerRef:
      'ref to the element whose h1-h6 descendants become the outline.',
  },
  returnDescriptions: {
    items:
      'one item per heading with a non-empty id and label, in document order.',
  },
  usage: {
    description:
      'Outline items from the headings already in the DOM, live-updated through a MutationObserver. For Markdown sources useOutlineFromMarkdown shares the parser and slugs with Markdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give listed headings a non-empty id; items without a target are skipped.',
      },
      {
        guidance: true,
        description:
          'Keep heading ids stable across edits when the outline is navigable.',
      },
      {
        guidance: false,
        description:
          'Query headings yourself in an effect; the observer and filtering are the hook.',
      },
      {
        guidance: false,
        description:
          'Use it for Markdown content; useOutlineFromMarkdown matches Markdown rendering.',
      },
    ],
  },
};
