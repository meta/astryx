// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-fourth pass over `astryx experimental theme editor`: a
 * no-op show renders nothing again, outputs that cannot be read are refused
 * by name, every generated file counts for staleness, and a hand edit
 * inside the generated settings module is built over.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

const renders = vi.hoisted(() => ({count: 0}));
vi.mock('./_parts.mjs', async importOriginal => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    renderGenerated: async (/** @type {any[]} */ ...args) => {
      renders.count += 1;
      return actual.renderGenerated(...args);
    },
  };
});
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt24-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt24', () => {
  it('PERF: a show whose inputs match its last render renders nothing again', async () => {
    await themeEditNew('p', {cwd});
    await withRealRenders(async () => {
      await themeEditShow('p', {cwd});
      const html = fs.readFileSync(at('p', 'sheet.html'), 'utf8');
      expect(html).toMatch(
        /<!-- astryx: render of [0-9a-f]{24} [0-9a-f]{16} -->/,
      );
      renders.count = 0;
      await themeEditShow('p', {cwd});
      expect(renders.count).toBe(0);
      // A change renders again.
      await themeEditSet('p', 'corners', 'pill', {cwd});
      renders.count = 0;
      await themeEditShow('p', {cwd});
      expect(renders.count).toBeGreaterThan(0);
    });
  }, 480_000);

  it('(1) an output that cannot be read, or a folder in its place, is refused by name', async () => {
    await themeEditNew('u', {cwd});
    fs.rmSync(at('u', 'u.d.ts'));
    fs.mkdirSync(at('u', 'u.d.ts'));
    const dir = await refusal(() => themeEditShow('u', {cwd}));
    expect(dir.code).toBe('ERR_FILE_EXISTS');
    expect(dir.message).toMatch(/themes\/u\/u\.d\.ts is a folder/);
    expect(dir.run[0]).toBe('ls -la themes/u/u.d.ts');
    fs.rmdirSync(at('u', 'u.d.ts'));
  }, 240_000);

  it('(4) a missing generated palette-refs module is built again', async () => {
    await themeEditNew('c', {cwd});
    await themeEditSet('c', 'accent', '#3366ff', {cwd});
    const refs = at('c', 'tokens/c.palette-refs.ts');
    fs.rmSync(refs);
    const r = await themeEditShow('c', {cwd});
    expect(JSON.stringify(r.data)).toMatch(/c\.palette-refs\.ts was missing/);
    expect(fs.existsSync(refs)).toBe(true);
  }, 240_000);

  it('(5) a hand edit inside the generated settings module is built over', async () => {
    await themeEditNew('m', {cwd});
    await themeEditSet('m', 'corners', 'large', {cwd});
    const ts = at('m', 'm.settings.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(/"--radius-page": "\d+px"/, '"--radius-page": "99px"'),
    );
    const r = await themeEditShow('m', {cwd});
    expect(JSON.stringify(r.data)).toMatch(
      /m\.settings\.ts was edited by hand/,
    );
    expect(fs.readFileSync(ts, 'utf8')).not.toMatch(/99px/);
  }, 240_000);
});
