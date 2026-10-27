// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file List.exports.test.ts
 * @input vitest, core's package.json and the List entry point (index.ts)
 * @output Asserts the selection hold stays internal: `@astryxdesign/core/List`
 *   exports no `holdSelection`, and core's `exports` do not list
 *   selectionHold.ts (`architecture:public-component-api` INV12)
 * @position Unit test beside List/index.ts
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import * as list from './index';

describe('the selection hold stays internal', () => {
  it('is not exported from @astryxdesign/core/List', () => {
    expect(list).not.toHaveProperty('holdSelection');
  });

  it('lives in a module that core’s exports do not list', () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'packages/core/package.json'), 'utf8'),
    ) as {exports: Record<string, string | {source?: string}>};
    const sources = Object.values(pkg.exports).map(entry =>
      typeof entry === 'string' ? entry : entry.source,
    );
    expect(sources).not.toContain('./src/List/selectionHold.ts');
  });
});
