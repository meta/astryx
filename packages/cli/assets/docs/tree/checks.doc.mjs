// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/ship/checks`: what each package check
 * proves, what fails and what only warns, and one command to run them all.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'checks',
  placement: {parent: 'namespace:ship', slot: 'guides', order: 20},
  title: 'Check an integration',
  category: 'guide',
  keywords: ['check before publishing', 'validate an integration'],
  description:
    'Pick the check for each problem, learn what fails and what only warns, and run every check in CI.',
  sections: [
    {
      id: 'pick-a-check',
      title: 'Pick a check',
      content: [
        {
          type: 'prose',
          text: 'Run these in the package folder. The four `doctor integration` checks read your source, and `integration check` runs all four; `integration verify` checks the package npm would publish.',
        },
        {
          type: 'table',
          headers: ['Command', 'Proves', 'Exits 1 when', 'Only warns when'],
          rows: [
            [
              '`{@command doctor integration validate}`',
              'The manifest loads, each root holds contributions the CLI can read, and each doc matches its authoring type. Notes list a malformed `cliCommand` (`invalid_cli_command`) and, for each topic, a command written with a package runner (`runner_command`), bare (`plain_command`) or for one package manager (`package_manager_command`), and a token that does not parse (`doc_token`; see {@link generic:doc-syntax}). Notes fail nothing by default; `integration check --strict --next` fails on the ones marked `next`, and the next minor release counts them',
              'A declared root is missing (`missing_root`), a contribution does not load (`invalid_doc`, `invalid_component`, `invalid_theme`), or two templates in the package replace one Core id (`ambiguous_template_replacement`)',
              "The manifest has a key this CLI does not know (`unknown_manifest_key`), or a doc field does not match the doc's authoring type: a field the type does not have, a missing required field, or a value outside the field's type. It also warns on what no reader can serve: a prop listed twice (`duplicate_prop`), a `propDescriptions` key that names no documented prop (`unknown_translated_prop`), a section with no content (`empty_section`), two sections of a topic with one key (`duplicate_section_key`), or a `.doc.zh.mjs` or `.doc.dense.mjs` overlay beside no topic file (`orphan_doc_overlay`). Since 0.7.3 it also lists, from source and without failing, what the package tells apps to import that they cannot: a component's import (the doc's `import`, or the one the CLI derives) or a template's public import whose subpath package.json `exports` does not declare (`component_import_not_exported`, `template_import_not_exported`) or that names another package (`component_import_other_package`); an example that imports an undeclared subpath (`example_import_not_exported`); a template that imports a path outside the templates root (`template_import_outside_root`) or a path its package or Core does not export (`template_private_import`). It lists the same way a component's import whose module does not export the component (`component_import_missing_name`), an example or a template that imports a name its package does not export (`example_import_missing_name`, `template_import_missing_name`), and a template source with no default export (`template_no_default_export`). Each is a note, printed with its fix, that fails `--strict` from the next minor; an import it cannot judge, such as an `exports` target not built yet or a deep path into a `dist/` not built yet, is listed under `publicImports` as not checked. It checks docs with your installed `typescript`, or, where that is missing or has no JavaScript compiler API (TypeScript 7), with an installed `@typescript/typescript6`; without either, it prints `[skip] Docs not type-checked`. With no `astryx.integration.mjs` it prints a hint and exits 0",
            ],
            [
              '`{@command doctor integration components}`',
              "No component name clashes with a Core component, each `replaces` names one Core component, and each component doc's props match the component's TypeScript props",
              'Core is not installed (`core_not_found`). In a package that declares the CLI range that turns replacement on, a `replaces` target is missing (`missing_component_replacement_target`) or invalid (`invalid_component_replacement`), or two components replace one Core component (`ambiguous_component_replacement`)',
              'A name clashes with Core, a component sets `replaces` in a package without that range (`inactive_component_replacement`, plus any missing, invalid, or duplicate `replaces` reported as a warning), or a documented prop differs from the code: it is missing there (`not_in_code`), the doc omits a prop the package declares (`not_in_doc`), or its `required` (`required_mismatch`), type (`type_mismatch`), or literal `default` (`default_mismatch`) disagrees, or a `{@link}` in a component doc names no doc (`invalid_doc_graph`). It reads props with your installed `typescript`; without it, it prints `[skip] Props not compared`',
            ],
            [
              '`{@command doctor integration templates}`',
              'Each `replaces` names a Core template of the same type',
              'A `replaces` target is missing (`missing_template_replacement_target`) or of the other type (`invalid_template_replacement`), or two templates replace one id (`ambiguous_template_replacement`)',
              'A template id matches a Core id without `replaces`',
            ],
            [
              '`{@command doctor integration docs}`',
              'Your docs tree, every link, topic names against Core, passages two topics repeat word for word, padding phrases and low-density topics, and written pointers to docs',
              'A topic takes a Core topic name without `replaces` or `extends`, a doc is invalid (`invalid_doc`), or a namespace or placement fails, which hides the doc (`invalid_doc_graph`)',
              'A link names no doc (`invalid_doc_graph`), two topics repeat a passage word for word (`copied_passage`), prose pads with a listed phrase or falls under the density floor (`doc_fluff`), or prose, a description or summary, or the text of a component doc writes `{@command docs <name>}` where a link would be checked (`stray_doc_pointer`)',
            ],
            [
              '`{@command integration check}`',
              'Everything the four `doctor integration` checks prove, in one command, for your build',
              'Any of the four would exit 1 on its own. With `--strict`, also any warning, and any check that did not run, such as a package with no `astryx.integration.*`',
              'Anything the four warn about, unless you pass `--strict`',
            ],
            [
              '`{@command integration verify}`',
              'The packed package holds every file, shows the same contributions, resolves every public import, and declares the CLI it needs',
              'Anything `validate` fails on, no manifest, a file left out of the `.tgz` file, an import that does not resolve, or a missing CLI peer',
              'Anything `validate` warns about, or a component sets `replaces` and the package does not declare the CLI range that turns it on (`component_replaces_needs_cli`)',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Pass a package name, such as `{@command doctor integration validate @acme/astryx-widgets}`, to check an installed copy from an app instead. To fix a props finding, see {@link generic:check-the-props}.',
        },
      ],
    },
    {
      id: 'run-every-check-in-ci',
      title: 'Run every check in every build (required)',
      content: [
        {
          type: 'prose',
          text: 'Every integration runs `integration check --strict` in its own build, so every build keeps your docs, types, and links in sync; this is required, not optional. The strict check fails on every copied passage the docs check lists ({@link generic:check-your-docs}). Run `integration verify` before you publish. Install devDependencies first, because the components check needs Core, and `tsc --noEmit` needs `typescript` and a `tsconfig.json`. In package.json:',
        },
        {
          type: 'code',
          lang: 'json',
          code: '"typecheck": "tsc --noEmit && astryx integration check --strict"',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`integration check` runs `validate`, `components`, `templates`, and `docs` in that order, prints each result, then a summary, and exits 1 when any of them would.',
            '`--strict` also exits 1 on any warning and on any check that did not run. Without it, warnings keep exit code 0: use that while you fix the warnings a package already has.',
            'Its exit codes and JSON are a contract for your build: a new check, or a new failure code, joins only in a minor release that names it in the release notes. A patch can still ship a Core component, template, or CLI topic whose name conflicts with one of yours.',
            '`integration verify` runs `validate` but none of the other three: a Core name clash, a `replaces` that names no Core template, a topic that takes a Core name, or a hidden guide still passes it. Run both before you publish: `astryx integration check --strict && astryx integration verify`.',
            'Bare `{@command doctor}` in the package also warns about a doc section over 32 KB, which no check above measures.',
          ],
        },
      ],
    },
    {
      id: 'what-integration-verify-does',
      title: 'Verify the packed package',
      content: [
        {
          type: 'prose',
          text: '`integration verify` packs your package with npm, unpacks it into a temporary app, and checks that the app sees everything your source has. It publishes nothing and leaves no `.tgz` file or temporary folder behind.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'It runs `{@pm-only npm "the tarball the registry receives" pack}` the way `{@pm-only npm "npm is the client the registry publishes from" publish}` would, including your `prepack` script.',
            'It checks that every contribution file is in the `.tgz` file. A root missing from `files` fails with `Add "templates" to "files" in package.json.`',
            'It lists the components, templates, themes, docs, and codemods the temporary app sees, and compares them with your source.',
            "It resolves each component's `import`, and each template's public import, the way Node does, and checks that the module exports the component under the name its doc documents, or a default export for a template. A type-only export does not count.",
            'For each theme, it rebuilds the source, compares the built module and production CSS with the authored outputs, and proves the module, CSS, and optional font CSS exports resolve from the packed package.',
            'It fails a package that needs an `@astryxdesign/cli` peer and lacks it: `>=0.6.6` for a template that sets `keywords`, and `>=0.6.4` for a template that sets `replaces`, a docs section, a placed guide, a doc section with an `id`, or a theme.',
          ],
        },
        {
          type: 'prose',
          text: '`integration pack --check`, the name this check had before published 0.6.5, still runs it and prints a note; it will be removed in a later release. The options and exit codes are in {@link command:integration verify}.',
        },
      ],
    },
  ],
};
