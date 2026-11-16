// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme add` of a name no theme it finds has: the refusal says where a
 * theme you wrote must live to be added by name, and that a theme you built
 * elsewhere needs only its imports, before the themes it does find.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeAdd} from './add.mjs';

/** @type {string} */
let dir;
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-add-own-')),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"app","private":true}\n',
  );
});
afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

describe('theme add of a theme you wrote and built elsewhere', () => {
  it('says where an addable theme lives, and leads with the doc that shows it', async () => {
    fs.mkdirSync(path.join(dir, 'src/theme'), {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'src/theme/brand.ts'),
      "export default {name: 'brand', tokens: {}};\n",
    );
    /** @type {any} */
    let err;
    try {
      await themeAdd('brand', {cwd: dir});
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('ERR_UNKNOWN_THEME');
    expect(err.message).toContain(
      'Unknown theme "brand". A theme you wrote is added by name from ./src/themes/<slug>/, where a theme source sits beside a same-stem .doc.mjs descriptor',
    );
    expect(err.message).toContain(
      'a theme you built elsewhere needs no add: import its built module and stylesheet in your app',
    );
    expect(err.suggestions[0].name).toMatch(
      / docs author-a-theme creating-a-custom-theme$/,
    );
  });

  it('with --package, names the package only', async () => {
    /** @type {any} */
    let err;
    try {
      await themeAdd('brand', {cwd: dir, package: '@acme/themes'});
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('ERR_UNKNOWN_THEME');
    expect(err.message).toBe(
      'Unknown theme "brand" in package "@acme/themes".',
    );
  });
});
