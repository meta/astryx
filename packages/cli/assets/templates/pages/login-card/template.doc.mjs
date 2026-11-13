// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Login Card',
  displayName: 'Login Card',
  description:
    'Credential form inside an elevated centered card, third-party provider buttons separated from the fields by a divider, secondary sign-up and legal links beneath.',
  keywords: [
    'login',
    'sign in',
    'signin',
    'authentication',
    'credentials',
    'social',
    'account access',
  ],
  isReady: true,
  category: 'Login - Card',
  icons: {CubeIcon: 'package'},
  slots: [
    {
      name: 'brand',
      kind: 'header',
      description:
        'Top of the centered column above the card: product logo icon and company name.',
    },
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the card: welcome heading and sign-in subtitle text.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Inside the card below the header: email and password inputs, forgot-password link, and primary login button.',
    },
    {
      name: 'providers',
      kind: 'list',
      description:
        'Inside the card below the divider: secondary buttons for third-party sign-in such as Apple and Google.',
    },
    {
      name: 'signup',
      kind: 'footer',
      description:
        'Bottom of the card: sign-up prompt text and link for people without an account.',
    },
    {
      name: 'legal',
      kind: 'footer',
      description:
        'Below the card at the bottom of the column: terms of service and privacy policy links.',
    },
  ],
};
