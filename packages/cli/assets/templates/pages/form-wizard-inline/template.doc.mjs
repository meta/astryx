// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Inline Wizard',
  displayName: 'Inline Wizard',
  description:
    'Accordion wizard stacking every step in one column: the active step expands in place while finished ones collapse to a single line carrying their result and a way back in. Steps that run themselves expand into a nested stepper that ticks check by check and halts the column where one fails. Best when later steps depend on what earlier ones decided.',
  isReady: true,
  category: 'Form - Wizard Inline',
};
