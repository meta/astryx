// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTruncation',
  displayName: 'useTruncation',
  keywords: [
    'truncation',
    'truncated',
    'overflow',
    'ellipsis',
    'line clamp',
    'clamp',
    'tooltip',
    'full text',
    'table',
    'text',
  ],
  params: [
    {
      name: 'options',
      type: 'UseTruncationOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.maxLines',
      type: 'number',
      description:
        'Maximum number of lines before truncation. 0 disables detection and keeps isTruncated false; 1 measures horizontal overflow; values above 1 measure the actual content height against the clamped element.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'ref',
      type: 'RefCallback<HTMLElement>',
      description:
        'Ref callback to attach to the element whose text is clipped. The hook observes that element for size and content changes and re-measures it, so the result follows both resizes and new text.',
    },
    {
      name: 'isTruncated',
      type: 'boolean',
      description:
        'Whether the text is currently cut off. Drive the tooltip or other reveal off this, so it appears only when there is hidden text.',
    },
    {
      name: 'fullText',
      type: 'string',
      description:
        "The element's complete text content, for a tooltip or another accessible reveal of the hidden text.",
    },
  ],
  usage: {
    description:
      'Detects whether a text element is cut off, for a single line or a multi-line clamp, and returns the full text to reveal. One shared ResizeObserver and one shared MutationObserver serve every caller, so hundreds of table cells add one observer of each kind instead of one per cell; content changes that do not resize the element still re-measure, and the measurement is skipped entirely when maxLines is 0. Use it when you build your own clipped element and need to know whether a tooltip or other disclosure is warranted; Text and Heading already wire it up through maxLines.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Attach the returned ref to the element that actually clips the text, and apply the line clamp or ellipsis to that same element.',
      },
      {
        guidance: true,
        description:
          'Render the tooltip only while isTruncated is true, so short values and roomy containers stay free of a tooltip that repeats visible text.',
      },
      {
        guidance: true,
        description:
          'Pass maxLines 0 when the element is not clipped, so the hook does no measuring or observing.',
      },
      {
        guidance: false,
        description:
          'Use Text or Heading with maxLines and rely on their built-in truncation tooltip when a plain text element is all you need.',
      },
    ],
  },
  relatedComponents: ['Text', 'Heading', 'Tooltip', 'Table'],
  relatedHooks: [],
  importPath: '@astryxdesign/core/Text',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Detects whether a text element is cut off (single line or multi-line clamp) and returns the full text. One shared ResizeObserver + one shared MutationObserver serve every caller, so many table cells add one of each instead of one per cell; content changes re-measure without a resize. maxLines 0 disables measuring. Use when you build your own clipped element; Text/Heading already wire it up through maxLines.',
  paramDescriptions: {
    options: 'config object.',
    'options.maxLines':
      'max lines before truncation. 0 = disabled + isTruncated false; 1 = horizontal overflow; >1 = content height vs clamped element.',
  },
  returnDescriptions: {
    ref: 'ref callback for the clipped element; observed for size + content changes, re-measured either way.',
    isTruncated: 'whether text is currently cut off; drive the tooltip/reveal off it.',
    fullText: 'complete text content, for a tooltip or other accessible reveal.',
  },
  usage: {
    description:
      'Detect cut-off text (single line / multi-line clamp) + full text to reveal. Shared observers per caller; content changes re-measure without resize; maxLines 0 skips measuring. Use for your own clipped element; Text/Heading already wire it via maxLines.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Attach the ref to the element that clips the text and apply the clamp/ellipsis there.',
      },
      {
        guidance: true,
        description:
          'Render the tooltip only while isTruncated, so short values + roomy containers stay tooltip-free.',
      },
      {
        guidance: true,
        description: 'Pass maxLines 0 when not clipped; no measuring or observing.',
      },
      {
        guidance: false,
        description:
          'Use Text/Heading maxLines + their built-in tooltip for plain text.',
      },
    ],
  },
};
