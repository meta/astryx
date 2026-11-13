// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Basic Login',
  displayName: 'Basic Login',
  description:
    'Minimal centered credential form on a plain ground: two fields and a submit, nothing competing for attention. The least-chrome entry surface.',
  keywords: [
    'login',
    'sign in',
    'signin',
    'authentication',
    'credentials',
    'account access',
  ],
  isReady: true,
  isHiddenFromOverview: true,
  category: 'Login - Basic',
  icons: {CubeIcon: 'package'},
  slots: [
    {
      name: 'brand',
      kind: 'header',
      description:
        'Top of the centered column: product logo icon and product name above the sign-in card.',
    },
    {
      name: 'alerts',
      kind: 'feedback',
      description:
        'Inside the card below the heading: error banner shown when sign-in validation fails.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Centered card body: Sign in heading, email and password inputs, and the primary submit button.',
    },
  ],
};
