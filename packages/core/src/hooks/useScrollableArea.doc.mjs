// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollableArea.doc.mjs
 * @input Shared scroll hook's fixed and entry-time keyboard policies
 * @output Consumer guidance for named viewports and safe focus delegation
 * @position Hook documentation consumed by the CLI and docsite
 */

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useScrollableArea',
  displayName: 'useScrollableArea',
  keywords: [
    'scroll',
    'overflow',
    'logical axis',
    'keyboard',
    'overscroll',
    'sticky',
    'resize',
  ],
  params: [
    {
      name: 'options',
      type: 'UseScrollableAreaOptions',
      description:
        'Logical scroll intent, fixed or automatic keyboard owner, overscroll policy, and fitting Sticky containment.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'getViewportProps',
      type: '<E extends HTMLElement>(props?: ScrollableElementProps<E>) => ScrollableElementProps<E>',
      description:
        'Consumes caller viewport props, xstyle, and refs; composes fitting/active overflow, Sticky containment, accessibility, chaining, and owner registration.',
    },
    {
      name: 'getContentProps',
      type: '<E extends HTMLElement>(props?: ScrollableElementProps<E>) => ScrollableElementProps<E>',
      description:
        'Composes caller content-box props and refs with content observation.',
    },
    {
      name: 'state',
      type: 'ScrollableAreaState',
      description:
        'Stable inline and block effective-scroll and logical-edge state.',
    },
  ],
  usage: {
    description:
      'Adds canonical axis-aware scroll behavior to structure owned by the caller. An axis is effective only when its computed overflow is scroll-capable and geometry exceeds the shared 1px tolerance. Both viewport and content boxes are observed.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass already-resolved props and refs through both prop getters, then spread each returned object once.',
      },
      {
        guidance: true,
        description:
          'Use viewport keyboard ownership only when the viewport itself should enter the tab order; provide a concise accessible label.',
      },
      {
        guidance: true,
        description:
          'Use contentOrViewport to delegate forward Tab entry to the first sequential native link or button when it preserves native scroll keys. Inputs, composite widgets, and nested scroll areas retain the named viewport stop. Shift+Tab from the delegated first child skips the viewport; pointer and programmatic focus stay on it.',
      },
      {
        guidance: true,
        description:
          'Use content keyboard ownership when your integration already supplies keyboard access to the full scroll range. Automatic delegation checks current content at each keyboard entry without continuously tracking its focusability.',
      },
      {
        guidance: true,
        description:
          'Pass caller `xstyle` through `getViewportProps`; the getter composes it with fitting clip, active overflow, and Sticky containment.',
      },
      {
        guidance: false,
        description:
          'Attach only the viewport getter. A real observed content box is required for live overflow changes.',
      },
    ],
  },
  relatedComponents: ['ScrollableArea'],
  relatedHooks: ['useScrollOverflow'],
  importPath: '@astryxdesign/core/hooks',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Composes logical-axis scrolling into caller-owned viewport/content elements with stable effective-axis and edge state.',
  paramDescriptions: {
    options:
      'axis, fixed/automatic keyboard owner, allow/contain overscroll policy, and fitting Sticky containment.',
  },
  returnDescriptions: {
    getViewportProps:
      'safe viewport prop/ref/xstyle composition with behavior-owned overflow, accessibility, and chaining.',
    getContentProps: 'safe observed content-box prop/ref composition.',
    state: 'inline/block isScrollable, atStart, and atEnd state.',
  },
  usage: {
    description:
      'Use for existing structures that need ScrollableArea behavior without another wrapper.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Spread each prop getter result once on its owner element.',
      },
      {guidance: false, description: 'Skip the real content-box getter.'},
    ],
  },
};
