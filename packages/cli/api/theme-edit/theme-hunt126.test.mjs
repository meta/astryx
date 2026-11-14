// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-twenty-sixth pass: every build names the pictures
 * it removed (show and the preview commands too); a picture run that stops
 * part way says which pictures it took and which it did not; a render with
 * two copies of React points at a command that lists them; the --section,
 * --top and --template suggestions come from what was typed; a base font
 * the previews cannot load is named; template pages and re-exported parts
 * bind the export their module has.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditPreviewAdd,
} from './theme-edit.mjs';
import {recordWritten} from './_settings.mjs';
import {context} from './_context.mjs';
import {pageSource} from './_catalog.mjs';
import {showcaseItems} from './_preview.mjs';
import {copiesLine} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** A valid 1x1 PNG. */
const PNG = (() => {
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
})();

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt126-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ s) => s.name);

/** Put the editor's pictures in t's folder, recorded as its own. */
function pictures() {
  const dir = path.join(cwd, 'themes/t');
  const files = ['preview.png', 'sheet-dark.png'].map(n => path.join(dir, n));
  for (const f of files) fs.writeFileSync(f, PNG);
  recordWritten(cwd, 't', files);
}

/** Change t's own source by hand, so its build no longer matches. */
function handEdit(/** @type {string} */ color) {
  const file = path.join(cwd, 'themes/t/t.theme.ts');
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(
    file,
    /'--color-background-body': '#[0-9a-f]{6}'/.test(text)
      ? text.replace(
          /'--color-background-body': '#[0-9a-f]{6}'/,
          `'--color-background-body': '${color}'`,
        )
      : text.replace(
          "name: 't',",
          `name: 't',\n  tokens: {'--color-background-body': '${color}'},`,
        ),
  );
}

describe('a build names the pictures it removed', () => {
  it('in show, after a hand edit', async () => {
    pictures();
    handEdit('#ffeeaa');
    const r = /** @type {any} */ (await themeEditShow('t', {cwd}));
    const note = r.data.notes.find((/** @type {string} */ n) =>
      n.startsWith('removed '),
    );
    expect(note).toMatch(/themes\/t\/preview\.png/);
    expect(note).toMatch(/themes\/t\/sheet-dark\.png/);
  }, 240_000);

  it('in preview add, which builds a theme that is not current first', async () => {
    fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'app/layout.tsx'),
      'export default function L({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }\n',
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    );
    pkg.dependencies = {...pkg.dependencies, next: '*'};
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
    pictures();
    handEdit('#aaeeff');
    const r = /** @type {any} */ (
      await themeEditPreviewAdd(undefined, {cwd, theme: 't'})
    );
    expect(
      r.data.notes.some((/** @type {string} */ n) =>
        /^removed .*themes\/t\/preview\.png/.test(n),
      ),
    ).toBe(true);
  }, 240_000);
});

describe('a picture run that stops part way', () => {
  const savedPath = process.env.PATH;
  afterAll(() => {
    process.env.PATH = savedPath;
    fs.rmSync(path.join(cwd, 'node_modules/playwright'), {
      recursive: true,
      force: true,
    });
  });

  it('names the pictures it took and the ones it did not', async () => {
    // A Playwright stand-in that takes the first picture, then fails.
    const pw = path.join(cwd, 'node_modules/playwright');
    fs.rmSync(pw, {recursive: true, force: true});
    fs.mkdirSync(pw, {recursive: true});
    const count = path.join(pw, 'count');
    fs.writeFileSync(
      path.join(pw, 'package.json'),
      JSON.stringify({name: 'playwright', main: 'index.js'}),
    );
    fs.writeFileSync(
      path.join(pw, 'index.js'),
      `const fs = require('fs');
       exports.chromium = {async launch() {
         const n = Number(fs.existsSync(${JSON.stringify(count)}) ? fs.readFileSync(${JSON.stringify(count)}, 'utf8') : 0) + 1;
         fs.writeFileSync(${JSON.stringify(count)}, String(n));
         if (n > 1) throw new Error('crashed on start ' + n);
         return {
           async newPage() { return {async goto() {}, async screenshot({path}) { fs.writeFileSync(path, Buffer.from(${JSON.stringify(PNG.toString('base64'))}, 'base64')); }}; },
           async close() {},
         };
       }};`,
    );
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-nochrome-'));
    process.env.PATH = `${empty}${path.delimiter}${path.dirname(process.execPath)}`;
    try {
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(r.data.pictures).toEqual(['themes/t/preview.png']);
      expect(r.data.pictureProblem).toMatch(
        /^themes\/t\/preview\.png was taken, but themes\/t\/preview-dark\.png, themes\/t\/sheet\.png, themes\/t\/sheet-dark\.png were not: .*crashed on start 2/,
      );
      expect(r.data.pictureProblem).not.toMatch(/No picture was taken/);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(empty, {recursive: true, force: true});
    }
  }, 240_000);
});

describe('suggestions from what was typed', () => {
  it('a render with two copies of React points at a command that lists them', () => {
    // The project's package manager's own listing of every copy.
    expect(copiesLine(cwd, 'react')).toMatch(
      /^(npm ls react --all|(pnpm|yarn) why react|bun pm ls --all \| grep react@)$/,
    );
  });

  it('--section offers a section only within a typo, else the whole sheet', async () => {
    const far = await refusal(() =>
      themeEditShow('t', {cwd, section: 'everything'}),
    );
    expect(names(far)).toEqual(['astryx experimental theme editor show t']);
    expect(far.message).toMatch(/show with no --section makes the whole sheet/);
    const near = await refusal(() =>
      themeEditShow('t', {cwd, section: 'input'}),
    );
    expect(names(near)).toContain(
      'astryx experimental theme editor show t --section inputs',
    );
    expect(names(near)).not.toContain(
      'astryx experimental theme editor show t --section actions',
    );
    const empty = await refusal(() => themeEditShow('t', {cwd, section: ''}));
    expect(names(empty)).toEqual(['astryx experimental theme editor show t']);
  });

  it('--top offers the exact reading, the nearest bound, or the default', async () => {
    const top = async (/** @type {string} */ v) =>
      names(
        await refusal(() =>
          themeEditPreviewAdd('a sales dashboard', {
            cwd,
            top: /** @type {any} */ (v),
          }),
        ),
      )[0];
    expect(await top('three')).toMatch(/'a sales dashboard' --top 3$/);
    expect(await top('3.0')).toMatch(/'a sales dashboard' --top 3$/);
    expect(await top('9')).toMatch(/'a sales dashboard' --top 3$/);
    expect(await top('0')).toMatch(/add 'a sales dashboard'$/);
    expect(await top('lots')).toMatch(/add 'a sales dashboard'$/);
  }, 240_000);

  it('--template offers a default page within a typo', async () => {
    for (const [typed, page] of [
      ['overveiw', 'overview'],
      ['componets', 'components'],
      ['colours', 'colors'],
    ]) {
      const e = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: typed}),
      );
      expect(names(e)).toContain(
        `astryx experimental theme preview add --template ${page}`,
      );
    }
  }, 240_000);
});

describe('fonts and sheet cells', () => {
  it("names a base font the previews cannot load from the base's remote stylesheet", async () => {
    const base = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign/theme-neutral',
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(base, 'package.json'), 'utf8'),
    );
    pkg.exports = {...pkg.exports, './fonts.css': './fonts.css'};
    fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(
      path.join(base, 'fonts.css'),
      "@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;700&display=swap');\n",
    );
    await themeEditSet('t', '--font-family-body', 'Figtree, sans-serif', {cwd});
    const r = /** @type {any} */ (await themeEditShow('t', {cwd}));
    expect(
      r.data.notes.some((/** @type {string} */ n) =>
        /^"Figtree" comes from @astryxdesign\/theme-neutral\/fonts\.css, which loads it from fonts\.googleapis\.com: .*show the next font/.test(
          n,
        ),
      ),
    ).toBe(true);
  }, 240_000);

  it("a template page binds its file's default export", () => {
    const source = pageSource({
      items: [
        {
          name: 'x template',
          label: '',
          tree: {__element: 'Template_x', props: {}},
        },
      ],
      imports: {Template_x: {from: './templates/x.tsx', export: 'default'}},
      theme: null,
      layout: 'sheet',
    });
    expect(source).toContain('"Template_x": M0["default"]');
  });

  it('a part re-exported under its own name gets its module, and a cell', async () => {
    const ctx = await context(cwd);
    expect(ctx.project.components.ContextMenuItem.importPath).toBe(
      '@astryxdesign/core/ContextMenu',
    );
    const {items, imports} = showcaseItems(ctx.project, undefined);
    expect(items.some(i => i.name === 'ContextMenuItem')).toBe(true);
    expect(imports.ContextMenuItem).toBe('@astryxdesign/core/ContextMenu');
  }, 240_000);
});
