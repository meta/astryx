// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/describe-the-component/component-family`:
 * author one ComponentDoc for several public exports in a component family.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'component-family',
  placement: {
    parent: 'namespace:describe-the-component',
    slot: 'guides',
    order: 30,
  },
  title: 'Component family',
  category: 'guide',
  description:
    'Adapt a single-component doc when one module exposes several public components or hooks that belong to one family.',
  sections: [
    {
      id: 'choose-the-family-shape',
      title: 'Choose the family shape',
      content: [
        {
          type: 'prose',
          text: 'Start with a complete single-component doc. Convert its top-level `props` into a `components` array only when one source module or component directory exposes several public components or hooks as one family. The family doc keeps the shared usage guidance; each array entry owns one public export.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Put the primary or most-used export first.',
            'Use a full entry when this file owns that export\'s description and signature.',
            'Use `props` for a component entry. Use `params` and `returns` for a hook entry.',
            'Do not add private implementation helpers or exports that people should not use directly.',
          ],
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:component-doc}.',
        },
      ],
    },
    {
      id: 'document-the-family-inline',
      title: 'Document the family inline',
      content: [
        {
          type: 'code',
          lang: 'javascript',
          label: 'components/AcmeTabs.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeTabs',
  displayName: 'Acme Tabs',
  import: '@acme/astryx-widgets/components/AcmeTabs',
  usage: {
    description:
      'Switches between related views without leaving the page.',
  },
  components: [
    {
      name: 'AcmeTabs',
      displayName: 'Acme Tabs',
      description: 'Owns selection and lays out the tab list and panels.',
      props: [
        {
          name: 'value',
          type: 'string',
          description: 'The selected tab value.',
          required: true,
        },
      ],
    },
    {
      name: 'AcmeTab',
      displayName: 'Acme Tab',
      description: 'Selects one view in Acme Tabs.',
      props: [
        {
          name: 'value',
          type: 'string',
          description: 'The value this tab selects.',
          required: true,
        },
      ],
    },
  ],
};`,
        },
        {
          type: 'prose',
          text: 'The public module named by `import` must export every component or hook named by a full entry. Apps then list, search and open each component in the family by its own name. A full entry the module does not export is not listed, and `integration verify` does not report it: check the family with `{@command component --list}`. When `import` names output your pack lifecycle builds (such as `dist`), the members are listed once that output exists, and `integration verify` compares them as they are listed after the pack builds it.',
        },
        {
          type: 'prose',
          text: "A member's source is the `.tsx` file in the family doc's folder, or below it, that declares it: the one the family's own file or the module `import` names reaches, else the one in that folder that declares the name, as when `import` names built output. A member that only a bundle or a file outside that folder declares is still listed, with no source for `--source` or `swizzle`. A member is not listed when a doc's file or a Core name your package replaces already has its name. A member that shares a name with Core opens with `--package`.",
        },
      ],
    },
    {
      id: 'give-a-member-its-own-file',
      title: 'Give a member its own file',
      content: [
        {
          type: 'prose',
          text: 'When one family member needs its own doc, replace its full entry with `{name: \'MemberName\'}` and move the details into a sibling doc. The parent keeps the family relationship without copying the child\'s content. Continue with {@link generic:subcomponent}.',
        },
      ],
    },
  ],
};
