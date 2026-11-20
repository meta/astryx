// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A suggested command run in another folder is printed with the CLI
 * invocation chosen for that folder, not for the current one.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {setJsonMode} from '../../../foundation/response/json.mjs';

vi.mock('../../../foundation/env/package-manager.mjs', async importOriginal => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    formatCliCommand: (
      /** @type {string} */ command,
      /** @type {string} */ dir,
    ) => `RUN<${dir ?? 'here'}> ${command.replace(/^astryx\s*/, '')}`,
  };
});

const {cliError} = await import('./cli-error.mjs');

describe('cliError — a suggestion that changes folder', () => {
  /** @type {string[]} */
  let stderr;
  beforeEach(() => {
    setJsonMode(false);
    stderr = [];
    vi.spyOn(console, 'error').mockImplementation((...a) =>
      stderr.push(a.join(' ')),
    );
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('chooses the invocation for the folder after the change of folder', () => {
    expect(() =>
      cliError('Outside the project', {
        suggestions: [
          {name: 'astryx template blank src/pages/blank.tsx', reason: 'inside'},
          {
            name: "cd '/a b/it'\\''s' && astryx template blank ./x.tsx",
            reason: 'there',
          },
          {
            name: 'cd -LiteralPath C:\\w -ErrorAction Stop; astryx template blank ./x.tsx',
          },
        ],
      }),
    ).toThrow('__exit__');
    expect(stderr).toContain(
      '  RUN<here> template blank src/pages/blank.tsx  (inside)',
    );
    expect(stderr).toContain(
      "  cd '/a b/it'\\''s' && RUN</a b/it's> template blank ./x.tsx  (there)",
    );
    expect(stderr).toContain(
      '  cd -LiteralPath C:\\w -ErrorAction Stop; RUN<C:\\w> template blank ./x.tsx',
    );
  });
});
