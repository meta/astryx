// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Fixture: a component doc using the stamped default export convention
 * (what `integration add component` generates). loadDocs must read this
 * shape identically to the legacy named `export const docs` form.
 */
export default {
  type: 'component',
  name: 'DefaultExportCard',
  description: 'A card written with default export.',
  props: [{name: 'title', type: 'string', description: 'Card title.'}],
};
