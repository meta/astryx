// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useAnimatedLayout',
  displayName: 'useAnimatedLayout',
  keywords: [
    'animated layout',
    'layout shift',
    'glide',
    'expand',
    'collapse',
    'disclosure',
    'reflow',
    'jump',
    'motion',
    'transition',
  ],
  params: [
    {
      name: 'options.containerRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'The area the glide stays inside: the ref you already give your scroll container or panel. A ScrollableArea ref reaches its native scroll viewport, so pass that.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'animatedLayout',
      type: 'AnimatedLayout',
      description:
        'An opaque handle with no public members. Pass it to the animatedLayout prop of a component whose size changes, such as TreeList or Collapsible.',
    },
  ],
  usage: {
    description:
      'Returns a handle to pass to a component whose size changes, such as TreeList or Collapsible. When that component changes size, it and the content after it inside `containerRef` animate together on one shared motion role. Fixed and stuck sticky elements stay put, the glide never scrolls the area, and Reduce Motion is respected. It applies under every pointer, a mouse included. Without the handle a component keeps its jump: content after it takes its place at once. Content after the change may mix Astryx components and your own elements; none of it opts in.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Create one handle per scroll container or panel and pass the same handle to every component in it whose size changes.',
      },
      {
        guidance: true,
        description:
          'Pass the ref you already give ScrollableArea as containerRef; ScrollableArea does not register itself.',
      },
      {
        guidance: false,
        description:
          'Wrap the content after a disclosure in an extra element to make it move; everything after the change inside the container moves on its own.',
      },
      {
        guidance: false,
        description:
          'Animate height yourself alongside it; the glide moves content with a compositor translate and never animates height.',
      },
    ],
  },
  relatedComponents: ['TreeList', 'Collapsible', 'ScrollableArea'],
  importPath: '@astryxdesign/core/hooks',
  category: 'animation',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Handle for a component whose size changes (TreeList, Collapsible): it + content after it inside containerRef glide on one shared motion role. Fixed/stuck sticky stay; never scrolls the area; Reduce Motion respected; every pointer. No handle = snap.',
  paramDescriptions: {
    'options.containerRef':
      'area the glide stays inside; pass the ref you give your scroll container (a ScrollableArea ref reaches its viewport).',
  },
  returnDescriptions: {
    animatedLayout:
      "opaque handle, no members; pass to a component's animatedLayout prop.",
  },
  usage: {
    description:
      'One handle per scroll container/panel, passed to every component in it whose size changes. Content after a change (Astryx or app elements) glides; no opt-in per element. Omit the handle to keep the jump.',
    bestPractices: [
      {
        guidance: true,
        description:
          'One handle per area, shared by its size-changing components.',
      },
      {
        guidance: true,
        description:
          'Pass the ScrollableArea ref as containerRef; it does not register itself.',
      },
      {
        guidance: false,
        description:
          'Wrap following content in an extra element to make it move.',
      },
      {guidance: false, description: 'Animate height yourself alongside it.'},
    ],
  },
};
