// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A second stop during the browser runner's grace does not wait for
 * it: the run's whole group is killed and its temp folder removed at once.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('a second stop', () => {
  it('kills the run at once and removes its temp folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stop2-'));
    try {
      const record = path.join(dir, 'temp');
      const picture = path.join(dir, 'picture.mjs');
      // A run that does not stop when asked (a stuck browser).
      fs.writeFileSync(
        picture,
        `import * as fs from 'node:fs';\nimport * as os from 'node:os';\nprocess.on('SIGTERM', () => {});\nfs.writeFileSync(process.argv[2], os.tmpdir() + ' ' + process.pid);\nsetInterval(() => {}, 1000);\n`,
      );
      const driver = path.join(dir, 'driver.mjs');
      fs.writeFileSync(
        driver,
        `import {runBrowser} from ${JSON.stringify(pathToFileURL(path.join(here, '_preview.mjs')).href)};\nconst r = runBrowser(${JSON.stringify(picture)}, [${JSON.stringify(record)}], 60000);\nsetInterval(() => {}, 1000);\nawait r;\n`,
      );
      const child = spawn(process.execPath, [driver], {stdio: 'ignore'});
      for (let i = 0; i < 100 && !fs.existsSync(record); i++)
        await new Promise(r => setTimeout(r, 100));
      const [temp, pid] = fs.readFileSync(record, 'utf8').split(' ');
      const ended = new Promise(r => child.once('close', (_, sig) => r(sig)));
      child.kill('SIGINT');
      await new Promise(r => setTimeout(r, 300));
      const started = Date.now();
      child.kill('SIGINT');
      expect(await ended).toBe('SIGINT');
      expect(Date.now() - started).toBeLessThan(3000);
      expect(fs.existsSync(temp)).toBe(false);
      let alive = true;
      for (let i = 0; i < 20 && alive; i++) {
        try {
          process.kill(Number(pid), 0);
          await new Promise(r => setTimeout(r, 100));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
