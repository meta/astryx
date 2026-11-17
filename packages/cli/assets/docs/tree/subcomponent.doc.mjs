// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/describe-the-component/subcomponent`:
 * give one member of a component family its own ComponentDoc.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'subcomponent',
  placement: {
    parent: 'namespace:describe-the-component',
    slot: 'guides',
    order: 40,
  },
  title: 'Subcomponent',
  category: 'guide',
  description:
    'Move one member of a component family into its own sibling doc without duplicating it in the parent.',
  sections: [
    {
      id: 'choose-a-separate-doc',
      title: 'Choose a separate doc',
      content: [
        {
          type: 'prose',
          text: 'Start with a component family doc. Move one public member into a sibling doc when it has its own source and enough behavior, props, or usage guidance to maintain separately. The parent still lists the member, but only by name.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Keep a small member inline when its whole contract stays clear in the family doc.',
            'Use a sibling doc when the member needs focused search results, examples, usage guidance, or independent maintenance.',
            'Give each member one documentation owner. Do not keep a full parent entry and a sibling doc for the same name.',
          ],
        },
      ],
    },
    {
      id: 'reference-it-from-the-parent',
      title: 'Reference it from the parent',
      content: [
        {
          type: 'code',
          lang: 'javascript',
          label: 'components/AcmeDialog.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeDialog',
  displayName: 'Acme Dialog',
  import: '@acme/astryx-widgets/components/AcmeDialog',
  usage: {description: 'Presents a focused task above the current page.'},
  components: [
    {
      name: 'AcmeDialog',
      displayName: 'Acme Dialog',
      description: 'Owns the modal surface and open state.',
      props: [],
    },
    {name: 'AcmeDialogHeader'},
  ],
};`,
        },
        {
          type: 'prose',
          text: 'The name-only entry keeps `AcmeDialogHeader` in the family. Its description and props come only from the sibling file.',
        },
      ],
    },
    {
      id: 'write-the-subcomponent-doc',
      title: 'Write the subcomponent doc',
      content: [
        {
          type: 'code',
          lang: 'javascript',
          label: 'components/AcmeDialogHeader.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeDialogHeader',
  displayName: 'Acme Dialog Header',
  import: '@acme/astryx-widgets/components/AcmeDialogHeader',
  subComponentOf: 'AcmeDialog',
  description: 'Labels an Acme Dialog and holds its close action.',
  props: [
    {
      name: 'title',
      type: 'string',
      description: 'The dialog title.',
      required: true,
    },
  ],
};`,
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:component-doc}.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`subComponentOf` must exactly match the parent doc\'s `name`.',
            '`description` explains this member\'s role in the family. `usage` is optional; add it when the member needs guidance beyond that sentence.',
            'The CLI does not copy family fields such as `group`, `category`, or `keywords` from the parent to the child. Set any the child needs in its own doc.',
          ],
        },
      ],
    },
  ],
};
