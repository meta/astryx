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
      'Experimental list for browsing up to one billion fixed-height text items without allocating the full data set. Use the wheel to move locally, the scrollbar to navigate the full range, or handleRef to jump to an exact index. Items are read-only and only the mounted window is exposed to assistive technology. The list owns its viewport; it does not window document scroll.',
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
      description: 'Fixed item height in whole CSS pixels, from 1 to 65,536.',
      required: true,
    },
    {
      name: 'viewportHeight',
      type: 'number',
      description:
        'Viewport height in whole CSS pixels, from 1 to 65,536. The viewport can span at most 1,024 items.',
      required: true,
    },
    {
      name: 'getItemLabel',
      type: '(index: number) => string',
      description: 'Returns the text for the zero-based item index.',
      required: true,
    },
    {
      name: 'handleRef',
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
