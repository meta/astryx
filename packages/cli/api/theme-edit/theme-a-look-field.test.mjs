// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `show`'s `look` (the two pictures to open) is in the result only
 * when the run took pictures, as its type says, and the response types
 * doc says the same: left out, never null, when none was taken.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = 240_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-a-look-field-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe("show's look", () => {
  it(
    'is left out when no picture was taken',
    async () => {
      const data = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
      expect(Object.hasOwn(data, 'look')).toBe(false);
    },
    T,
  );

  it('is documented as left out, as its type has it', () => {
    const types = fs.readFileSync(
      path.join(HERE, '../../foundation/response/response-types.doc.mjs'),
      'utf8',
    );
    expect(types).toContain('(`look`, left out when none was taken)');
    expect(types).not.toMatch(/`look`, null/);
    const type = fs.readFileSync(
      path.join(HERE, 'theme-edit.type.mjs'),
      'utf8',
    );
    expect(type).toMatch(/@property \{string\} \[data\.look\]/);
  });
});
