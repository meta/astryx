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
  icons: {
    BeakerIcon: 'experiment',
    BoltIcon: 'bolt',
    CpuChipIcon: 'cpu',
    CubeIcon: 'package',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Layout header at the top with the page title and a one-line supporting summary.',
    },
    {
      name: 'steps',
      kind: 'form',
      description:
        'Vertical Stepper in the body; each step expands in place with its fields, checks, or review card.',
    },
    {
      name: 'status',
      kind: 'feedback',
      description:
        'Supporting note below the stepper, shown when a check fails, saying setup is paused at that step.',
    },
  ],
};
