// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/links`: link one doc
 * to another by identity, link the CLI's docs, and fix a link that names no
 * doc.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'links',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 30},
  title: 'Links',
  category: 'guide',
  description:
    'Link one doc to another so the link keeps working when the doc moves.',
  sections: [
    {
      id: 'link-another-doc',
      title: 'Link another doc',
      content: [
        {
          type: 'prose',
          text: 'Write `{@link [provider:]kind:name}` in prose, list items, and table cells to link another doc. The CLI prints the command that opens it, so the link keeps working when the doc moves.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: "{type: 'prose', text: 'Before you ship, read {@link generic:deploying}.'},\n{type: 'list', style: 'unordered', items: ['All guides: {@link namespace:acme}.']},\n{type: 'table', headers: ['Task', 'Guide'], rows: [['Ship', '{@link generic:deploying}']]},",
        },
        {
          type: 'prose',
          text: 'Each link reads as a command. This link, {@link generic:extend-or-replace}, opens the next guide.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'The kind is `generic` for a topic or guide, `namespace` for a docs section, `command` or `function` for a CLI command or API function, `schema` or `enum` for a schema or a fixed set of values, `component` for a component, and `page` or `block` for a template.',
            'Name a component by its export name and a template by its id. Its link reads as the command that opens it, such as `{@command component AcmeCarousel --package @acme/widgets}`.',
            'Inside backticks or a code block, link syntax prints as written.',
          ],
        },
      ],
    },
    {
      id: 'link-another-packages-docs',
      title: "Link another package's docs",
      content: [
        {
          type: 'prose',
          text: "A link without a provider resolves against your own package. To link the CLI's docs, or another package's, start the target with that package's name, such as `@astryxdesign/cli:`.",
        },
        {
          type: 'code',
          lang: 'javascript',
          code: "// Resolves: the CLI's doctor command\n{type: 'prose', text: 'Check the app with {@link @astryxdesign/cli:command:doctor}.'},\n// Does not resolve: looks for a doctor command in your package\n{type: 'prose', text: 'Check the app with {@link command:doctor}.'},",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Name a CLI command the way you type it, spaces included, such as `@astryxdesign/cli:command:doctor integration docs`.',
            "In a topic that `extends` another package's topic, your sections still resolve against your package, so a link to the base topic's docs needs its provider.",
          ],
        },
      ],
    },
    {
      id: 'fix-a-link-that-names-no-doc',
      title: 'Fix a link that names no doc',
      content: [
        {
          type: 'prose',
          text: 'A link that names no doc prints as written, and `doctor integration docs` warns. The warning names a search that finds the right target.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration docs}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'severity: [warn]\ncode:     invalid_doc_graph\nmessage:  acme/deploying § check-before-you-ship: "command:doctor" names no doc. Find it with `astryx search doctor --type doc`, then name it as `[<provider>:]<kind>:<name>`.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'The warning keeps exit code 0, so read the report before you ship; see {@link generic:check-your-docs}.',
            'Published 0.6.4 and later read links. An older CLI, such as published 0.6.3, prints each one as written; see {@link generic:versioning}.',
          ],
        },
      ],
    },
  ],
};
