// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The browser runner and the picture order: a whole-page picture
 * through a Chrome, a stop that closes the run's whole process group and
 * removes its temp folder and unfinished picture, no run without a temp
 * folder of its own, and a browser that failed is not tried again in the
 * same run.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {newPictureRun, runBrowser, screenshot} from './_preview.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A Chrome on this machine, for the one test that needs a real one. */
const chrome = [
  ...(process.env.PATH ?? '')
    .split(path.delimiter)
    .flatMap(d =>
      ['google-chrome', 'chromium', 'chromium-browser', 'chrome'].map(n =>
        path.join(d, n),
      ),
    ),
].find(f => {
  try {
    fs.accessSync(f, fs.constants.X_OK);
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
});

/** A PNG's width and height. @param {string} file */
const pngSize = file => {
  const b = fs.readFileSync(file);
  return {width: b.readUInt32BE(16), height: b.readUInt32BE(20)};
};

describe('the picture run', () => {
  it.skipIf(!chrome)(
    'a Chrome takes the whole page, every pixel of its height',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-tall-'));
      try {
        const html = path.join(dir, 'p.html');
        fs.writeFileSync(
          html,
          '<html><body style="margin:0"><div style="height:4321px">tall</div></body></html>',
        );
        const png = path.join(dir, 'p.png');
        const r = await screenshot(
          {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
          html,
          png,
          'light',
        );
        expect(r.ok).toBe(true);
        expect(pngSize(png)).toEqual({width: 1280, height: 4321});
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    90_000,
  );

  it('a stop closes the run, and its temp folder and unfinished picture go', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stop-'));
    try {
      const record = path.join(dir, 'temp');
      const part = path.join(dir, 'part.png');
      const picture = path.join(dir, 'picture.mjs');
      fs.writeFileSync(
        picture,
        `import * as fs from 'node:fs';\nimport * as os from 'node:os';\nfs.writeFileSync(process.argv[2], os.tmpdir());\nfs.writeFileSync(process.argv[3], 'half');\nsetInterval(() => {}, 1000);\n`,
      );
      const driver = path.join(dir, 'driver.mjs');
      fs.writeFileSync(
        driver,
        `import {runBrowser} from ${JSON.stringify(pathToFileURL(path.join(here, '_preview.mjs')).href)};\nconst r = runBrowser(${JSON.stringify(picture)}, [${JSON.stringify(record)}, ${JSON.stringify(part)}], 60000, {drop: [${JSON.stringify(part)}]});\nsetInterval(() => {}, 1000);\nawait r;\n`,
      );
      const child = spawn(process.execPath, [driver], {stdio: 'ignore'});
      for (let i = 0; i < 100 && !fs.existsSync(part); i++)
        await new Promise(r => setTimeout(r, 100));
      expect(fs.existsSync(part)).toBe(true);
      const temp = fs.readFileSync(record, 'utf8');
      const ended = new Promise(r => child.once('close', (_, sig) => r(sig)));
      child.kill('SIGTERM');
      expect(await ended).toBe('SIGTERM');
      expect(fs.existsSync(temp)).toBe(false);
      expect(fs.existsSync(part)).toBe(false);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('no temp folder of its own: nothing runs, and the reason says so', async () => {
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = path.join(os.tmpdir(), 'astryx-no-such-folder', 'x');
    try {
      const r = await runBrowser(
        path.join(here, '../../foundation/render/picture-chrome.mjs'),
        [],
      );
      expect(r.noTemp).toBe('ENOENT');
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it('a browser that failed is not tried again for the next picture of the run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-run-'));
    const savedPath = process.env.PATH;
    try {
      const pw = path.join(dir, 'node_modules/playwright');
      fs.mkdirSync(pw, {recursive: true});
      fs.writeFileSync(
        path.join(pw, 'package.json'),
        JSON.stringify({name: 'playwright', main: 'index.js'}),
      );
      const tries = path.join(dir, 'tries');
      fs.writeFileSync(
        path.join(pw, 'index.js'),
        `exports.chromium = {async launch() { require('fs').appendFileSync(${JSON.stringify(tries)}, 'x'); throw new Error('browserType.launch: closed\\n[err] error while loading shared libraries: libgbm.so.1'); }};`,
      );
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const html = path.join(dir, 'p.html');
      fs.writeFileSync(html, '<p>x</p>');
      process.env.PATH = dir;
      const project = {
        cwd: dir,
        req: createRequire(path.join(dir, 'package.json')),
      };
      const run = newPictureRun();
      const a = /** @type {any} */ (
        await screenshot(project, html, path.join(dir, 'a.png'), 'light', run)
      );
      const b = /** @type {any} */ (
        await screenshot(project, html, path.join(dir, 'b.png'), 'dark', run)
      );
      expect(fs.readFileSync(tries, 'utf8')).toBe('x');
      expect(a.reason).toMatch(/libgbm\.so\.1/);
      expect(b.reason).toMatch(/libgbm\.so\.1/);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
