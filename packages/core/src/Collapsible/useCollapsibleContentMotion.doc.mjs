// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCollapsibleContentMotion',
  displayName: 'useCollapsibleContentMotion',
  group: 'Collapsible',
  keywords: ['collapsible', 'disclosure', 'expand', 'animation', 'exit', 'presence', 'height', 'accordion', 'reduce motion'],
  params: [
    {
      name: 'collapsible',
      type: "Pick<UseCollapsibleReturn, 'isOpen' | 'contentProps'>",
      description: 'The useCollapsible result whose content animates. Pass the whole result.',
      required: true,
    },
    {
      name: 'heightProperty',
      type: '`--${string}`',
      description: "A CSS custom property that gets the content's natural height, as a px value that height can take. The hook measures it once at each open and at each close that keeps the children, with the content's animation suppressed for the read, so keyframes can grow from 0 to var(<property>) and shrink back. Rows that change in the same commit are measured in one pass.",
    },
  ],
  returns: [
    {
      name: 'isPresent',
      type: 'boolean',
      description: "Whether to render the content's children: while open, and while the close animation plays. A closed content element holds nothing.",
    },
    {
      name: 'isEntering',
      type: 'boolean',
      description: "Whether the content's open animation is playing. Apply the open keyframes only while it is true, so content that mounts open does not replay them.",
    },
    {
      name: 'isExiting',
      type: 'boolean',
      description: "Whether the content's close animation is playing. Apply the close keyframes only while it is true.",
    },
    {
      name: 'contentProps',
      type: '{id: string; hidden: boolean; inert: boolean; ref: RefCallback<HTMLElement>}',
      description: 'Props for the content element, in place of the useCollapsible contentProps. The element is hidden once the content is closed and its close animation is over, and inert while the close animation plays.',
    },
  ],
  usage: {
    description: "Content motion for a disclosure built with useCollapsible. Its open and close phases last while the content element's own CSS animation plays, the children stay through the close, and the content's natural height reaches the keyframes through a custom property. It is its own import: pages that do not use it carry none of its code. A phase ends at once when no animation runs. Under Reduce Motion it ends at once with a fine pointer, and with a coarse pointer it waits for the animation, which must then be an opacity-only fade of 200 ms or less.",
    bestPractices: [
      {guidance: true, description: 'Spread its contentProps on the content element and render the children only while isPresent.'},
      {guidance: true, description: 'Put the animation on the content element itself and key the open and close keyframes on isEntering and isExiting.'},
      {guidance: true, description: 'Under Reduce Motion, cross-fade with a coarse pointer (opacity only, 200 ms or less) and remove the animation for any other pointer: @media (prefers-reduced-motion: reduce) and (pointer: coarse).'},
      {guidance: true, description: 'Clip the content (overflow: hidden) only while a phase plays, so focus rings and shadows inside it are not cut at rest.'},
      {guidance: false, description: 'Spread the useCollapsible contentProps as well; the contentProps of this hook replace them.'},
      {guidance: false, description: "Animate a descendant instead of the content element; the hook waits only for the content element's own animations."},
    ],
  },
  relatedComponents: ['Collapsible'],
  relatedHooks: ['useCollapsible'],
  importPath: '@astryxdesign/core/Collapsible',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description: "Content motion for a useCollapsible disclosure: phases last while the content element's own CSS animation plays, children stay through the close, natural height -> custom property. Own import; unused pages carry none. No animation: ends at once. Reduce Motion: fine pointer at once; coarse pointer waits for an opacity-only fade <= 200ms.",
  paramDescriptions: {
    collapsible: 'the useCollapsible result (whole).',
    heightProperty: 'custom property that gets the content natural height (px) at each open + each close that keeps the children, read w/ animation suppressed; changed rows measured in one pass.',
  },
  returnDescriptions: {
    isPresent: 'render children only while true: open, or close animation playing.',
    isEntering: 'open animation playing; key open keyframes on it.',
    isExiting: 'close animation playing; key close keyframes on it.',
    contentProps: 'spread on the content element in place of useCollapsible contentProps: id, hidden, inert (during close), ref.',
  },
  usage: {
    description: "Content motion for a useCollapsible disclosure: phases while the content element's own CSS animation plays; children kept through the close; measured height for keyframes. Own import.",
    bestPractices: [
      {guidance: true, description: 'contentProps on the content element; children only while isPresent.'},
      {guidance: true, description: 'Animation on the content element itself; keyframes keyed on isEntering / isExiting.'},
      {guidance: true, description: 'Reduce Motion: coarse pointer = opacity-only fade <= 200ms; other pointers = no animation.'},
      {guidance: true, description: 'Clip (overflow: hidden) only during a phase.'},
      {guidance: false, description: 'Also spread the useCollapsible contentProps; these replace them.'},
      {guidance: false, description: "Animate a descendant; only the content element's own animations count."},
    ],
  },
};
