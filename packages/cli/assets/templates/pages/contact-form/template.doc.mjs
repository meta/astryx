// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Contact Form',
  displayName: 'Contact Form',
  description:
    'Flat single-column form mixing control types (text, pill toggles, dropdowns, long free-text) landing on one full-width submit. No steps, no branching, no summary rail.',
  keywords: [
    'contact',
    'lead capture',
    'enquiry',
    'survey',
    'intake form',
    'questionnaire',
    'feedback',
    'request',
    'submission',
    'entry',
    'fields',
    'upload',
  ],
  isReady: true,
  category: 'Form - Basic',
  icons: {
    AdjustmentsHorizontalIcon: 'adjustments',
    HandRaisedIcon: 'raiseHand',
    RocketLaunchIcon: 'rocket',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Centered title and subtitle at the top of the form section inviting the visitor to get in touch.',
    },
    {
      name: 'highlights',
      kind: 'list',
      description:
        'Grid of three icon cards below the header explaining why to work with us.',
    },
    {
      name: 'details',
      kind: 'form',
      description:
        'Two-column grid of text inputs for name, email, company and phone, above the divider.',
    },
    {
      name: 'project',
      kind: 'form',
      description:
        'Below the divider: goal tokens, timeline and budget selectors, referral radios, message textarea, decision-maker checkbox.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'Bottom of the form: full-width primary submit button with privacy policy note.',
    },
  ],
};
