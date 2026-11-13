// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Dialog Wizard',
  displayName: 'Dialog Wizard',
  description:
    'Step through a short flow in a dialog, overlay, or popup launched from the page underneath, which stays where it was. Compact step markers and a pinned action row inside a constrained width, rather than the full page a wizard usually gets. Best for two to four short steps — setup, invite, schedule, onboarding — where losing the context underneath would cost more than the flow is worth.',
  keywords: ['setup', 'invite', 'schedule', 'onboarding'],
  isReady: true,
  category: 'Form - Wizard Dialog',
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Pinned top of the dialog: DialogHeader title and close button, with the compact Stepper row below.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Scrolling dialog body in LayoutContent: the current step\'s FormLayout of fields, banner and review summary.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'Pinned LayoutFooter action row: Back button, blocked-step error message, and Continue or Schedule report button.',
    },
  ],
};
