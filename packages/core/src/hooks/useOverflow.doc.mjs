// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useOverflow',
  displayName: 'useOverflow',
  keywords: [
    'overflow',
    'truncate',
    'responsive',
    'collapse',
    'resize',
    'measure',
    'hidden',
    'more',
    'breadcrumb',
  ],
  params: [
    {
      name: 'itemCount',
      type: 'number',
      description: 'Total number of items to measure for overflow.',
      required: true,
    },
    {
      name: 'options',
      type: 'UseOverflowOptions',
      description: 'Configuration object for overflow behavior.',
      required: false,
    },
    {
      name: 'options.gap',
      type: 'number',
      description: 'Gap between items in pixels. Used in width calculations.',
      default: '0',
      required: false,
    },
    {
      name: 'options.minVisibleItems',
      type: 'number',
      description:
        "Minimum number of items to always show, even if they don't fit.",
      default: '0',
      required: false,
    },
    {
      name: 'options.collapseFrom',
      type: "'start' | 'end'",
      description: 'which end to collapse items from.',
      default: "'end'",
      required: false,
    },
    {
      name: 'options.behavior',
      type: "'observeParent' | 'observeSelf'",
      description:
        "Which element to observe for overflow calculations. 'observeParent' uses the container's parent element width, allowing the visible container to remain content-sized.",
      default: "'observeSelf'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'containerRef',
      type: 'React.RefCallback<HTMLElement>',
      description: 'Ref callback to attach to the visible container element.',
    },
    {
      name: 'measureRef',
      type: 'React.RefCallback<HTMLElement>',
      description:
        'Ref callback to attach to the hidden measurement container that holds all items.',
    },
    {
      name: 'visibleCount',
      type: 'number',
      description: 'Number of items that fit in the visible container.',
    },
    {
      name: 'hasOverflow',
      type: 'boolean',
      description:
        'Whether any items are overflowing (visibleCount < itemCount).',
    },
  ],
  usage: {
    description:
      'Measures children rendered in a hidden container to determine how many fit in the available width without flickering. Uses ResizeObserver to react to container and measured-child size changes. The measurement container should hold all items plus an optional overflow indicator element (identified by a data-overflow-indicator attribute).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render all items into the measureRef container (hidden) and only the first visibleCount items into the containerRef container (visible).',
      },
      {
        guidance: true,
        description:
          'Include an overflow indicator (e.g., "+N more" button) as the last child of the measurement container with a data-overflow-indicator attribute.',
      },
      {
        guidance: false,
        description:
          'Use for vertical overflow; this hook measures horizontal width only.',
      },
    ],
  },
  relatedComponents: ['OverflowList', 'Breadcrumb'],
  relatedHooks: ['useScrollOverflow'],
  importPath: '@astryxdesign/core/hooks',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Measures children rendered in hidden container to determine how many fit in available width w/o flickering. Uses ResizeObserver to react to container and measured-child size changes. Measurement container should hold all items plus optional overflow indicator element (identified by data-overflow-indicator attribute).',
  paramDescriptions: {
    itemCount: 'total # items to measure for overflow.',
    options: 'config for overflow behavior.',
    'options.gap': 'gap between items in px. Used in width calculations.',
    'options.minVisibleItems':
      "min # items to always show, even if they don't fit.",
    'options.collapseFrom': 'which end to collapse items from.',
    'options.behavior':
      "which element to observe for overflow calculations. 'observeParent' uses container's parent element width, allowing visible container to remain content-sized.",
  },
  returnDescriptions: {
    containerRef: 'ref callback for visible container element.',
    measureRef:
      'ref callback for hidden measurement container holding all items.',
    visibleCount: '# items that fit in visible container.',
    hasOverflow: 'whether any items overflowing (visibleCount < itemCount).',
  },
  usage: {
    description:
      'Measures children rendered in hidden container to determine how many fit in available width w/o flickering. Uses ResizeObserver to react to container and measured-child size changes. Measurement container should hold all items plus optional overflow indicator element (identified by data-overflow-indicator attribute).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render all items into measureRef container (hidden) + only first visibleCount items into containerRef container (visible).',
      },
      {
        guidance: true,
        description:
          'Include overflow indicator (e.g. "+N more" button) as last child of measurement container w/ data-overflow-indicator attribute.',
      },
      {
        guidance: false,
        description:
          'Use for vertical overflow; this hook measures horizontal width only.',
      },
    ],
  },
};
