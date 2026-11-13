// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Login SSO',
  displayName: 'Login SSO',
  description:
    'Progressive credential flow that branches on input: the email domain resolves an identity provider and redirects, with a password path as fallback. Two-stage rather than one form.',
  keywords: [
    'single sign-on',
    'sso',
    'saml',
    'enterprise login',
    'directory',
    'corporate authentication',
  ],
  isReady: true,
  category: 'Login - SSO',
  icons: {ShieldCheckIcon: 'shield'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the centered login card: title and subtitle per step, or the detected provider\'s avatar and name.',
    },
    {
      name: 'credentials',
      kind: 'form',
      description:
        'Middle of the card: email and password fields, the SSO provider summary, and sign-in or continue buttons.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'Bottom of the card: request-access link, or the use-a-different-email back action on later steps.',
    },
  ],
};
