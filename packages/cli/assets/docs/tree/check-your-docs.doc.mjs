// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/check-your-docs`:
 * what each check proves about an integration's docs: the docs check, each
 * doc's fields, the read size, and the CLI peer.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'check-your-docs',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 60},
  title: 'Check your docs',
  category: 'guide',
  description:
    'Check the docs tree, links, overlaps, doc fields, read size, and CLI peer.',
  sections: [
    {
      id: 'run-the-docs-check',
      title: 'Run the docs check',
      content: [
        {
          type: 'prose',
          text: 'Run `doctor integration docs` in your package to check the docs tree, every link, and overlaps with Core topics, and to list any passage two topics repeat. Pass a package name to check an installed package.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration docs}\n# In an app, check an installed package\n{@command doctor integration docs @acme/astryx-widgets}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'Checking integration docs: @acme/astryx-widgets@1.0.0\n\n[ok] The docs tree and every link in these docs check out.\n\n[ok] No doc topics overlap with Core.\n[ok] No topic copies a passage from another.\n[ok] No filler phrases or low-density topics.',
        },
        {
          type: 'prose',
          text: 'Write each fact in one topic. When two of your topics, or one of yours and a Core topic, repeat 10 or more words of prose word for word, the check lists the pair as a `copied_passage` warning. It names the topic that keeps the text (a Core topic, or of your two the one the passage fits) and the line in the other where to put the link instead ({@link generic:links}). Code and examples are not compared, and a topic may carry the text of the Core topic it replaces. A run with fewer than 4 distinct content words (words other than function words such as \"the\", \"in\" or \"it\"), or one that three or more topics share (a series lead-in), is not listed. Each listed pair is also a warning (`copied_passage`): `doctor integration docs` still exits 0, and `integration check --strict` fails until you fix it.',
        },
        {
          type: 'prose',
          text: "Keep docs dense. The check lists, as a `doc_fluff` warning, each padding phrase in your prose, with its file line and what to write instead, and each topic of 80 or more prose words in which fewer than half the words carry content (words other than function words such as the, and, in), with its measured share and the floor of 0.5. `doctor integration docs` still exits 0, and `integration check --strict` fails until you cut it. Code, examples, and quoted text are not read. The phrases: `it\'s important to note`, `it is important to note`, `important to note that`, `it\'s worth noting`, `it is worth noting`, `worth noting that`, `it should be noted`, `please note`, `note that` (opening a sentence), `as mentioned above`, `as mentioned earlier`, `as mentioned before`, `as noted above`, `as you can see`, `needless to say`, `in order to`, `due to the fact that`, `for the purpose of`, `at this point in time`, `in other words`, `basically`, `essentially`, `obviously`.",
        },
        {
          type: 'prose',
          text: "Point at another doc with a link, never by writing `{@command docs <name>}` in prose: `{@link generic:<name>}` for one of your package's topics, or `{@link @astryxdesign/cli:generic:<name>}` for a Core doc (`namespace:` for a Core namespace). The CLI prints the link as the command that opens the doc, and doctor checks that the doc exists. The check lists each written pointer to a doc that exists as a `stray_doc_pointer` warning, with the link to write instead. A command with more words, or one in a code block, is a walkthrough and is not listed.",
        },
        {
          type: 'prose',
          text: 'Its arguments and exit codes are in {@link command:doctor integration docs}.',
        },
      ],
    },
    {
      id: 'know-what-fails-the-check',
      title: 'Know what fails the check',
      content: [
        {
          type: 'prose',
          text: 'A doc that does not load, an accidental Core overlap, a `reference` block that names no doc, or a failed namespace or placement fails the check with exit code 1. A link that names no doc only warns, and the exit code stays 0.',
        },
        {
          type: 'table',
          headers: ['Problem', 'Reported as', 'Exit code'],
          rows: [
            [
              'A doc that does not load, such as an unknown section field or block type',
              '`[fail]` `invalid_doc`',
              '1',
            ],
            [
              "A topic with a Core topic's name and no `replaces` or `extends`",
              '`[fail]` `accidental`',
              '1',
            ],
            [
              'A placement that fails, which hides the doc',
              '`[fail]` `invalid_doc_graph`',
              '1',
            ],
            [
              'A `reference` block whose target names no doc',
              '`[fail]` `invalid_doc_reference`',
              '1',
            ],
            ['A link that names no doc', '`[warn]` `invalid_doc_graph`', '0'],
            [
              'A topic that sets `replaces` or `extends`',
              '`[info]` `replaces` or `extends`',
              '0',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Read the warnings before you publish. With `--json`, they are in `data.issues`, with `severity: "warning"`.',
        },
      ],
    },
    {
      id: 'check-each-doc-against-its-type',
      title: 'Check each doc against its type',
      content: [
        {
          type: 'prose',
          text: "`doctor integration validate` reads every doc your package ships against the type `@astryxdesign/cli/authoring` publishes for its kind, the way `tsc` would: a `hidden` doc and a second doc for one name too. Test fixtures under `__tests__` in the components or docs root, which those readers skip, are counted, not checked. It reports a field the type does not have (`unknown_field`), a missing required field (`missing_field`), and a value outside the field's type (`wrong_type`).",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration validate}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `Checking 1 doc(s) against the authoring types (TypeScript 6.0.3)

severity: [warn]
doc:      components/AcmeCarousel.doc.mjs
line:     7
export:   default
type:     ComponentDoc
field:    summary
problem:  unknown_field
message:  Object literal may only specify known properties, and 'summary' does not exist in type 'SingleComponentDoc'.
fix:      Remove \`summary\`: SingleComponentDoc has no field \`summary\`.`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "The folder decides the type: `ComponentDoc` in your components root, `IntegrationTemplateDoc` in your templates root, `ThemeDoc` in your themes root, and in your docs root the type the doc's `type` names. Keep the `@type` comment above each doc's export too, so your editor shows the same problems as you type.",
            'Every finding is a warning, so the exit code stays 0. With `--json`, they are in `data.docTypes.findings`.',
            'It uses the `typescript` your package installs. Where `typescript` is missing or has no JavaScript compiler API, as TypeScript 7 does, it uses `@typescript/typescript6`, the TypeScript 6 API package, if your package installs it. Without either, it prints `[skip] Docs not type-checked` and the reason.',
            'Every field of every doc type is in {@link generic:field-reference}.',
          ],
        },
      ],
    },
    {
      id: 'check-read-size',
      title: 'Check read size',
      content: [
        {
          type: 'prose',
          text: '`{@command doctor}` also measures every read and warns on one over 32 KB. Run it in your package or in an app that installs it; `doctor integration docs` does not check size.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'id:      docs-progressive-disclosure\nstatus:  [warn]\nlabel:   Documentation navigation and size\nmessage: acme/deploying build-before-you-ship: 46 KB, over the 32 KB one read may return',
        },
        {
          type: 'prose',
          text: 'Split a section over the limit into smaller ones, each with its own key. See {@link command:doctor}.',
        },
      ],
    },
    {
      id: 'check-the-cli-peer',
      title: 'Check the CLI peer',
      content: [
        {
          type: 'prose',
          text: '`integration verify` fails a package that ships a docs section, a placed guide, or a doc section with an `id` without an `@astryxdesign/cli` peer of `>=0.6.4`. It does not run the docs check, so run both.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration verify}',
        },
        {
          type: 'code',
          lang: 'text',
          code: '- [fail] The package ships a namespace doc or a placed guide but declares no @astryxdesign/cli peer. A stable CLI before 0.6.4 does not read the docs tree, and can hide every doc topic the package ships. Declare "@astryxdesign/cli": ">=0.6.4" in peerDependencies (optional in peerDependenciesMeta, if the CLI is not required).',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`integration add doc --parent` writes the peer for you.',
            '`integration verify` passes a hidden guide and an accidental Core overlap; only `doctor integration docs` catches them.',
            'Everything else it checks is in {@link command:integration verify} and {@link generic:checks}.',
          ],
        },
      ],
    },
  ],
};
