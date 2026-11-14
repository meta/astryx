// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';

vi.mock('../_adapter.mjs', async importOriginal => ({
  ...(await importOriginal()),
  loadShellWeights: () => null,
}));

const {build} = await import('../build.mjs');
const {hasEditPhrase} = await import('./shellcall.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

describe('shell-start check without its word table', () => {
  it('still keeps the shell for an idea with an edit phrase', async () => {
    const idea =
      'existing support inbox with filters, tags, assignees, and saved views';
    expect(hasEditPhrase(idea)).toBe(true);
    const r = await build(idea, {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.start?.name).toBe('shell-top-nav');
  });
});
