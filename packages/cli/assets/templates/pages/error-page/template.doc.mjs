// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Error Page',
  displayName: 'Error Page',
  description:
    'Recovery page for when a page fails to load. It shows a warning message with a "Try again" button that reloads the page, a "Check connection" button that shows whether the browser is online, and a collapsible details section with the error code, reference ID, time and a contact-support button.',
  keywords: [
    'load failure',
    'something went wrong',
    'service unavailable',
    'error details',
    'error reference',
  ],
  isReady: false,
  category: 'Status - Error',
  icons: {
    ExclamationTriangleIcon: 'warning',
  },
};
