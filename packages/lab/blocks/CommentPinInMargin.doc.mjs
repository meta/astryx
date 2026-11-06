// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Host-owned placement',
  displayName: 'Comment pin in a document margin',
  description:
    'A caller-positioned CommentPin in a document margin. The host maps its anchor to the pin’s logical bottom-start corner and owns the surrounding layout; the pin owns its compact interactive surface. Activating the pin toggles its selected state.',
  exampleFor: 'CommentPin',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Card', 'CommentPin', 'Text', 'VStack'],
};
