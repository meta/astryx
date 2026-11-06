// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'MetadataListItem',
  name: 'MetadataListItem — Basic',
  displayName: 'MetadataListItem — Basic',
  description:
    'A titled section of label and value rows for one record, here a deployment\'s environment, health status badge, version, and last deploy date. Values take plain text or a component such as a Badge.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['MetadataList', 'MetadataListItem', 'Badge'],
};
