// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The ninety-fifth pass: the preview follows through. Playwright's own
 * browser is tried before the system Chrome, and the advice matches what was
 * tried; the Chrome lookup passes over a folder or a file that does not run;
 * a preview renamed by hand is kept in step like the one `see` names; and a
 * root app/ beside src/app/ is refused for the right reason.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditPreviewAdd,
} from './theme-edit.mjs';
import {screenshot} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** A project folder with a stand-in Playwright and a page to picture. */
function pwProject(/** @type {string} */ launchSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pw-'));
  const pw = path.join(dir, 'node_modules/playwright');
  fs.mkdirSync(pw, {recursive: true});
  fs.writeFileSync(
    path.join(pw, 'package.json'),
    JSON.stringify({name: 'playwright', main: 'index.js'}),
  );
  fs.writeFileSync(path.join(pw, 'index.js'), launchSource);
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  const html = path.join(dir, 'p.html');
  fs.writeFileSync(html, '<p>x</p>');
  return {
    dir,
    html,
    project: {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
  };
}

/** A PATH whose first entries are named like a browser but do not run. */
function oddPath(/** @type {string} */ dir, /** @type {boolean} */ broken) {
  const odd = path.join(dir, 'odd');
  fs.mkdirSync(path.join(odd, 'google-chrome'), {recursive: true});
  fs.writeFileSync(path.join(odd, 'chromium'), '#!/bin/sh\nexit 0\n', {
    mode: 0o644,
  });
  const good = path.join(dir, 'good');
  fs.mkdirSync(good);
  fs.writeFileSync(
    path.join(good, 'chromium-browser'),
    broken
      ? '#!/bin/sh\necho "cannot open shared object libnss3.so" >&2\nexit 127\n'
      : '#!/bin/sh\nfor a in "$@"; do case "$a" in --screenshot=*) printf x > "${a#--screenshot=}";; esac; done\n',
    {mode: 0o755},
  );
  return [odd, good].join(path.delimiter);
}

describe('the browser run', () => {
  const savedPath = process.env.PATH;
  afterAll(() => {
    process.env.PATH = savedPath;
  });

  it('a folder or a file that does not run is passed over for a browser later on PATH', async () => {
    const {dir, html} = pwProject('');
    fs.rmSync(path.join(dir, 'node_modules'), {recursive: true, force: true});
    // The browser later on PATH is the one tried: its own failure is named.
    process.env.PATH = oddPath(dir, true);
    try {
      const r = /** @type {any} */ (
        await screenshot(
          {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
          html,
          path.join(dir, 'p.png'),
          'light',
        )
      );
      expect(r.reason).toContain(path.join(dir, 'good', 'chromium-browser'));
      expect(r.reason).not.toContain(path.join(dir, 'odd'));
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it("Playwright's own browser is tried before a broken system Chrome", async () => {
    const {dir, html, project} = pwProject(
      `exports.chromium = {async launch(o) {
        if (o && o.executablePath) throw new Error('system chrome broken');
        return {
          async newPage() { return {async goto() {}, async screenshot({path}) { require('fs').writeFileSync(path, 'x'); }}; },
          async close() {},
        };
      }};`,
    );
    process.env.PATH = oddPath(dir, true);
    try {
      const r = await screenshot(
        project,
        html,
        path.join(dir, 'p.png'),
        'light',
      );
      expect(r.ok).toBe(true);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('the install advice comes only when Playwright has no browser of its own', async () => {
    const started = pwProject(
      `exports.chromium = {async launch() { throw new Error('Target page, context or browser has been closed'); }};`,
    );
    const missing = pwProject(
      `exports.chromium = {async launch(o) { throw new Error(o && o.executablePath ? 'broken' : "Executable doesn't exist; run npx playwright install"); }};`,
    );
    try {
      process.env.PATH = oddPath(started.dir, true);
      const a = /** @type {any} */ (
        await screenshot(
          started.project,
          started.html,
          path.join(started.dir, 'p.png'),
          'light',
        )
      );
      expect(a.ok).toBe(false);
      expect(a.reason).not.toMatch(/npx playwright install/);
      process.env.PATH = oddPath(missing.dir, true);
      const b = /** @type {any} */ (
        await screenshot(
          missing.project,
          missing.html,
          path.join(missing.dir, 'p.png'),
          'light',
        )
      );
      expect(b.reason).toMatch(/npx playwright install chromium/);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(started.dir, {recursive: true, force: true});
      fs.rmSync(missing.dir, {recursive: true, force: true});
    }
  });
});

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt95-', FIXTURE_PACKAGES);
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

describe('the in-app preview', () => {
  it('a preview folder renamed by hand is kept in step with a change', async () => {
    await themeEditSet('t', 'accent', '#9333ea', {cwd});
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    fs.renameSync(
      path.join(cwd, 'src/app/theme-preview'),
      path.join(cwd, 'src/app/look'),
    );
    await themeEditSet('t', 'accent', '#2563eb', {cwd});
    const page = fs.readFileSync(
      path.join(cwd, 'src/app/look/_pages/colors.tsx'),
      'utf8',
    );
    expect(page).toMatch(/#2563eb/i);
    expect(page).not.toMatch(/#9333ea/i);
  }, 240_000);

  it('a root app/ beside src/app/ is refused because it would hide the app', async () => {
    let err;
    try {
      await themeEditPreviewAdd(undefined, {cwd, theme: 't', path: 'app/x'});
    } catch (e) {
      err = /** @type {any} */ (e);
    }
    expect(String(err?.message)).toMatch(
      /Next serves the root app\/ when both are there, so the whole app in src\/app\/ would stop being served/,
    );
    expect(fs.existsSync(path.join(cwd, 'app'))).toBe(false);
  }, 240_000);
});
