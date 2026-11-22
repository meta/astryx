// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `--pictures` on an export: the one line it says when no
 * browser is there (first: Node remembers where a package resolved), the
 * pictures it takes of the written file with a browser on the machine, the
 * refusal with `--reverse`, and an export without the flag, which takes no
 * pictures and says nothing new.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);

const PAGE = `import {Heading, Text} from '@astryxdesign/core/Text';

export default function Page() {
  return (
    <main>
      <Heading level={1}>Pictured</Heading>
      <Text>One page.</Text>
    </main>
  );
}
`;

/** @type {string} */
let dir;
/** @type {string | undefined} */
let pathBefore;
/** A folder with no browser in it, for PATH. */
let noBrowser = '';

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/**
 * A Playwright stand-in in the fixture: each page it opens records its
 * window and color scheme in `opened.json`, and each picture writes a PNG.
 */
function fakePlaywright() {
  const pw = path.join(dir, 'node_modules/playwright');
  fs.mkdirSync(pw, {recursive: true});
  const log = path.join(pw, 'opened.json');
  fs.writeFileSync(path.join(pw, 'package.json'), JSON.stringify({name: 'playwright', main: 'index.js'}));
  fs.writeFileSync(
    path.join(pw, 'index.js'),
    `const fs = require('fs');
     const log = ${JSON.stringify(log)};
     exports.chromium = {async launch() {
       return {
         async newPage(options) {
           const seen = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
           seen.push(options);
           fs.writeFileSync(log, JSON.stringify(seen));
           return {async route() {}, async goto() {}, async evaluate() {}, context() { return {async newCDPSession() { throw new Error('none'); }}; },
             async screenshot({path}) { fs.writeFileSync(path, Buffer.from(${JSON.stringify(PNG.toString('base64'))}, 'base64')); },
             async close() {}};
         },
         async close() {},
       };
     }};`,
  );
  return log;
}

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-pictures-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
  put('src/page.tsx', PAGE);
  noBrowser = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-nobrowser-'));
  pathBefore = process.env.PATH;
}, 60_000);

afterEach(() => {
  process.env.PATH = pathBefore;
  fs.rmSync(path.join(dir, 'node_modules/playwright'), {recursive: true, force: true});
});

afterAll(() => {
  removeLinkedFixture(dir);
  fs.rmSync(noBrowser, {recursive: true, force: true});
});

describe('render(): pictures of the written file', () => {
  // A Chrome at a fixed place (macOS, Windows) or beside Node is found
  // whatever PATH says, so only Linux, with an empty PATH, has no browser.
  it.skipIf(process.platform !== 'linux')('says in one line why there are no pictures when no browser is there, and writes the file as usual', async () => {
    process.env.PATH = noBrowser;
    const r = /** @type {any} */ (await render('src/page.tsx', {cwd: dir, out: 'bare.html', pictures: true}));
    expect(fs.existsSync(path.join(dir, 'bare.html'))).toBe(true);
    expect(r.data.pictures).toEqual({
      skipped: 'no browser was found; install Playwright with its browser, or Google Chrome or Chromium',
    });
    const cli = await runCli(['experimental', 'export', 'src/page.tsx', '--out', 'bare2.html', '--pictures'], dir);
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/^Pictures$/m);
    expect(cli.stdout).toMatch(/^skipped:\s+no browser was found; install Playwright with its browser, or Google Chrome or Chromium$/m);
  }, 120_000);

  it('takes a phone picture in light and dark and a desktop one, in a temp folder, and lists them under their JSON keys', async () => {
    const log = fakePlaywright();
    const r = /** @type {any} */ (await render('src/page.tsx', {cwd: dir, out: 'page.html', pictures: true}));
    const {phone, phoneDark, desktop} = r.data.pictures;
    for (const png of [phone, phoneDark, desktop]) {
      expect(path.isAbsolute(png)).toBe(true);
      expect(png.startsWith(fs.realpathSync(os.tmpdir())) || png.startsWith(os.tmpdir())).toBe(true);
      expect(fs.readFileSync(png)).toEqual(PNG);
    }
    expect(path.basename(phone)).toBe('page-phone.png');
    expect(path.basename(phoneDark)).toBe('page-phone-dark.png');
    expect(path.basename(desktop)).toBe('page-desktop.png');
    // Never beside the file it pictures.
    expect(fs.readdirSync(dir).filter(f => f.endsWith('.png'))).toEqual([]);
    const opened = JSON.parse(fs.readFileSync(log, 'utf8'));
    expect(
      opened.map((/** @type {any} */ o) => [o.viewport.width, o.viewport.height, o.colorScheme, Boolean(o.isMobile), Boolean(o.hasTouch)]),
    ).toEqual([
      [375, 812, 'light', true, true],
      [375, 812, 'dark', true, true],
      [1280, 900, 'light', false, false],
    ]);
    fs.rmSync(path.dirname(phone), {recursive: true, force: true});

    // With --title too: both hold, and the pictures are of the titled file.
    fs.rmSync(log, {force: true});
    const cli = await runCli(['experimental', 'export', 'src/page.tsx', '--out', 'cli.html', '--title', 'Titled', '--pictures'], dir);
    expect(cli.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'cli.html'), 'utf8')).toContain('<title>Titled</title>');
    expect(cli.stdout).toMatch(/^Pictures$/m);
    const cliPhone = /^phone:\s+(\S+cli-phone\.png)$/m.exec(cli.stdout)?.[1] ?? '';
    expect(cliPhone).not.toBe('');
    expect(cli.stdout).toMatch(/^phoneDark:\s+\S+cli-phone-dark\.png$/m);
    expect(cli.stdout).toMatch(/^desktop:\s+\S+cli-desktop\.png$/m);
    expect(cli.stdout).toContain('These pictures are to check how the file looks, not to send.');
    fs.rmSync(path.dirname(cliPhone), {recursive: true, force: true});
    expect(JSON.parse(fs.readFileSync(log, 'utf8'))).toHaveLength(3);
  }, 120_000);

  it('refuses pictures with --reverse', async () => {
    await render('src/page.tsx', {cwd: dir, out: 'back.html'});
    /** @type {any} */
    let refused;
    try {
      await render('back.html', {cwd: dir, reverse: true, pictures: true});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_INVALID_ARGUMENT');
    expect(refused?.message).toBe('--pictures applies only to exporting, not to --reverse');
  }, 120_000);

  it('without the flag, says nothing of pictures, adds no field, and takes none', async () => {
    const log = fakePlaywright();
    const r = /** @type {any} */ (await render('src/page.tsx', {cwd: dir, out: 'plain.html'}));
    expect('pictures' in r.data).toBe(false);
    expect(fs.existsSync(log)).toBe(false);
    const cli = await runCli(['experimental', 'export', 'src/page.tsx', '--out', 'plain2.html'], dir);
    expect(cli.stdout).not.toMatch(/^(Pictures|phone:|phoneDark:|desktop:|skipped:)/m);
  }, 120_000);
});
