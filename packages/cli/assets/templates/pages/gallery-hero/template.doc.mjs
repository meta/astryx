// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Gallery Hero',
  displayName: 'Gallery Hero',
  description:
    'Centered stack (headline, short blurb, call-to-action buttons) resolving into a multi-image photo grid rather than one wide full-bleed picture, so the imagery reads as a set.',
  keywords: [
    'hero',
    'banner',
    'splash',
    'landing image',
    'masthead',
    'gallery intro',
  ],
  isReady: true,
  category: 'Gallery - Hero',
  icons: {ArrowRightIcon: 'arrowRight'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Centered top stack with the display headline, short blurb, and primary and secondary call-to-action buttons.',
    },
    {
      name: 'gallery',
      kind: 'list',
      description:
        'Responsive photo grid below the header showing a set of 4:5 rounded images.',
    },
  ],
};
