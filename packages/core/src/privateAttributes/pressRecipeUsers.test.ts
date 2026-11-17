// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/pressRecipeUsers.test.ts
 * @input The source of components that paint a press through a recipe
 * @output Verifies each listed component reads no press selector of its own
 * @position Review guard: the recipe modules beside this file own every
 *   press selector
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/** The press attribute, or `:active`, as a style key. */
const PRESS_SELECTOR =
  /data-astryx-press|['"`]:active['"`]|ancestor\(\s*['"`]:active/;

/** Components that paint their press only through a recipe export. */
const RECIPE_USERS = ['TabList/Tab.tsx'];

describe('press recipe users', () => {
  it.each(RECIPE_USERS)('%s reads no press selector of its own', file => {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    const lines = source
      .split('\n')
      .map((line, index) => ({line, number: index + 1}))
      .filter(({line}) => PRESS_SELECTOR.test(line));
    expect(lines).toEqual([]);
  });
});
