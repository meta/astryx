// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useStreamingText',
  name: 'useStreamingText — Streaming Response',
  displayName: 'useStreamingText — Streaming Response',
  description:
    'A chat-style reply card: while the response streams in bursts, useStreamingText reveals it steadily character by character; when streaming ends the full text snaps into place. Regenerate replays the stream.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Button', 'Card', 'Text', 'Layout'],
};
