// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab CommentPin entry and the Core component
 * @output Tests that the Lab entry re-exports the Core component and its props
 * @position Testing; validates index.ts
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  CommentPin as CoreCommentPin,
  type CommentPinProps as CoreCommentPinProps,
} from '@astryxdesign/core/CommentPin';
import {CommentPin, type CommentPinProps} from './index';

describe('Lab CommentPin', () => {
  it('is the Core component', () => {
    expect(CommentPin).toBe(CoreCommentPin);
  });

  it('takes the Core props', () => {
    expectTypeOf<CommentPinProps>().toEqualTypeOf<CoreCommentPinProps>();
  });
});
