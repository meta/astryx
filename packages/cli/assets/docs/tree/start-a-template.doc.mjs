// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/start-a-template`:
 * what a template is, why an integration shares one, whether it is a page or
 * a block, and how to add one.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'start-a-template',
  placement: {parent: 'namespace:templates', slot: 'build', order: 10},
  title: 'Start a template',
  category: 'guide',
  keywords: [
    'what is a template',
    'add a template',
    'page template',
    'block template',
  ],
  description:
    'Help others build apps faster and share a consistent visual language by turning your UI idea into a full page or page section.',
  sections: [
    {
      id: 'what-a-template-is',
      title: 'What a template is',
      content: [
        {
          type: 'prose',
          text: 'Unlike a component, a template becomes app code: an app copies it into its own code and adapts it to its product.',
        },
        {
          type: 'prose',
          text: "A component stays a package dependency and updates with the package. A copied template does not, so updating the package never rewrites the app's copy.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: `# How an app finds a template and copies it
{@command template --list}
{@command template acme-dashboard src/app/dashboard}`,
        },
      ],
    },
    {
      id: 'why-share-one',
      title: 'Why share one',
      content: [
        {
          type: 'prose',
          text: 'Templates help other people build apps faster while keeping a consistent visual language across products. Share one when people need more than one component to get started: a template brings the right components, layout, content structure, and interaction wiring already assembled.',
        },
        {
          type: 'prose',
          text: 'Do not turn a product-specific page into a rigid component only to share its structure. Share it as a template and let each app adapt its copy.',
        },
      ],
    },
    {
      id: 'choose-page-or-block',
      title: 'Choose a page or block',
      content: [
        {
          type: 'table',
          headers: ['Kind', 'Use it for'],
          rows: [
            [
              'Page',
              'A complete screen, such as a dashboard, settings page, or checkout flow.',
            ],
            [
              'Block',
              'A smaller section that fits inside a page, such as a hero, form, or data panel. A block can also be the example or showcase for a component.',
            ],
          ],
        },
      ],
    },
    {
      id: 'pick-a-template-id',
      title: 'Pick a template id',
      content: [
        {
          type: 'prose',
          text: 'Choose a stable lowercase kebab-case id, such as `acme-dashboard`. The id becomes the source and doc file name, the package export, and the value apps pass to `{@command template}`. To change a label, edit the doc ({@link generic:template-doc-overview}); never rename the id.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Start with your product or package name, then name the reusable pattern, so the id stays distinct from Core and other integrations.',
            'Do not end the id with `-page`, `-app`, `-view`, or `-screen`.',
            'Do not reuse a Core id by accident: the bare id becomes ambiguous in every app that installs your package. To take over a Core template on purpose, declare `replaces` ({@link generic:replace-a-core-template}).',
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# See the Core ids\nastryx --json template --list --package @astryxdesign/core',
        },
      ],
    },
    {
      id: 'run-the-add-command',
      title: 'Run the add command',
      content: [
        {
          type: 'prose',
          text: 'Pages are the default. Pass `--type block` to add a block.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `{@command integration add template acme-dashboard}
{@command integration add template acme-stat-card --type block}`,
        },
        {
          type: 'code',
          lang: 'text',
          code: `template contribution added

[ok] acme-dashboard

Declare template root ./templates in astryx.integration.mjs.

- templates/acme-dashboard.doc.mjs
- templates/acme-dashboard.tsx
- package.json
- astryx.integration.mjs`,
        },
        {
          type: 'prose',
          text: 'The command writes `templates/<id>.tsx` for the UI and `templates/<id>.doc.mjs` for its metadata, and declares the templates directory in `astryx.integration.mjs`. When `package.json` has an `exports` map, it also adds the `./templates/<id>` export ({@link generic:export-template-assets}).',
        },
        {
          type: 'prose',
          text: 'It never overwrites an existing source or doc file. Add `--dry-run` to see every planned write first.',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: when users install your package for their computer, beside the global CLI, your templates show up in folders outside any project; inside a project, only if the project installs your package. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
