// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every field `themeBuild()` returns is named in its FunctionDoc and in the
 * response-types doc.
 *
 * The receipt is a stable machine-readable response, so each field needs
 * consumer documentation, not only a typedef. The fields are read off a real
 * build, so a field added to the receipt without documentation fails here.
 */

import {describe, it, expect, beforeAll, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';
import {doc} from '../themeBuild.doc.mjs';
import {doc as responseTypes} from '../../../foundation/response/response-types.doc.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

/** @type {string[]} */
const dirs = [];

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/** @returns {string} a temp dir holding a theme that exercises every field */
function themeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-receipt-doc-'));
  dirs.push(dir);
  fs.writeFileSync(
    path.join(dir, 'ocean.mjs'),
    `export default {
  name: 'ocean',
  tokens: {'--color-background-body': '#ffffff', '--font-family-body': '"Inter", sans-serif'},
  components: {progressbar: {base: {color: 'red'}}},
};
`,
  );
  return dir;
}

/** @param {string} type */
function returnsDescription(type) {
  const entry = doc.returns?.find(r => r.type === type);
  expect(entry, `themeBuild doc has no ${type} return`).toBeDefined();
  return /** @type {{description: string}} */ (entry).description;
}

/** @param {string} description @param {string[]} fields */
function undocumented(description, fields) {
  return fields.filter(
    field => !new RegExp(String.raw`\b${field}\b`).test(description),
  );
}

describe('themeBuild() consumer docs name every receipt field', () => {
  it('theme.build', async () => {
    const dir = themeDir();
    const result = await themeBuild('ocean.mjs', {}, {cwd: dir});

    expect(result?.type).toBe('theme.build');
    const data = /** @type {Record<string, any>} */ (result?.data);
    // The theme is chosen so the optional arrays are non-empty.
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.notices.length).toBeGreaterThan(0);

    const fields = [
      ...Object.keys(data),
      ...Object.keys(data.outputs),
      'variantsDts',
    ];
    expect(undocumented(returnsDescription('theme.build'), fields)).toEqual([]);
  });

  it('theme.build in the response-types doc', async () => {
    const dir = themeDir();
    const result = await themeBuild('ocean.mjs', {}, {cwd: dir});
    const data = /** @type {Record<string, any>} */ (result?.data);
    const member = responseTypes.members.find(m => m.value === 'theme.build');
    expect(member, 'response-types has no theme.build member').toBeDefined();

    const fields = [
      ...Object.keys(data),
      ...Object.keys(data.outputs),
      'variantsDts',
    ];
    expect(
      undocumented(/** @type {{description: string}} */ (member).description, fields),
    ).toEqual([]);
  });

  it('theme.build.check', async () => {
    const dir = themeDir();
    const result = await themeBuild('ocean.mjs', {check: true}, {cwd: dir});

    expect(result?.type).toBe('theme.build.check');
    const data = /** @type {Record<string, any>} */ (result?.data);
    const fields = [...Object.keys(data), ...Object.keys(data.stale[0])];
    expect(
      undocumented(returnsDescription('theme.build.check'), fields),
    ).toEqual([]);
  });
});
