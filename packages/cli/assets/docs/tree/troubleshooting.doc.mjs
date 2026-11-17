// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/help/troubleshooting`: the messages the CLI
 * prints while you build, verify, and install an integration, and the fix
 * for each.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'troubleshooting',
  placement: {parent: 'namespace:help', slot: 'guides', order: 10},
  title: 'Troubleshooting',
  category: 'guide',
  keywords: ['integration error', 'integration not loading'],
  description:
    'Find the message the CLI printed while you build, verify, or install an integration, and apply its fix.',
  sections: [
    {
      id: 'fix-setup-errors',
      title: 'Fix setup errors',
      content: [
        {
          type: 'prose',
          text: 'These appear while you start the package or run the CLI in it. Each row quotes what the CLI prints.',
        },
        {
          type: 'table',
          headers: ['Message', 'Fix'],
          rows: [
            [
              '`No package.json found. Run this command inside an integration package.`',
              'Run `{@pm-only npm "writes package.json" init -y}` and `{@pm-only npm "edits package.json" pkg set name=@acme/astryx-widgets}` first, in the package folder.',
            ],
            [
              '`Error: Could not find @astryxdesign/core package`',
              'Component commands read Core. Run `{@pm install @astryxdesign/core --dev}` in the package.',
            ],
            [
              '`core_not_found`: `Could not resolve @astryxdesign/core, so component names could not be checked.`',
              'Same fix. The check exits 1.',
            ],
            [
              "`Error: unknown subcommand 'integration verify'`, or `Error: Pass --check to verify the integration tarball.`",
              'Your CLI is older than `integration verify`. Run `{@pm install @astryxdesign/cli@latest --dev}`. On the older CLI, the same check is `integration pack --check`.',
            ],
            [
              'Note: `integration pack --check` is deprecated.',
              'The old name still runs the same check. Switch to `{@command integration verify}`; the old name will be removed in a later release.',
            ],
          ],
        },
      ],
    },
    {
      id: 'fix-verify-failures',
      title: 'Fix integration verify failures',
      content: [
        {
          type: 'prose',
          text: '`{@command integration verify}` prints each failure as a `[fail]` line. Add `--json` to see its issue code, such as `component_export_missing`.',
        },
        {
          type: 'table',
          headers: ['Message', 'Fix'],
          rows: [
            [
              '`component_export_missing`: `Component "AcmeCarousel" advertises import "@acme/astryx-widgets/components/AcmeCarousel", but that packed module does not export "AcmeCarousel".`',
              "package.json has no `exports` map, or the module does not export the name. Keep `export function AcmeCarousel`, and add the entry: `{@pm-only npm \"edits package.json\" pkg set 'exports[./components/AcmeCarousel]=./components/AcmeCarousel.tsx'}`. When the quoted name is a file name, such as `acme-carousel`, set the doc's `name` to the component the file exports. A type-only export does not count.",
            ],
            [
              '`template_export_missing`: `Template "acme-dashboard" public import "@acme/astryx-widgets/templates/acme-dashboard" does not have a default export.`',
              'Run `{@pm-only npm "edits package.json" pkg set \'exports[./templates/acme-dashboard]=./templates/acme-dashboard.tsx\'}`, and keep `export default` in the source. Start new packages with `"exports": {}` so each add writes these.',
            ],
            [
              '`component_import_unresolvable` or `template_import_unresolvable`: `…Package subpath \'./components/AcmeCarousel\' is not defined by "exports"…`',
              "The `exports` map has no entry for it. Run `{@pm-only npm \"edits package.json\" pkg set 'exports[./components/AcmeCarousel]=./components/AcmeCarousel.tsx'}`, or `'exports[./templates/acme-dashboard]=./templates/acme-dashboard.tsx'` for a template.",
            ],
            [
              "`component_import_unresolvable`: `…but a consumer cannot resolve it: Cannot find package '@acme/old-name'`",
              "You renamed the package after the add wrote each doc's `import`. Change `import` in every component doc to the new name.",
            ],
            [
              '`Declared templates root "templates" has 0 of 2 expected files in the pack list. Add "templates" to "files" in package.json.`',
              'Run `{@pm-only npm "edits package.json" pkg set \'files[]=templates\'}`.',
            ],
            [
              '`docs_tree_needs_cli`: `The package ships a namespace doc or a placed guide but declares no @astryxdesign/cli peer.`',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.6.4\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}`.',
            ],
            [
              '`replaces_needs_cli`: The package has a template that sets `replaces` but declares no @astryxdesign/cli peer.',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.6.4\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}`. A stable CLI before 0.6.4 rejects `replaces`, drops that template, and hides your doc topics.',
            ],
            [
              '`component_replaces_needs_cli` (a warning): The package has a component that sets `replaces` but declares no @astryxdesign/cli peer, or a peer range that admits an earlier CLI.',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.6.7\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}` to turn the replacement on. Until then apps see no change ({@link generic:replace-a-core-component}).',
            ],
            [
              '`keywords_needs_cli`: The package has a template that sets `keywords` but declares no @astryxdesign/cli peer.',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.6.6\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}`. What an older CLI does with the field is in {@link generic:template-doc-overview}.',
            ],
            [
              '`themes_need_cli`: The package ships a theme but declares no @astryxdesign/cli peer.',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.6.4\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}`. A CLI older than published 0.6.4 cannot read typed theme descriptors, so it drops your themes and can hide your doc topics.',
            ],
            [
              '`section_ids_need_cli`: The package has a doc section that sets `id` but declares no @astryxdesign/cli peer.',
              'The same fix as `themes_need_cli`, or drop the section `id`s: a CLI older than published 0.6.4 rejects them and hides your doc topics.',
            ],
            [
              '`doc_tokens_need_cli`: The package writes doc tokens (`{@@command …}`, `{@@pm …}`, `{@@pm-only …}`) in its docs, but its @astryxdesign/cli peer admits a CLI before 0.7.4.',
              'Run `{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/cli=>=0.7.4\'}` and `{@pm-only npm "edits package.json" pkg set \'peerDependenciesMeta.@astryxdesign/cli.optional=true\' --json}`. A CLI before 0.7.4 prints each token as written, so readers see raw tokens.',
            ],
          ],
        },
      ],
    },
    {
      id: 'fix-problems-in-an-app',
      title: 'Fix problems in an app',
      content: [
        {
          type: 'prose',
          text: 'These appear in an app that installs your package, or in the doctor checks that predict them.',
        },
        {
          type: 'table',
          headers: ['Symptom', 'Fix'],
          rows: [
            [
              '`Error: No component named "AcmeCarousel"` for a component your package documents.',
              "Its doc still names its file. Set `name` to the export, such as `name: 'AcmeCarousel'` in `acme-carousel.doc.mjs`. A family member is listed only when the module its family doc imports exports it ({@link generic:component-family}).",
            ],
            [
              "`{@command component Dialog}` opens Core's `Dialog`, not yours.",
              "A name that Core, a legacy docs package, or another package's file already has stays theirs. Run `{@command component Dialog --package @acme/astryx-widgets}`, or give your component a name of its own.",
            ],
            [
              '`Error: Template "dashboard" is ambiguous — narrow it with --type and/or --package.`',
              "Your template id matches a Core id. Rename it, such as `acme-dashboard`, or set `replaces: 'dashboard'` to take its place. `{@command doctor integration templates}` warns about this before you publish.",
            ],
            [
              '`invalid_doc_graph`: `placement.parent "namespace:nope" names no namespace; @acme/astryx-widgets declares "acme".`',
              'The guide stays hidden until its `placement` names a namespace and slot your package declares. For `"…" names no doc`, fix the link target.',
            ],
            [
              'Error: Unknown topic "acme". The docs of @acme/astryx-widgets did not load; run `{@command doctor integration docs}` in that package to see why.',
              'One invalid doc hides all of your docs. Run `{@command doctor integration docs}` in the package and fix the `invalid_doc` it names.',
            ],
            [
              '`cli-command` warns: `Loaded integrations declare different CLI commands`',
              "Two packages the app loads set different `cliCommand` values, so the CLI prints the package manager's command. Agree on one command, or remove the package that does not belong. See {@link generic:cli-command}.",
            ],
            [
              '`invalid_cli_command`',
              'Your `cliCommand` is not one line of plain text of at most 120 characters, so it is ignored. Fix the value; the rest of the manifest still loads.',
            ],
            [
              '`{@command upgrade}` runs none of your codemods',
              'The app must list your package in `integrations` in `astryx.config`, or pass `--integration @acme/astryx-widgets`. It runs a codemod folder only when its version is after `--from` and at most the installed `@astryxdesign/core`.',
            ],
            [
              'Your docs section, templates, or themes are missing only in some apps',
              "Those apps run a CLI too old to read them ({@link generic:checks} lists which field needs which CLI). Update `@astryxdesign/cli` there, and keep your optional `@astryxdesign/cli` peer so npm checks the app's CLI against it when the app installs your package.",
            ],
          ],
        },
        {
          type: 'prose',
          text: 'What each check catches is in {@link generic:checks}.',
        },
      ],
    },
  ],
};
