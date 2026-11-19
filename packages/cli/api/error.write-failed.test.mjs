// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `writeFailed`: the code, the errno and its reason, the outcome, and
 * the wording a caller outside a project gives (`shown`, `what`, `outcome`,
 * `next`).
 */

import {describe, expect, it} from 'vitest';
import {writeFailed} from './error.mjs';

describe('writeFailed', () => {
  it('names the target relative to the project, the errno, and that nothing was written', () => {
    const err = writeFailed('/p/src/x.tsx', '/p', {code: 'EACCES'});
    expect(err.code).toBe('ERR_WRITE_FAILED');
    expect(err.message).toBe('Could not write src/x.tsx: EACCES (no permission). Nothing was written.');
  });

  it('names a read-only file system', () => {
    expect(writeFailed('/p/x', '/p', {code: 'EROFS'}).message).toContain('EROFS (read-only file system)');
  });

  it('takes a caller\'s own wording for the target, the act, the outcome, and the next step', () => {
    const err = writeFailed('/h/.agents/skills/astryx', '/h', {code: 'EROFS'}, [], {
      shown: 'the text at ~/.agents/skills/astryx',
      what: 'remove',
      outcome: 'Already removed: ~/.claude/skills/astryx.',
      next: 'Run it again where the folder can be written.',
    });
    expect(err.message).toBe(
      'Could not remove the text at ~/.agents/skills/astryx: EROFS (read-only file system). Already removed: ~/.claude/skills/astryx. Run it again where the folder can be written.',
    );
  });
});
