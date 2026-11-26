// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'InfinityList',
  displayName: 'Infinity List',
  group: 'InfinityList',
  category: 'Content',
  keywords: ['virtualization', 'list', 'large data', 'scroll'],
  usage: {
    description:
      'Experimental list for browsing up to one billion fixed-height text items without allocating the full data set. Scroll locally or use the ref to jump to an exact index. The native scrollbar represents the current segment, not the entire archive. Items are read-only and only the mounted window is exposed to assistive technology. The list owns its viewport; it does not window document scroll.',
  },
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Accessible name of the scroll area and list.',
      required: true,
    },
    {
      name: 'itemCount',
      type: 'number',
      description: 'Total item count, from zero to one billion.',
      required: true,
    },
    {
      name: 'itemHeight',
      type: 'number',
      description: 'Fixed item height in whole CSS pixels.',
      required: true,
    },
    {
      name: 'viewportHeight',
      type: 'number',
      description: 'Height of the scroll area in whole CSS pixels.',
      required: true,
    },
    {
      name: 'getItemLabel',
      type: '(index: number) => string',
      description: 'Returns the text for the zero-based item index.',
      required: true,
    },
    {
      name: 'ref',
      type: 'Ref<InfinityListHandle>',
      description:
        'Exposes scrollToIndex for exact jumps. Changing the count or geometry resets the viewport.',
    },
  ],
  examples: [
    {
      label: 'One billion archive records',
      code: 'import {InfinityList} from "@astryxdesign/lab";\n\n<InfinityList label="Archive records" itemCount={1_000_000_000} itemHeight={32} viewportHeight={320} getItemLabel={index => `Record ${index + 1}`} />',
    },
  ],
};
