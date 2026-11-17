// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/add-a-component`: choose a
 * component name and generate its first source and doc files.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'add-a-component',
  placement: {parent: 'namespace:components', slot: 'guides', order: 10},
  title: 'Add a component',
  category: 'guide',
  description:
    'Choose a stable component name and generate its source, doc, package export, and integration entry.',
  sections: [
    {
      id: 'pick-a-component-name',
      title: 'Pick a component name',
      content: [
        {
          type: 'prose',
          text: 'Choose a unique PascalCase name, such as `AcmeCarousel`. The name is the component\'s public export and CLI identity, so keep it stable. Use `displayName` when you only want to change the label people read.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Prefer a name that describes the component\'s purpose in your product.',
            'Avoid a Core component name unless you are deliberately replacing that component.',
            'If replacement is truly required, read {@link generic:replace-a-core-component}.',
          ],
        },
      ],
    },
    {
      id: 'run-the-add-command',
      title: 'Run the add command',
      content: [
        {
          type: 'prose',
          text: 'Run `integration add component` in your package with the name. It writes the component, its doc file, and the public import apps use.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add component AcmeCarousel}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `component contribution added

[ok] AcmeCarousel

Declare component root ./components in astryx.integration.mjs.

- components/AcmeCarousel.doc.mjs
- components/AcmeCarousel.tsx
- package.json
- astryx.integration.mjs`,
        },
        {
          type: 'prose',
          text: '`integration add` starts with one source export and one single-component `.doc.mjs`. Keep that shape for one public component. If the source exposes a family, choose the correct shape in {@link namespace:describe-the-component}.',
        },
        {
          type: 'prose',
          text: 'Add never overwrites a file, and `--dry-run` shows what it would write. Component commands read Core, so install `@astryxdesign/core` in the package first ({@link generic:quick-start}).',
        },
      ],
    },
    {
      id: 'document-an-existing-component',
      title: 'Document a component you already have',
      content: [
        {
          type: 'prose',
          text: "To document a component your package already has, write its doc beside the source file and name the doc after that file, such as `acme-gallery.doc.mjs` beside `acme-gallery.tsx`. Set `name` to the export apps import, such as `name: 'AcmeGallery'`, and keep both files inside the components root that `astryx.integration.mjs` declares. The file does not have to be named after the component; {@link generic:component-imports} shows how apps then find it.",
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: when users install your package for their computer, beside the global CLI, your components show up in folders outside any project; inside a project, only if the project installs your package. See {@link namespace:global} and {@link generic:global-integrations}.",
        },
      ],
    },
  ],
};
