// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  type: 'component',
  name: 'Tabs',
  displayName: 'Tabs',
  category: 'Navigation',
  usage: {description: 'Switch between views that share one place.'},
  components: [
    {
      name: 'Tabs',
      displayName: 'Tabs',
      description: 'The tab list and its panels.',
      props: [
        {
          name: 'value',
          type: 'string',
          description: 'The selected tab.',
        },
      ],
    },
    {name: 'Tab'},
  ],
};
