// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentPin deprecated re-export
 * @input `@astryxdesign/core/CommentPin`
 * @output Exports CommentPin and CommentPinProps, each deprecated
 * @position Lab entry kept for one release after CommentPin moved to Core;
 *   consumed by packages/lab/src/index.ts
 */

import {
  CommentPin as CoreCommentPin,
  type CommentPinProps as CoreCommentPinProps,
} from '@astryxdesign/core/CommentPin';

/**
 * @deprecated CommentPin moved to Core: import it from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export const CommentPin = CoreCommentPin;

/**
 * @deprecated Import `CommentPinProps` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type CommentPinProps = CoreCommentPinProps;
