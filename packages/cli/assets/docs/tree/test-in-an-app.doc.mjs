// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/ship/test-in-an-app`: install the packed
 * package in an app and run the commands its users run.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'test-in-an-app',
  placement: {parent: 'namespace:ship', slot: 'guides', order: 10},
  title: 'Test an integration in an app',
  category: 'guide',
  keywords: ['test an integration locally', 'try an integration in an app'],
  description:
    'Install your packed package in an app and run the commands its users will run.',
  sections: [
    {
      id: 'install-the-packed-package',
      title: 'Install the packed package in an app',
      content: [
        {
          type: 'prose',
          text: 'Pack the package beside its folder, so the next pack does not ship it, then install it in an app together with Core and the CLI. The app loads your package because it is a dependency.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# In the package\n{@pm-only npm "the tarball the registry receives" pack --pack-destination ..}\n\n# In an app folder beside it\n{@pm install @astryxdesign/core @astryxdesign/cli ../acme-astryx-widgets-1.0.0.tgz}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Install the CLI in the app too: `astryx` runs the CLI from the app's `node_modules`.",
            'The app holds a copy, not a link. After each change, pack again and run the same `{@pm install}`.',
            'Reading your work inside the package shows your source. The app shows what npm would publish.',
          ],
        },
      ],
    },
    {
      id: 'check-what-the-app-sees',
      title: 'Check what the app sees',
      content: [
        {
          type: 'prose',
          text: 'From the app folder, run the commands your users run. Each should show your contribution under your package name.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command component AcmeCarousel}\n{@command template --list --package @acme/astryx-widgets}\n{@command theme list --package @acme/astryx-widgets}\n{@command docs acme}\n{@command search deploying --type doc}',
        },
        {
          type: 'table',
          headers: ['Command', 'Look for'],
          rows: [
            [
              '`component AcmeCarousel`',
              "`import {AcmeCarousel} from '@acme/astryx-widgets/components/AcmeCarousel';`",
            ],
            [
              '`template --list --package`',
              'An `acme-dashboard` entry whose `package` is `@acme/astryx-widgets`',
            ],
            [
              '`theme list --package`',
              'An `ocean` entry whose `package` is `@acme/astryx-widgets`',
            ],
            ['`docs acme`', 'Your section, with guides such as `deploying`'],
            [
              '`search deploying --type doc`',
              '`acme/deploying` as the first result',
            ],
          ],
        },
        {
          type: 'prose',
          text: "`--package` narrows `template --list` and `theme list` to one package. `component --list` ignores it and lists Core too, so look a component up by name. Last, import `AcmeCarousel` in the app's code and build the app, as your users will.",
        },
      ],
    },
    {
      id: 'run-doctor-in-the-app',
      title: 'Run doctor in the app',
      content: [
        {
          type: 'prose',
          text: '`{@command doctor}` checks the whole app, including every package it loaded. `doctor integration validate` checks your package as the app installed it.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor}\n{@command doctor integration validate @acme/astryx-widgets}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'id:      implicit-integrations\nstatus:  [info]\nlabel:   Implicitly linked integrations\nmessage: 1 integration loaded from installed dependencies with no astryx.config entry: @acme/astryx-widgets@1.0.0 from dependencies, contributing components, templates, themes, docs, codemods.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'The `implicit-integrations` row names each package the app loads with no config. `[info]` is expected.',
            'The `docs-progressive-disclosure` row warns when one of your doc sections is over 32 KB. The `doctor integration` checks do not measure size.',
            '`doctor integration validate @acme/astryx-widgets` prints `[ok] No integration issues found.` when the installed copy is sound.',
          ],
        },
      ],
    },
  ],
};
