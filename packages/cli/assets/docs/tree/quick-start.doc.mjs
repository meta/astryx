// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'quick-start',
  placement: {
    parent: 'namespace:authoring',
    slot: 'guides',
    order: 10,
  },
  title: 'Quick Start',
  category: 'guide',
  keywords: [
    'make a package',
    'make an integration',
    'first integration',
    'integration tutorial',
    'package.json',
    'exports map',
    'astryx.integration.mjs',
  ],
  description:
    'Create a new integration package or add Astryx to one you already publish.',
  sections: [
    {
      id: 'quick-start',
      title: 'Quick start',
      content: [
        {
          type: 'heading',
          level: 3,
          text: 'Make the package',
        },
        {
          type: 'prose',
          text: 'An integration starts as a normal npm package. Make a folder for it, create a package.json inside that folder, give the package a name, make it an ES module, then install the Astryx CLI, Core, and TypeScript for development.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'mkdir acme-widgets && cd acme-widgets\n{@pm-only npm "writes package.json" init -y}\n{@pm-only npm "edits package.json" pkg set name=@acme/astryx-widgets type=module}\n{@pm-only npm "edits package.json" pkg set \'exports={}\' --json}\n{@pm install @astryxdesign/cli @astryxdesign/core typescript@6 --dev}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Set `"type": "module"`: the `.js` files the CLI generates, such as a built theme, are ES modules, and Node fails to load them in a package marked `"type": "commonjs"`, which `{@pm-only npm "writes package.json" init -y}` writes on npm 11.',
            'Start with `"exports": {}`: each component and template you add then writes the public import that `integration verify` resolves.',
            'Run the CLI as `astryx`, which runs the `@astryxdesign/cli` you installed as a devDependency.',
            'Component commands read Core, so they need `@astryxdesign/core` installed.',
            "The checks compare your docs with your code through TypeScript's JavaScript compiler API, which `typescript` 5.0 through 6 has. TypeScript 7 does not ship that API: on TypeScript 7, also install `@typescript/typescript6`, its TypeScript 6 API package, and the checks use it.",
          ],
        },
        {
          type: 'heading',
          level: 3,
          text: 'Add your first integration item',
        },
        {
          type: 'prose',
          text: 'An integration can ship several kinds of items. Start with a component named `AcmeCarousel`.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add component AcmeCarousel}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'component contribution added\n\n[ok] AcmeCarousel\n\nDeclare component root ./components in astryx.integration.mjs.\n\n- components/AcmeCarousel.doc.mjs\n- components/AcmeCarousel.tsx\n- package.json\n- astryx.integration.mjs',
        },
        {
          type: 'prose',
          text: '`integration add` creates the component source, its `.doc.mjs`, the package export, and `astryx.integration.mjs`. Update the generated doc so the CLI understands the component, then write the component itself.',
        },
        {
          type: 'prose',
          text: 'Read it back the way an app will.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command component AcmeCarousel}',
        },
        {
          type: 'prose',
          text: 'You now have an integration package with one exported component.',
        },
        {
          type: 'heading',
          level: 3,
          text: 'Check it in every build (required)',
        },
        {
          type: 'prose',
          text: "Run `integration check --strict` in every build ({@link generic:checks}): a doc, prop, template, or link that drifts from the code then fails your build, not your users' apps. Set it up now, as the `typecheck` script, and run it.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm-only npm "edits package.json" pkg set scripts.typecheck="astryx integration check --strict"}\n{@pm run typecheck}',
        },
        {
          type: 'code',
          lang: 'text',
          code: '[ok] 0 errors, 0 warnings, 0 skipped. Every check passed.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Run `typecheck` in CI and before every publish. When you add a `tsconfig.json`, put `tsc --noEmit && ` in front of the check so the same script checks your types.',
            'What each check covers, and what `--strict` adds: {@link generic:checks}.',
          ],
        },
        {
          type: 'heading',
          level: 3,
          text: 'Verify and pack the package',
        },
        {
          type: 'prose',
          text: 'Run `integration verify` to check that an app would see the component, then make the `.tgz` file you install next. `--pack-destination ..` writes it beside the package folder, so the next pack does not ship it.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration verify}\n{@pm-only npm "builds the publish tarball" pack --pack-destination ..}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'Integration package ready\n\n[ok] @acme/astryx-widgets@1.0.0\n\n4 packed files; 3/3 required files present.',
        },
        {
          type: 'prose',
          text: '`integration verify` installs the packed package in a temporary app and confirms the component resolves through its public import there ({@link generic:checks}). It publishes nothing and leaves no `.tgz` file, so `{@pm-only npm "builds the publish tarball" pack}` writes `../acme-astryx-widgets-1.0.0.tgz` for the next step.',
        },
        {
          type: 'heading',
          level: 3,
          text: 'Use it in an app',
        },
        {
          type: 'prose',
          text: 'Install Core, the CLI, and your `.tgz` file in a new app. The app loads your package because it is a dependency, with no config.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'cd ..\nmkdir my-app && cd my-app\n{@pm-only npm "writes package.json" init -y}\n{@pm install @astryxdesign/core @astryxdesign/cli ../acme-astryx-widgets-1.0.0.tgz}\n{@command component AcmeCarousel}',
        },
        {
          type: 'code',
          lang: 'text',
          code: "**Import:** `import {AcmeCarousel} from '@acme/astryx-widgets/components/AcmeCarousel';`",
        },
        {
          type: 'prose',
          text: 'The next sections explain each package field and the integration file. To build the real component, continue with {@link namespace:components}.',
        },
      ],
    },
    {
      id: 'fill-in-package-json',
      title: 'Fill in package.json',
      content: [
        {
          type: 'prose',
          text: 'An integration is an ordinary npm package. These six fields control how it is named, developed, checked, and published.',
        },
        {
          type: 'prose',
          text: '`peerDependencies` are packages the app supplies. `devDependencies` are packages you use while building the integration.',
        },
        {
          type: 'table',
          headers: ['Field', 'Set it to', 'Why'],
          rows: [
            [
              '`name`',
              'Your package name, such as `@acme/astryx-widgets`',
              'Each add writes it into the `import` of the doc it generates. Rename before you add, or update each `import` after.',
            ],
            [
              '`version`',
              'The release you publish, such as `1.0.0`',
              'Apps see it; `astryx.integration.mjs` never repeats it.',
            ],
            [
              '`exports`',
              'Start with `{}`',
              'Each component and template add writes its public import here, and `integration verify` resolves it.',
            ],
            [
              '`files`',
              'Optional: the paths to publish',
              'Keeps private files out. When the list exists, each add appends its root and `astryx.integration.mjs`.',
            ],
            [
              '`peerDependencies`',
              '`@astryxdesign/core` when your code imports it; `@astryxdesign/cli`, optional, when you ship a feature that needs a newer CLI ({@link generic:versioning})',
              'The app supplies these packages for your integration.',
            ],
            [
              '`devDependencies`',
              '`@astryxdesign/cli`, `@astryxdesign/core`, and `typescript`',
              'Lets you run the CLI, build components, and run the checks while working on the integration.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Peer ranges and releases are covered in {@link generic:versioning}; `files` and publishing in {@link generic:publishing}. Add `"typecheck": "tsc --noEmit && astryx integration check --strict"` to `scripts` so each run checks your types and that your docs, props, and links still match the code. It needs `typescript` and a `tsconfig.json`; see {@link generic:checks}.',
        },
      ],
    },
    {
      id: 'the-integration-file',
      title: 'The integration file',
      content: [
        {
          type: 'prose',
          text: 'The first `integration add` creates `astryx.integration.mjs`, and each later add updates it. You do not need to write or edit this file during the quick start.',
        },
        {
          type: 'heading',
          level: 3,
          text: 'Files in the package',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`package.json` defines the npm package, including its name, version, dependencies, published files, and exports.',
            '`astryx.integration.mjs` tells the CLI where the package keeps each kind of integration item.',
            'The integration item files live under those roots. For example, a component can have `AcmeWidget.tsx` for its source and `AcmeWidget.doc.mjs` for its documentation.',
          ],
        },
        {
          type: 'heading',
          level: 3,
          text: 'Fields in the integration file',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'astryx.integration.mjs',
          code: "/** @type {import('@astryxdesign/cli/authoring').AstryxIntegration} */\nexport default {\n  components: './components',\n};",
        },
        {
          type: 'prose',
          text: 'The file tells the CLI where this package keeps its integration items. Edit it only when you want a custom root or another optional setting. Paths are relative to package.json, and later adds keep a custom path you already set.',
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:integration}.',
        },
        {
          type: 'heading',
          level: 3,
          text: 'Use the CLI',
        },
        {
          type: 'prose',
          text: 'You can edit the package files by hand, but the CLI handles the normal workflow. These links always open the canonical command docs.',
        },
        {
          type: 'reference',
          target: 'command:integration add',
          presentation: 'summary',
        },
        {
          type: 'reference',
          target: 'command:integration verify',
          presentation: 'summary',
        },
        {
          type: 'reference',
          target: 'command:doctor integration',
          presentation: 'summary',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: users can also install your package for their computer, beside the global CLI (`{@pm install @astryxdesign/cli your-package --global}`). It then applies in folders outside any project, and inside a project only if the project installs it. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
