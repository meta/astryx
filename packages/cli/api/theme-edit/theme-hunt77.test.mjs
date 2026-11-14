// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventy-seventh pass: the preview follows through. Pictures a
 * plain Chrome took are not a failed run; the see line names a command
 * that only takes pictures; a picture's part file is one of the editor's
 * temp files; a folder where a part goes is not a crash; the in-app route
 * that cannot be written, a damaged preview record and a preview Next does
 * not serve are all said; and the app copy of a theme takes no pictures.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
  themeEditPreviewAdd,
  themeEditPreviewApp,
} from './theme-edit.mjs';
import {isEditorTemp} from './_palette.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal => {
  const original = /** @type {any} */ (await importOriginal());
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(original);
  return {
    ...stubbed,
    /** A picture stand-in: a tiny PNG at the path asked for. */
    async screenshot(
      /** @type {any} */ project,
      /** @type {string} */ html,
      /** @type {string} */ png,
    ) {
      fs.writeFileSync(
        png,
        Buffer.from(
          '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
            '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
          'hex',
        ),
      );
      return {ok: true, file: path.relative(project.cwd, png)};
    },
  };
});

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt77-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('pictures and the see line', () => {
  it('pictures that were taken are no failed run', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#2563eb', {cwd, png: true})
    );
    expect(r.data.pictures.length).toBeGreaterThan(0);
    expect(r.data.see).not.toMatch(/took no pictures/);
  }, 240_000);

  it('after undo, the see line names show --png, never the undo again', async () => {
    await themeEditSet('t', 'corners', 'pill', {cwd});
    const r = /** @type {any} */ (await themeEditUndo('t', {cwd}));
    expect(r.data.see).toMatch(/editor show t --png takes pictures/);
    expect(r.data.see).not.toMatch(/run it with --png/);
  }, 240_000);

  it("a picture's part file is one of the editor's temp files", () => {
    expect(isEditorTemp('.preview.part-1234.png')).toBe(true);
    expect(isEditorTemp('.sheet-dark.part-9.png')).toBe(true);
    expect(isEditorTemp('preview.png')).toBe(false);
  });

  it('a folder named like a part file is no crash', async () => {
    const odd = path.join(cwd, 'themes/t/.preview.part-1.png');
    fs.mkdirSync(odd, {recursive: true});
    try {
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(r.type).toBe('themeEdit.show');
      expect(fs.existsSync(odd)).toBe(true);
    } finally {
      fs.rmSync(odd, {recursive: true, force: true});
    }
  }, 240_000);
});

describe('the in-app preview', () => {
  it('a route that cannot be written is named in previewStale and the see line', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    const dir = path.join(cwd, 'src/app/theme-preview');
    const page = path.join(dir, 'page.tsx');
    fs.chmodSync(page, 0o444);
    fs.chmodSync(dir, 0o555);
    try {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'mode', 'dark-only', {cwd})
      );
      expect(r.data.previewStale.join('\n')).toMatch(/could not be written/);
      expect(r.data.see).not.toMatch(/in the running app/);
    } finally {
      fs.chmodSync(dir, 0o755);
      fs.chmodSync(page, 0o644);
      await themeEditSet('t', 'mode', 'both', {cwd});
    }
  }, 240_000);

  it('a damaged preview record is named, with no add tip', async () => {
    const rec = path.join(cwd, 'src/app/theme-preview/theme-preview.json');
    const before = fs.readFileSync(rec, 'utf8');
    fs.writeFileSync(rec, '{ broken');
    try {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#16a34a', {cwd})
      );
      expect(r.data.see).toMatch(/has a damaged theme-preview\.json/);
      expect(r.data.see).not.toMatch(/puts the preview pages there/);
    } finally {
      fs.writeFileSync(rec, before);
    }
  }, 240_000);

  it('a preview in src/app/ under a root app/ gets no URL', async () => {
    fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'app/layout.tsx'),
      'export default function L({children}) { return children; }\n',
    );
    try {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#dc2626', {cwd})
      );
      expect(r.data.see).not.toMatch(/\/theme-preview\?page=/);
      expect(r.data.see).toMatch(/which the app does not serve/);
    } finally {
      fs.rmSync(path.join(cwd, 'app'), {recursive: true, force: true});
    }
  }, 240_000);

  it('the app copy of a theme takes none of its pictures or pages', async () => {
    await themeEditShow('t', {cwd, png: true});
    fs.writeFileSync(path.join(cwd, 'themes/t/.preview.part-77.png'), 'x');
    await themeEditPreviewApp('my-app', {cwd, theme: 't'});
    const copied = fs.readdirSync(path.join(cwd, 'my-app/themes/t'));
    expect(copied.filter(n => /\.(png|html)$/.test(n))).toEqual([]);
    expect(copied).not.toContain('t.pictures.json');
  }, 240_000);

  it('from a subfolder, the pictures and previewStale use absolute paths like see', async () => {
    const dir = path.join(cwd, 'src/app/theme-preview');
    const page = path.join(dir, 'page.tsx');
    fs.chmodSync(page, 0o444);
    fs.chmodSync(dir, 0o555);
    try {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'mode', 'dark-only', {
          cwd: path.join(cwd, 'src/app'),
          png: true,
        })
      );
      expect(r.data.pictures.length).toBeGreaterThan(0);
      for (const p of r.data.pictures)
        expect(p).toContain(path.join(cwd, 'themes/t/'));
      const stale = r.data.previewStale.join('\n');
      expect(stale).toContain(path.join(cwd, 'src/app/theme-preview'));
      expect(stale).not.toMatch(/(^|[\s(,])src\/app\//);
      expect(r.data.see).toContain(path.join(cwd, 'themes/t/preview.html'));
    } finally {
      fs.chmodSync(dir, 0o755);
      fs.chmodSync(page, 0o644);
      await themeEditSet('t', 'mode', 'both', {cwd});
    }
  }, 240_000);
});
