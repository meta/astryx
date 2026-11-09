// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'cli',
  title: 'Astryx CLI',
  summary: 'Commands, APIs, and integration authoring.',
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['namespace', 'generic']},
    },
  },
  blocks: [
    {type: 'collection', source: {slot: 'guides'}, presentation: 'cards'},
  ],
};
