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
};
