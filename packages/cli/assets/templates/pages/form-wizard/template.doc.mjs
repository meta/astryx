// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Form Wizard',
  displayName: 'Form Wizard',
  description:
    'Linear multi-step form that moves through one panel at a time, with a horizontal progress track pinned above rather than running down a rail, so every step keeps the full content width for its fields. Only the current step renders, unlike an accordion where each section expands into one long scrolling form. Each advance is validated, and a step left broken stays flagged to jump back to.',
  keywords: [
    'wizard',
    'stepper',
    'multi-step',
    'onboarding',
    'setup',
    'signup',
    'guided flow',
    'step-by-step',
    'workflow',
    'review step',
    'request flow',
  ],
  isReady: true,
  category: 'Form - Wizard',
};
