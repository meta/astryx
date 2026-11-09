// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/component-imports`: make an
 * integration component's documented import resolve from the packed package.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'component-imports',
  placement: {parent: 'namespace:components', slot: 'guides', order: 30},
  title: 'Resolve the import',
  category: 'guide',
  description:
    'Keep the component doc import and package exports map aligned, then verify the packed package.',
  sections: [
    {
      id: 'export-the-component',
      title: 'Export the component',
      content: [
        {
          type: 'prose',
          text: 'Apps copy the component doc\'s `import` field into their code, so that exact specifier must resolve from your packed package. `integration add` writes it together with an `exports` entry in package.json.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `"exports": {
  "./components/AcmeCarousel": "./components/AcmeCarousel.tsx"
}`,
        },
        {
          type: 'prose',
          text: 'Add writes the entry only when package.json already has an `exports` map, so start every package with `"exports": {}`.',
        },
        {
          type: 'prose',
          text: 'A file does not have to be named after its component. When `Slides.tsx` exports `AcmeCarousel` and nothing named `Slides`, keep the doc beside it as `Slides.doc.mjs` and set its `name` to `AcmeCarousel`: apps list, search and open the component by that name, and `integration verify` checks that its import exports `AcmeCarousel`. A file that exports its own name keeps that name. A package that names its files in kebab case works the same way: `acme-gallery.doc.mjs` beside `acme-gallery.tsx` sets `name: \'AcmeGallery\'`.',
        },
        {
          type: 'prose',
          text: "The file name still opens the doc. A name that Core or another doc's file already has stays theirs, and so does a Core name your package replaces: with `Badge.doc.mjs` naming `AcmeBadge`, `{@command component Badge}` opens Core's `Badge`, and `--package` with your package name reaches yours.",
        },
      ],
    },
    {
      id: 'verify-the-packed-import',
      title: 'Verify the packed import',
      content: [
        {
          type: 'prose',
          text: '`integration verify` unpacks the packed package into a temporary app, resolves each documented import, and checks that the module exports the documented component name. Its `--json` output names each failure by code.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration verify}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`component_import_unresolvable` means the exports map has no entry for the documented import.',
            '`component_export_missing` means the module does not export the documented name, or package.json has no exports map.',
            '`typescript_extension_in_specifier` means the public import ends in `.ts` or `.tsx`.',
          ],
        },
        {
          type: 'prose',
          text: 'To import from the package root, set `import: \'@acme/astryx-widgets\'` and re-export the component from the file that `exports["."]` points to. See {@link command:integration verify}.',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: outside a project, imports the CLI prints name packages installed for the computer, which a new app must install before it can build them; inside a project, only packages the project installs are printed. See {@link namespace:global} and {@link generic:global-integrations}.",
        },
      ],
    },
  ],
};
