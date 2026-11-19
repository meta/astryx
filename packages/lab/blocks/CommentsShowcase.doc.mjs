// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Comments panel',
  displayName: 'Comments panel',
  description:
    'A working Comments panel: threads with replies, reactions, edit history, controlled typing with hidden seen metadata, inline comments, a non-interrupting unread-reply reveal, an agent reply still being written, a resolved thread, a comment that failed to send, activity events, and earlier comments to load. Post, reply, react, edit, delete, and resolve; the host updates the controlled comments.',
  exampleFor: 'Comments',
  isReady: true,
  isShowcase: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['Comments', 'VStack'],
};
