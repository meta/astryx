// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageMetadata',
  name: 'ChatMessageMetadata',
  displayName: 'Chat Message Metadata',
  description: 'Three-message conversation showcasing error status with retry, delivery status, and full footer actions with model label.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'Chat',
    'ChatMessageMetadata',
    'Timestamp',
    'Button',
    'Icon',
    'Text',
    'Layout',
  ],
  icons: {
    ArrowPathIcon: 'refresh',
    ClipboardDocumentIcon: 'clipboard',
    HandThumbDownIcon: 'thumbsDown',
    HandThumbUpIcon: 'thumbsUp',
  },
};
