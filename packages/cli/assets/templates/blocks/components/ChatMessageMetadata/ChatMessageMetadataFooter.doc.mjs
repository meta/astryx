// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageMetadata',
  name: 'ChatMessageMetadata — Footer Actions',
  displayName: 'ChatMessageMetadata — Footer Actions',
  description: 'Assistant message with footer actions: copy, retry, thumbs up/down, and model label. Use for AI responses that need feedback or utility controls.',
  isReady: true,
  aspectRatio: 16 / 9,
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
