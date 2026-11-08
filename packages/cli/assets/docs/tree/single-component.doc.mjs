// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/describe-the-component/single-component`:
 * write and maintain the default ComponentDoc for one public component.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'single-component',
  placement: {
    parent: 'namespace:describe-the-component',
    slot: 'guides',
    order: 20,
  },
  title: 'Single component',
  category: 'guide',
  description:
    'Write the default component doc: explain when to use the component, document every public prop, and add focused examples.',
  sections: [
    {
      id: 'start-from-the-generated-doc',
      title: 'Start from the generated doc',
      content: [
        {
          type: 'prose',
          text: '`integration add component` creates the normal doc for one public component. Keep the generated identity and import, then replace its sample text and props with the component\'s real public contract.',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'components/AcmeCarousel.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeCarousel',
  displayName: 'Acme Carousel',
  import: '@acme/astryx-widgets/components/AcmeCarousel',
  usage: {
    description:
      'Cycles through slides one at a time. Use it for a small set of related cards.',
  },
  props: [
    {
      name: 'slides',
      type: 'ReactNode[]',
      description: 'The slides to show, in order.',
      required: true,
    },
  ],
};`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Keep `props` on the top-level doc. Private implementation helpers do not need entries.',
            'Name the doc after the source file beside it, such as `AcmeCarousel.doc.mjs` beside `AcmeCarousel.tsx`, and change both in the same pull request.',
            'If the module later exposes several related public exports, adapt this doc with {@link generic:component-family}.',
          ],
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:component-doc}.',
        },
      ],
    },
    {
      id: 'explain-when-to-use-it',
      title: 'Explain when to use it',
      content: [
        {
          type: 'prose',
          text: 'Write `usage.description` so a person or agent can decide whether this is the right component without opening its source. Say what it does, when to use it, and the most important boundary with a nearby alternative.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: `usage: {
  description:
    'Cycles through slides one at a time. Use it for a small set of related cards. Use a static list when every item should stay visible.',
  bestPractices: [
    {guidance: true, description: 'Keep the slide order stable while someone interacts with the carousel.'},
    {guidance: false, description: 'Hide information that must remain visible for comparison.'},
  ],
},`,
        },
        {
          type: 'prose',
          text: "Set `keywords` to the words people search for: synonyms and the task the component does, such as `keywords: ['slider', 'slideshow', 'rotating cards']`. `{@command search}` ranks a match on a component's name or keywords above one in its description, so without keywords a search for the component's task can list Core components first. Check with the words a person would type:",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command search "rotating cards" --type component}',
        },
      ],
    },
    {
      id: 'document-every-public-prop',
      title: 'Document every public prop',
      content: [
        {
          type: 'prose',
          text: 'Copy the public prop names and types from the source. Explain the behavior a caller controls, not only the TypeScript type.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: `props: [
  {
    name: 'slides',
    type: 'ReactNode[]',
    description: 'The slides to show, in order.',
    required: true,
  },
  {
    name: 'interval',
    type: 'number',
    description: 'Milliseconds between automatic slide changes.',
    default: '5000',
  },
],`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Set `required: true` only when every caller must pass the prop.',
            'Write `default` exactly as the value should appear in documentation.',
            'Skip styling escape hatches such as `xstyle`, `className`, and `style`.',
            '`{@command doctor integration components}` lists a documented prop the code lacks, a public prop the doc misses, and a wrong `required`. See {@link generic:check-the-props}.',
          ],
        },
      ],
    },
    {
      id: 'add-focused-examples',
      title: 'Add focused examples',
      content: [
        {
          type: 'prose',
          text: 'Add short examples for important usage that the prop table does not make obvious. Each example should teach one complete pattern and use only public imports.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: `examples: [
  {
    label: 'Automatic rotation',
    code: '<AcmeCarousel slides={slides} interval={5000} />',
  },
],`,
        },
      ],
    },
    {
      id: 'read-the-result',
      title: 'Read the result',
      content: [
        {
          type: 'prose',
          text: 'Read the component after every source or doc change. Confirm that its purpose, import, props, defaults, and examples match the source, then verify the packed package.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command component AcmeCarousel}\n{@command doctor integration components}\n{@command integration verify}',
        },
      ],
    },
  ],
};
