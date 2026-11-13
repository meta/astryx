// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Two-column Form',
  displayName: 'Two-column Form',
  description:
    'Form split into two columns beneath a hero header: inputs on one flank, a persistent context panel opposite that stays put while the fields scroll. Flat, single submit, no steps.',
  keywords: [
    'contact',
    'lead capture',
    'intake',
    'request',
    'enquiry form',
    'configurator',
    'generator',
    'launcher',
    'calculator',
    'checklist',
    'upload',
    'live preview',
    'side panel',
  ],
  isReady: true,
  category: 'Form - Two-column',
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the left column: display headline and supporting description introducing the contact form.',
    },
    {
      name: 'illustration',
      kind: 'content',
      description:
        'Left column below the headline: 4:3 cover image that stays beside the form as context.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Right column card: contact inputs, inquiry reason tokens, budget selector, details textarea and submit button.',
    },
    {
      name: 'contacts',
      kind: 'footer',
      description:
        'Bottom strip below a divider: three centered columns of contact labels and email links.',
    },
  ],
};
