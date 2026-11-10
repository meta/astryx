// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Avatar-first annotations',
  displayName: 'Avatar-first annotations',
  description:
    'Caller-positioned comment pins over media and in a content margin. Every coordinate maps to the pin’s logical bottom-start corner. The selected group caps its participants at three circles (two Avatars plus an ellipsis) and ends with its total and an accent unread dot; the unread margin pin shows the dot too. Other pins dim without becoming disabled, activating the selected pin again clears the selection, and no pin dims while nothing is selected.',
  exampleFor: 'CommentPin',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CommentPin', 'Text', 'VStack'],
};
