// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/sections-and-placement`:
 * give an integration package its own section in the docs tree, place guides
 * in it, and fix a placement that fails.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'sections-and-placement',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 20},
  title: 'Sections and placement',
  category: 'guide',
  description: 'Give your package its own docs section and place guides in it.',
  sections: [
    {
      id: 'add-a-docs-section',
      title: 'Add a docs section',
      content: [
        {
          type: 'prose',
          text: "Give your package its own section in the docs tree with `integration add doc <name> --parent <section>`. The first run also writes the section's namespace doc.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add doc deploying --parent acme}\n# Open your section\n{@command docs acme}',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'docs/acme.doc.mjs',
          code: "/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */\nexport default {\n  type: 'namespace',\n  name: 'acme',\n  title: 'Acme',\n  summary: 'Guides for Acme.',\n  slots: {\n    guides: {title: 'Guides', accepts: {kinds: ['generic']}},\n  },\n};",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Edit its `title` and `summary`: readers see them in the docs list and at the top of your section.',
            "The guide, `docs/deploying.doc.mjs`, gets `placement: {parent: 'namespace:acme', slot: 'guides'}`. Later runs with `--parent acme` reuse the namespace doc.",
            '`package.json` gets the optional peer `"@astryxdesign/cli": ">=0.6.4"`, because an older CLI does not read sections; see {@link generic:versioning}.',
          ],
        },
      ],
    },
    {
      id: 'place-a-doc',
      title: 'Place a doc',
      content: [
        {
          type: 'prose',
          text: 'A guide names its one home with `placement`: a namespace of your package, a slot in it, and an `order`. Its route is the section name, then the guide name.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: "placement: {parent: 'namespace:acme', slot: 'guides', order: 10}, // route: acme/deploying",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Every field is in {@link schema:authored-doc-graph-fields}.',
            'A placed guide opens only by its route, `acme/deploying`. Its bare name no longer opens it.',
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command docs acme/deploying}',
        },
      ],
    },
    {
      id: 'fix-a-failed-placement',
      title: 'Fix a failed placement',
      content: [
        {
          type: 'prose',
          text: 'A failed `placement` hides the doc: it gets no route and does not show in the docs list. `doctor integration docs` fails with `invalid_doc_graph` and names what to fix.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration docs}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'severity: [fail]\ncode:     invalid_doc_graph\nmessage:  @acme/astryx-widgets/deploying.doc.mjs: placement.parent "namespace:cli" names no namespace; @acme/astryx-widgets declares "acme".',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'A `parent` your package does not ship, such as `namespace:cli`, "names no namespace".',
            'A `slot` the namespace does not declare "is not a slot of namespace"; the message lists the declared slots.',
            'The check exits 1; see {@link generic:check-your-docs}.',
          ],
        },
      ],
    },
  ],
};
