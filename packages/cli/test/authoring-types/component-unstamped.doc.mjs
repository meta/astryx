// Copyright (c) Meta Platforms, Inc. and affiliates.

// Every component shipped today is written this way: no `type` field.
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Divider',
  displayName: 'Divider',
  category: 'Layout',
  props: [
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description: 'Direction of the rule.',
      default: "'horizontal'",
    },
  ],
  usage: {description: 'Separate groups of content.'},
};
