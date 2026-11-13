// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Stepper',
  name: 'Stepper — Validation Status',
  displayName: 'Stepper — Validation Status',
  description:
    'Semantic status per step in a verification flow: success shows a green check, error a red glyph, accent the in-progress step. Status sets the indicator color and glyph only, never the connector, and is announced to assistive tech as text.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Stepper'],
  fits: ['feedback', 'list', 'panel'],
};
