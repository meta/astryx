// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab Comments entry and the Core family
 * @output Tests that the Lab entry re-exports the Core family and its props
 * @position Testing; validates index.ts
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import * as Core from '@astryxdesign/core/Comments';
import * as Lab from './index';

const VALUES = [
  'Comments',
  'CommentThread',
  'CommentComposer',
  'DEFAULT_COMMENT_REACTIONS',
  'COMMENT_ICON_KEYS',
] as const;

describe('Lab Comments', () => {
  it('re-exports the Core family', () => {
    for (const name of VALUES) {
      expect(Lab[name], name).toBe(Core[name]);
    }
  });

  it('takes the Core props', () => {
    expectTypeOf<Lab.CommentsProps>().toEqualTypeOf<Core.CommentsProps>();
    expectTypeOf<Lab.CommentThreadProps>().toEqualTypeOf<Core.CommentThreadProps>();
    expectTypeOf<Lab.CommentComposerProps>().toEqualTypeOf<Core.CommentComposerProps>();
  });
});
