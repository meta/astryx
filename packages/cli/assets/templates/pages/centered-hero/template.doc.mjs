// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Centered Hero',
  displayName: 'Centered Hero',
  description:
    'Symmetrical centered stack (headline, short blurb, paired call-to-action buttons) resting on one wide full-bleed picture, with nothing on either flank competing.',
  keywords: ['hero', 'banner', 'splash', 'landing image', 'marketing masthead'],
  isReady: true,
  category: 'Gallery - Hero',
  icons: {ArrowRightIcon: 'arrowRight'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Centered top stack with display headline, short blurb, and paired primary and secondary call-to-action buttons.',
    },
    {
      name: 'media',
      kind: 'content',
      description:
        'Full-width transparent Section below the header holding the wide 16:9 rounded hero image.',
    },
  ],
};
