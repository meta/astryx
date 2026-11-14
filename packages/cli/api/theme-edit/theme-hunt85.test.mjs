// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The eighty-fifth pass: the preview follows through. A browser the
 * editor stops at its bound is said to have timed out; Chrome's startup
 * noise is not the reason; a theme folder that cannot be written is named;
 * Chrome's profile folder goes with it; the fix for a preview Next does not
 * serve is one add accepts; a new app's folder works from a subfolder; and
 * the picture note names every picture the same way from a subfolder.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditPreviewAdd,
  themeEditPreviewApp,
} from './theme-edit.mjs';
import {meaningfulLine, runBrowser} from './_preview.mjs';
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
      return {ok: true, file: path.relative(project.cwd, png), cut: true};
    },
  };
});

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt85-', FIXTURE_PACKAGES);
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

/** A stand-in browser: notes its arguments, then sleeps. */
function sleepyBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-fake-chrome-'));
  const bin = path.join(dir, 'chrome');
  fs.writeFileSync(bin, `#!/bin/sh\necho "$@" > "${dir}/args"\nsleep 30\n`, {
    mode: 0o755,
  });
  return {dir, bin};
}

describe('the browser run', () => {
  it('a browser stopped at the bound is said to have timed out, and its profile folder goes', async () => {
    const {dir, bin} = sleepyBrowser();
    try {
      const r = await runBrowser(bin, ['--screenshot=x.png'], 500);
      expect(r.timedOut).toBe(true);
      const profile = /--user-data-dir=(\S+)/.exec(
        fs.readFileSync(path.join(dir, 'args'), 'utf8'),
      )?.[1];
      expect(profile).toBeTruthy();
      expect(fs.existsSync(String(profile))).toBe(false);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 30_000);

  it("Chrome's startup noise is not the reason", () => {
    expect(
      meaningfulLine(
        '[1:2:ERROR:dbus/bus.cc:405] Failed to connect to the bus\n[0:0:ERROR:headless_shell.cc] Cannot write file x.png\n',
      ),
    ).toMatch(/Cannot write file/);
  });
});

describe('pictures', () => {
  it('a theme folder that cannot be written is named, not the browser', async () => {
    await themeEditShow('t', {cwd});
    const dir = path.join(cwd, 'themes/t');
    fs.chmodSync(dir, 0o555);
    try {
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(r.data.pictures).toEqual([]);
      expect(r.data.pictureProblem).toMatch(/themes\/t\/ cannot be written/);
      expect(r.data.pictureProblem).not.toMatch(/browser|Playwright/);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  }, 240_000);

  it('from a subfolder, the picture note names every picture with its full path', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('t', {cwd: path.join(cwd, 'src/app'), png: true})
    );
    const note = String(r.data.pictureProblem ?? '');
    expect(note).toContain(path.join(cwd, 'themes/t/preview-dark.png'));
    expect(note).not.toMatch(/(^|[\s(,])themes\//);
  }, 240_000);
});

describe('the in-app preview and a new app', () => {
  it('a preview under a root app/ is fixed with remove, then add', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'app/layout.tsx'),
      'export default function L({children}) { return children; }\n',
    );
    try {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#dc2626', {cwd})
      );
      expect(r.data.see).toMatch(
        /preview remove --path src\/app\/theme-preview, then .*preview add --theme t/,
      );
      expect(r.data.see).not.toMatch(/move it back/);
    } finally {
      fs.rmSync(path.join(cwd, 'app'), {recursive: true, force: true});
    }
  }, 240_000);

  it("a new app's folder and open line work from the subfolder it ran in", async () => {
    const r = /** @type {any} */ (
      await themeEditPreviewApp('../../theme-app', {
        cwd: path.join(cwd, 'src/app'),
      })
    );
    expect(r.data.folder).toBe('../../theme-app');
    expect(r.data.open).toMatch(/^cd \.\.\/\.\.\/theme-app && /);
    expect(fs.existsSync(path.join(cwd, 'theme-app'))).toBe(true);
  }, 240_000);
});
