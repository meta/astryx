// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab CommentPin entry and the Core component
 * @output Tests that the Lab entry re-exports the Core component, deprecated
 * @position Testing; validates index.ts
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {CommentPin as CoreCommentPin} from '@astryxdesign/core/CommentPin';
import {CommentPin} from './index';

describe('Lab CommentPin', () => {
  it('is the Core component', () => {
    expect(CommentPin).toBe(CoreCommentPin);
  });

  it('marks each of its exports deprecated', () => {
    // Static metadata only: editors and type checkers show it, and nothing
    // warns at runtime.
    const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
    for (const name of ['CommentPin', 'CommentPinProps']) {
      // The doc comment right above the export, whatever it contains.
      const comment = new RegExp(
        String.raw`/\*\*((?:(?!\*/)[\s\S])*)\*/\nexport (?:const|type) ${name}\b`,
      ).exec(source);
      expect(comment?.[1], name).toContain('@deprecated');
    }
  });
});
