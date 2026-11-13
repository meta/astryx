// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The picture `--png` takes: a browser that is installed but fails is
 * named with its error, never reported as missing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {screenshot} from './_preview.mjs';

const PATH = process.env.PATH;
afterEach(() => {
  process.env.PATH = PATH;
});

/** A project with no Playwright installed. @param {string} cwd */
const project = cwd =>
  /** @type {import('./_project.mjs').ThemeProject} */ (
    /** @type {any} */ ({
      cwd,
      req: {
        resolve: () => {
          throw new Error('not installed');
        },
      },
    })
  );

describe.skipIf(process.platform !== 'linux')('a browser for --png', () => {
  it('names the error of a browser that is there but fails, and the fix', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-png-'));
    try {
      const bin = path.join(dir, 'bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(
        path.join(bin, 'chromium'),
        '#!/bin/sh\necho "cannot open display" >&2\nexit 1\n',
        {mode: 0o755},
      );
      process.env.PATH = bin;
      const html = path.join(dir, 'page.html');
      fs.writeFileSync(html, '<p>x</p>');
      const r = await screenshot(
        project(dir),
        html,
        path.join(dir, 'page.png'),
        'light',
      );
      expect(r.ok).toBe(false);
      const reason = /** @type {any} */ (r).reason;
      expect(reason).toContain(
        'A browser was found, but it could not take the picture',
      );
      expect(reason).toContain('cannot open display');
      expect(reason).toContain('npx playwright install chromium');
      expect(reason).not.toContain('No browser was found');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('says no browser was found when there is none', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-png-'));
    try {
      process.env.PATH = path.join(dir, 'empty');
      const r = await screenshot(
        project(dir),
        path.join(dir, 'page.html'),
        path.join(dir, 'page.png'),
        'light',
      );
      expect(/** @type {any} */ (r).reason).toContain('No browser was found');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
