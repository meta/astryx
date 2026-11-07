// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTruncation',
  displayName: 'useTruncation',
  keywords: [
    'truncation',
    'truncate',
    'ellipsis',
    'overflow',
    'line-clamp',
    'clamp',
    'tooltip',
    'full text',
    'text cut off',
    'table cell',
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
        'Maximum number of lines before truncation. 1 detects single-line overflow (scrollWidth against offsetWidth); values above 1 detect a -webkit-line-clamp cut by measuring the real content height with a Range, bypassing the clamped scrollHeight. 0 disables detection: isTruncated stays false and fullText stays empty.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'ref',
      type: 'RefCallback<HTMLElement>',
      description:
        'Ref callback to attach to the text element being measured. Re-attaching to another element re-observes it and cleans up the previous observation.',
    },
    {
      name: 'isTruncated',
      type: 'boolean',
      description:
        'Whether the text is currently cut off. Drives composing a Tooltip with the full text: render the tooltip only when this is true, so a cell that fits shows none.',
    },
    {
      name: 'fullText',
      type: 'string',
      description:
        "The element's current text content, captured on every measurement, for the tooltip a truncated cell shows. Follows content changes that resize nothing (a fixed-width status line whose text swaps).",
    },
  ],
  usage: {
    description:
      "Detects whether an element's text is cut off — single-line overflow or clamped to several lines — and gives back the full text, updating when the size or the content changes. Built on a shared ResizeObserver and a shared MutationObserver, so hundreds of table cells create one observer of each kind, and a first measurement runs batched in a microtask after the commit instead of forcing a layout pass per text during mount. Use it wherever a truncated cell should show its full content only when it is actually truncated: compose a Tooltip off isTruncated and fullText instead of always rendering one. Text and Heading build their truncation tooltips on it; reach for it directly when composing truncation feedback into your own component.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Render the full-content Tooltip only when isTruncated is true, and read the tooltip text from fullText: a cell that fits shows no tooltip, and the text always matches what was measured.',
      },
      {
        guidance: true,
        description:
          'Apply the matching clamp yourself next to the hook — white-space: nowrap for maxLines 1, -webkit-line-clamp for more — so what the user sees and what the hook measures stay the same shape.',
      },
      {
        guidance: true,
        description:
          'Reuse one useTruncation instance per measured element; the ref callback cleans up its own observers, so swapping elements is safe.',
      },
      {
        guidance: false,
        description:
          'Compare scrollHeight to offsetHeight yourself for clamped text: with -webkit-line-clamp active browsers report the clamped size, which is exactly the case the Range measurement exists for.',
      },
    ],
  },
  relatedComponents: ['Text', 'Heading', 'Tooltip'],
  importPath: '@astryxdesign/core',
  category: 'text',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Detects whether text is cut off (single-line overflow or -webkit-line-clamp) and returns the full text, updating on size and content changes. Shared Resize/Mutation observers keep hundreds of cells at one observer each; first measurement batches in a microtask after commit.',
  paramDescriptions: {
    options: 'config object.',
    'options.maxLines':
      'lines allowed before truncation; 1 = single-line overflow check, >1 = clamp detection via Range measurement, 0 = off.',
  },
  returnDescriptions: {
    ref: 'ref callback for the measured text element; swapping elements re-observes and cleans up.',
    isTruncated:
      'true while the text is cut off; gate the full-content Tooltip on it.',
    fullText:
      'current text content for the tooltip; follows content changes that resize nothing.',
  },
  usage: {
    description:
      'Truncation detection + full text for tooltips. Gate a Tooltip on isTruncated and read its text from fullText so only actually-cut cells show one. Shared observers; batched first measurement. Text/Heading build their truncation tooltips on it; use directly when composing truncation feedback yourself.',
    bestPractices: [
      {
        guidance: true,
        description: 'Tooltip only when isTruncated; text from fullText.',
      },
      {
        guidance: true,
        description:
          'Apply the matching clamp (nowrap / line-clamp) next to the hook so view and measurement agree.',
      },
      {
        guidance: true,
        description:
          'One hook instance per measured element; the ref cleans up after itself.',
      },
      {
        guidance: false,
        description:
          'Manual scrollHeight checks on clamped text — browsers report the clamped size.',
      },
    ],
  },
};
