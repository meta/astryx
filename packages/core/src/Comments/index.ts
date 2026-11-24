// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Comments barrel export
 * @input Imports Comments, CommentThread, CommentComposer, and their types
 * @output Exports the Comments family
 * @position `@astryxdesign/core/Comments` entry point; re-exported by the
 *   package root
 */

export {Comments} from './Comments';
export type {CommentsProps} from './Comments';
export {CommentThread} from './CommentThread';
export type {CommentThreadProps} from './CommentThread';
export {CommentComposer} from './CommentComposer';
export type {CommentComposerProps} from './CommentComposer';
export {COMMENT_ICON_KEYS} from './icons';
export {DEFAULT_COMMENT_REACTIONS} from './CommentsTypes';
export type {
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
} from './CommentsTypes';
