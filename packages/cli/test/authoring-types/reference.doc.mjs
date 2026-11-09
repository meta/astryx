// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'deploying',
  title: 'Deploying',
  description: 'Ship an app that uses Astryx.',
  category: 'guide',
  sections: [
    {
      id: 'build',
      title: 'Build',
      content: [
        {type: 'prose', text: 'Build the app, then build the theme.'},
        {type: 'code', lang: 'bash', code: 'npx astryx theme build'},
      ],
    },
    {
      title: 'Checklist',
      content: [
        {type: 'list', style: 'ordered', items: ['Build', 'Test', 'Ship']},
      ],
    },
  ],
};
