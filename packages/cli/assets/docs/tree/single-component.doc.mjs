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
          text: "`integration add component` creates the normal doc for one public component. Keep the generated identity and import, then replace its sample text and props with the component's real public contract.",
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
      ],
    },
    {
      id: 'choose-keywords',
      title: 'Choose keywords',
      content: [
        {
          type: 'prose',
          text: "Each keyword is what a person types to reach this component, and no other one, before they learn its name. Use two kinds: another name for the whole component, as another library names it, and the job in the person's own words. `{@command search}` ranks a match on a component's name or keywords above any other match. `{@command component}` never opens a component by a keyword: typing one as a name gives that component first in its answer.",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'For a made-up Zorblet, keep `glimmer flange`: another name for the same component.',
            'Keep `flarp a quandle`: the job, in the words a person types.',
            'Leave out `blip`: generic, many components fit it.',
            'Leave out `wobbly`: a feature, not the component itself.',
            "Leave out `frobnitz`: another component's name or job.",
            'Leave out `zorblet`: its own name already matches.',
            'Leave out `snorkel`: a place the component is used, not what it is.',
          ],
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Begin with the current keywords. Keep every one that passes, and change only what fails.',
            'If someone typed only this word, this component should be the first answer. If another component is the right answer, the word belongs to that component, or to none.',
            'A single word is fine when only this component answers it. For the job, prefer two words: generic single words collide.',
            'When two components want the same word, it goes to the one that says it is that thing. When neither owns the word, leave it out of both.',
            'Aim for three to eight keywords, best first. An earlier keyword wins a tie, and each keyword you add or take out can change who wins a tie for other words.',
            'Add the words people actually type. When no component fits a need, leave it unfilled.',
            'Each word of a two-word keyword also matches alone. Neither word should belong to another component on its own.',
            'A word you take out hands its answers to the components that still declare it. Check who comes first for it.',
            'Each keyword must be true of what the component does. Similar is not the same.',
          ],
        },
        {
          type: 'prose',
          text: 'Check each added and removed word:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command search "glimmer flange" --type component}\n{@command component "glimmer flange"}',
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
    code: '<AcmeCarousel slides={["/one.jpg", "/two.jpg"]} interval={5000} />',
  },
  {
    label: 'Wrap the app',
    kind: 'setup',
    code: '<AcmeCarouselProvider locale={locale}>{children}</AcmeCarouselProvider>',
  },
],`,
        },
        {
          type: 'prose',
          text: "An example's `kind` is `'demo'` by default: it runs on its own, so a docs site may show it as a live preview. Set `kind: 'setup'` for code that cannot run on its own, such as an app setup file, a server route, or a snippet that uses variables defined elsewhere; it is always shown as code only.",
        },
        {
          type: 'prose',
          text: "A demo runs on its own when its code compiles as a TSX module, ends with the JSX it renders (or declares a component, or default-exports one), and imports only the package, the packages it declares, React and Core: no relative path, and no code that runs only on a server. Every name it uses must be defined in it or imported, except the components the package documents, the components and hooks Core documents, React's exports, and browser globals such as `window`. A sample value is enough: `const viewer = {name: 'Ada'};`. `{@command doctor integration validate}` lists each demo that does not run on its own, with the fix.",
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
