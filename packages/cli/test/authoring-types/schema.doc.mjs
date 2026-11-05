// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const docs = {
  type: 'schema',
  name: 'widget-config',
  displayName: 'Widget config',
  description: 'Options a widget integration reads.',
  appliesTo: 'widget.config.mjs',
  fields: [
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Default widget size.',
      default: "'md'",
    },
    {
      name: 'colors',
      type: 'object',
      description: 'Color overrides.',
      fields: [
        {name: 'colors.accent', type: 'string', description: 'Accent color.'},
      ],
    },
  ],
  examples: [{label: 'Small widgets', code: "export default {size: 'sm'};"}],
};
