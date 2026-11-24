// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Comments re-export
 * @input `@astryxdesign/core/Comments`
 * @output Re-exports Comments, CommentThread, CommentComposer, their constants,
 *   and their types from Core
 * @position Lab entry for callers that import the family from Lab; consumed by
 *   packages/lab/src/index.ts
 */

export {
  Comments,
  CommentThread,
  CommentComposer,
  DEFAULT_COMMENT_REACTIONS,
  COMMENT_ICON_KEYS,
} from '@astryxdesign/core/Comments';
export type {
  CommentsProps,
  CommentThreadProps,
  CommentComposerProps,
  CommentAgentCommand,
  CommentAnchor,
  CommentComposerContext,
  CommentComposerRenderProps,
  CommentData,
  CommentEmojiPickerRenderProps,
  CommentStatus,
  CommentHighlightColor,
  CommentImageUploader,
  CommentMode,
  CommentProgress,
  CommentReaction,
  CommentReactionOption,
  CommentThreadData,
  CommentThreadSharedProps,
  CommentTypingIndicatorRenderProps,
  CommentUploadedImage,
  CommentUser,
  CommentVersion,
  CommentActivityEvent,
} from '@astryxdesign/core/Comments';
