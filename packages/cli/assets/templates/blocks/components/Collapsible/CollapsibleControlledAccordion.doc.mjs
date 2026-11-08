// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Collapsible',
  name: 'Collapsible — Controlled',
  displayName: 'Collapsible — Controlled',
  description:
    'Manage the open section from parent state, so something other than a click can move it: a URL parameter, a form jumping to the step that failed validation, or the Previous/Next controls shown here. onChange hands back the whole open value.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Collapsible',
    'CollapsibleGroup',
    'Card',
    'Text',
    'Button',
    'Stack',
  ],
};
