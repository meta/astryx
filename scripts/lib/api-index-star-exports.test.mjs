// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Mutation coverage for the api/index.mjs star re-export rule. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {runtimeStarExports} from './api-index-star-exports.mjs';

const API_INDEX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../packages/cli/api/index.mjs',
);
const NAMED = "export {themeAdd} from './theme/add/add.mjs';\n";

describe('runtimeStarExports', () => {
  it('accepts the current public API entry', () => {
    expect(runtimeStarExports(fs.readFileSync(API_INDEX, 'utf8'))).toEqual([]);
  });

  it('accepts star re-exports and namespace imports of type modules', () => {
    expect(
      runtimeStarExports(
        `${NAMED}export * from './theme/theme.type.mjs';\nimport * as types from './theme/theme.type.mjs';\n`,
      ),
    ).toEqual([]);
  });

  it.each([
    ["export * from './theme/theme.mjs';", './theme/theme.mjs'],
    ['export * as theme from "./theme/theme.mjs";', './theme/theme.mjs'],
    ["export*from'./theme/_adapter.mjs'", './theme/_adapter.mjs'],
    [
      "import * as theme from './theme/theme.mjs';\nexport {theme};",
      './theme/theme.mjs',
    ],
    [
      "export * from './theme/theme.mjs?x.type.mjs';",
      './theme/theme.mjs?x.type.mjs',
    ],
  ])('rejects %s', (line, specifier) => {
    expect(runtimeStarExports(`${NAMED}${line}\n`)).toEqual([specifier]);
  });

  it('ignores commented-out lines', () => {
    expect(
      runtimeStarExports(
        "// export * from './theme/theme.mjs';\n/* export * from './theme/_adapter.mjs'; */\n",
      ),
    ).toEqual([]);
  });
});
