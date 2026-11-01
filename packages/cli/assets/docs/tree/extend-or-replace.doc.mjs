// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/extend-or-replace`:
 * take over an existing topic or guide with `replaces`, merge sections into
 * one with `extends` (placing each with `before` or `after`), and check
 * overlaps with Core topics.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'extend-or-replace',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 40},
  title: 'Extend or replace a topic',
  category: 'guide',
  description: 'Take over a topic or guide, or merge sections into it.',
  sections: [
    {
      id: 'replace-a-topic',
      title: 'Replace a topic',
      content: [
        {
          type: 'prose',
          text: "Set `replaces` to take over an existing topic, such as Core's `getting-started`. Readers who open the old name get your topic.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add doc acme-getting-started --replaces getting-started}\n# The old name now opens your topic\n{@command docs getting-started}',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'docs/acme-getting-started.doc.mjs',
          code: "export default {\n  type: 'generic',\n  name: 'acme-getting-started',\n  replaces: 'getting-started',\n  title: 'Acme getting started',\n  description: 'Install Acme widgets and render your first carousel.',\n  sections: [/* ... */],\n};",
        },
        {
          type: 'prose',
          text: 'The docs list shows your topic in place of the old one. Because your topic has its own `name`, the old name keeps resolving to it, so links and agents that learned the old name still land on your topic.',
        },
      ],
    },
    {
      id: 'extend-a-topic',
      title: 'Extend a topic',
      content: [
        {
          type: 'prose',
          text: 'Set `extends` to merge sections into an existing topic instead of owning it. A section replaces the base section it matches, and a section that matches none is added at the end.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add doc acme-theming --extends theme}\n{@command docs theme --index}',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'docs/acme-theming.doc.mjs',
          code: "export default {\n  type: 'generic',\n  name: 'acme-theming',\n  extends: 'theme',\n  title: 'Acme theming',\n  description: 'Theme an app that uses Acme widgets.',\n  sections: [\n    {id: 'quick-start', title: 'Quick Start', content: [/* replaces the base section */]},\n    {id: 'use-the-ocean-theme', title: 'Use the ocean theme', content: [/* added at the end */]},\n  ],\n};",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Read the base topic's keys with `--index`, and give a section that replaces one that key as its `id`. A section that replaces one keeps its place. A section without an `id` matches only a base section with exactly its title, or one whose `id` is the key its title makes, so `Integration Themes` is added beside a base `Integration themes` that has no `id`.",
            "Set `before` or `after` to a base section's key to add a new section there instead of at the end. A key that names no section adds it at the end, and `astryx doctor integration validate` lists a note. An older CLI rejects these fields, so declare an `@astryxdesign/cli` peer range that starts at the release that reads them; `astryx integration verify` warns without it.",
            "The topic keeps the base's title and description, and readers open it by the base's name.",
            'Replace the `Overview` placeholder that `integration add` writes, or it is added to the base topic.',
            "Extend a topic to correct or add to it. A copy made with `replaces` stops getting the owner's fixes.",
          ],
        },
      ],
    },
    {
      id: 'replace-or-extend-a-cli-guide',
      title: 'Replace or extend a CLI guide',
      content: [
        {
          type: 'prose',
          text: "A guide in the CLI's docs tree has a route rather than a topic name. Set `replaces` or `extends` to that route to change the guide for every app that installs your package: say what differs for your users on the page agents already read.",
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'docs/acme-quick-start.doc.mjs',
          code: "export default {\n  type: 'generic',\n  name: 'acme-quick-start',\n  extends: 'authoring/quick-start',\n  title: 'Acme quick start',\n  description: 'What differs when you build integrations at Acme.',\n  sections: [\n    {id: 'use-the-acme-registry', title: 'Use the Acme registry', before: 'fill-in-package-json', content: [/* ... */]},\n  ],\n};",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Your doc stays a flat topic: do not give it a `placement`. Readers open the guide by its route, never by your `name`.',
            'With `replaces`, readers of the route get your doc, under your package. With `extends`, each section you add or replace names your package.',
            'A name that holds no topic or guide, such as a namespace, changes nothing; `astryx doctor integration validate` lists it as a note, with the guides below a namespace.',
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# Every guide route, by namespace\nastryx docs authoring --depth all\nastryx docs cli --depth all\n# The keys to place sections by\nastryx docs authoring/quick-start --index',
        },
      ],
    },
    {
      id: 'check-overlaps-with-core-topics',
      title: 'Check overlaps with Core topics',
      content: [
        {
          type: 'prose',
          text: "A topic sets `replaces` or `extends`, never both, and a placed guide sets neither. A topic that uses a Core topic's name with neither is an accidental conflict: apps keep reading the Core topic.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration docs}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'severity:     [info]\ntopic:        acme-getting-started\nrelationship: replaces\ncoreTopic:    getting-started\nmessage:      Intentional override: "acme-getting-started" replaces the Core topic "getting-started".\n\nseverity:     [fail]\ntopic:        color\nrelationship: accidental\ncoreTopic:    color\nmessage:      Accidental conflict: "color" is already a Core topic. Rename it, declare replaces: \'color\' to take it over, or declare extends: \'color\' to merge sections.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'An intentional overlap prints as `[info]`. An accidental one fails with exit code 1.',
            'A topic that sets both fails as `invalid_doc`, and so does a placed guide that sets either one.',
          ],
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: a doc that extends or replaces a topic from a package installed for the computer applies in folders outside any project; inside a project, only those from packages the project installs apply. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
