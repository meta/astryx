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
          text: "Each keyword is what a builder types when they need it and not another, before they know its name. Use two kinds: another name for the whole component, as another library calls it (`accordion` for a collapsible section), and the job in the builder's words (`expand and collapse`, `are you sure`). `{@command search}` ranks a match on a component's name or keywords above one in its description. `{@command component}` never opens a component by a keyword: typing one as a name lists that component first among the suggestions.",
        },
        {
          type: 'table',
          headers: [
            'For a made-up Ribbon, a dismissible strip across the top of the page',
            'Why',
          ],
          rows: [
            [
              'Keep `announcement bar`, `site banner`',
              'Other names for the same component',
            ],
            [
              'Keep `maintenance notice`, `page-wide message`',
              'The job, in the words a builder types',
            ],
            [
              'Drop `message`, `status`, `info`',
              'Generic: many components fit, so the word pulls Ribbon into unrelated searches',
            ],
            [
              'Drop `compact`, `sticky`, `success`',
              'A feature, prop, or variant value, not the component',
            ],
            [
              'Drop `toast`, `dialog`',
              "Another component's name or job: a search for it should find that component",
            ],
            ['Drop `ribbon`', 'Its own name already matches'],
            [
              'Drop `header`, `metric`',
              'A place the component is used, not what it is',
            ],
          ],
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Start from the current list. Keep every entry that passes, and change only what fails.',
            'First-answer test: if someone typed only this word, this component should be the first answer. If another component is the right answer, the word belongs to that component, or to none.',
            'A single word is fine when only this component answers it (`snackbar`). For the job, prefer a two-word phrase: builders type phrases, and generic single words collide.',
            'When two components want the same word, it goes to the one whose doc says it is that thing. A doc\'s "use X instead" line settles it. When neither owns the word, drop it from both.',
            'A feature phrase is still a feature (`copy button`, `line numbers`). Keep it only when that feature is the reason to pick this component over every other one.',
            'Aim for three to eight keywords, best first. An earlier keyword wins a tie, and every keyword you add or drop can reorder ties for other words.',
            'Add the words builders actually type, as well as removing wrong ones. When no component fits a need, leave it unfilled; do not attach it to the nearest component.',
            'Every word of a phrase also matches alone in search. A phrase must not hold a word that, on its own, belongs to another component.',
            'A dropped word moves its search results and suggestions to the components that still declare it. Check who comes first for every word you drop.',
            'Every keyword must be true according to the doc. "Similar" is not "the same": a meter is not a progress bar.',
          ],
        },
        {
          type: 'prose',
          text: 'Check each added and dropped word. Search should give the component first for a keyword, or in the top three for a phrase that fits two components, and the main words of other components should still find them first. A keyword typed as a component name should list the component first:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command search "announcement bar" --type component}\n{@command component "site banner"}',
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
