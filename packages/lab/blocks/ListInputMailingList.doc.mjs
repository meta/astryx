// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Mailing list',
  displayName: 'Mailing list',
  description:
    'A one-column list that starts empty, shows the empty state with Add still available, and stops adding at six addresses. A repeated address is a record error, a malformed address is a field error after blur, and removing the last address shows the required-list error.',
  exampleFor: 'ListInput',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ListInput', 'TextInput', 'VStack'],
};
