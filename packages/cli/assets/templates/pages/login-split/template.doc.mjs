// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Login Split',
  displayName: 'Login Split',
  description:
    'Credential form filling one half of a two-pane split, full-bleed media holding the other. Same fields as the card variant, but the layout carries brand imagery.',
  keywords: [
    'login',
    'sign in',
    'signin',
    'authentication',
    'credentials',
    'account access',
  ],
  isReady: true,
  category: 'Login - Split',
  icons: {CheckCircleIcon: 'success', SquaresPlusIcon: 'apps'},
  slots: [
    {
      name: 'brand',
      kind: 'header',
      description:
        'Top of the form pane: product icon and company name row above the sign-in form.',
    },
    {
      name: 'form',
      kind: 'form',
      description:
        'Centered in the form pane: welcome heading, email and password fields, login button, social sign-in buttons.',
    },
    {
      name: 'signup',
      kind: 'footer',
      description:
        'Bottom of the form pane: \'Don\'t have an account? Sign up\' prompt with link.',
    },
    {
      name: 'media',
      kind: 'content',
      description:
        'Second grid column beside the form: full-bleed cover image inside a transparent card.',
    },
    {
      name: 'legal',
      kind: 'footer',
      description:
        'Below the split card, centered: terms of service and privacy policy agreement text.',
    },
  ],
};
