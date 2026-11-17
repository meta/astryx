// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The previews and their commands, said truly: a theme file that is
 * no regular file is never read, a theme image the previews cannot show is
 * named, one too large for a page is named with its size (never React),
 * extra words to a preview command get a command that works, a workspace
 * root gets the `cd` to its app, a cut description says it was cut, and a
 * template typo names only pages this app can add.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {
  assetDataUri,
  MAX_ASSET_BYTES,
} from '../../foundation/render/assets.mjs';
import {assetRef} from '../../foundation/render/render-page.mjs';
import {renderGenerated} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read drawn components: drawn for real.)
realRenders(true);

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-previews-truly-file-regular-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** A named pipe at `file` (no writer ever opens it). @param {string} file */
const fifo = file => execFileSync('mkfifo', [file]);

describe('a theme file that is not a regular file', () => {
  it.skipIf(process.platform === 'win32')(
    'is never read: a pipe and a link to a device are named, at once',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pipe-'));
      try {
        fifo(path.join(dir, 'logo.woff2'));
        fs.symlinkSync('/dev/zero', path.join(dir, 'grain.png'));
        fs.writeFileSync(path.join(dir, 'ok.png'), 'x');
        const at = {dir, root: dir};
        const started = Date.now();
        expect(assetRef('./logo.woff2', at)?.kind).toBe('not-file');
        expect(assetRef('./grain.png', at)?.kind).toBe('not-file');
        expect(assetRef('./ok.png', at)?.kind).toBe('file');
        expect(assetRef('./gone.png', at)?.kind).toBe('missing');
        expect(assetRef('https://example.com/a.png', at)?.kind).toBe('remote');
        for (const f of ['logo.woff2', 'grain.png'])
          expect(() => assetDataUri(path.join(dir, f))).toThrow(
            /not a regular file/,
          );
        // A read of either would never end.
        expect(Date.now() - started).toBeLessThan(2000);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
  );
});

describe('theme images the previews cannot show', () => {
  it(
    'show names a remote image, a missing one, a pipe and one too large',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      fs.writeFileSync(
        path.join(dir, 'hero.png'),
        Buffer.alloc(MAX_ASSET_BYTES + 1024),
      );
      if (process.platform !== 'win32') fifo(path.join(dir, 'logo.woff2'));
      try {
        for (const [on, ref] of [
          ['card', 'url(https://example.com/paper.png)'],
          ['button', 'url(./grain.png)'],
          ['badge', 'url(./hero.png)'],
          ...(process.platform !== 'win32'
            ? [['avatar', 'url(./logo.woff2)']]
            : []),
        ])
          await themeEditSet('t', 'background-image', ref, {cwd, on});
        const r = await themeEditShow('t', {cwd});
        const notes = /** @type {string[]} */ (
          /** @type {any} */ (r.data).notes ?? []
        ).join('\n');
        expect(notes).toContain(
          'https://example.com/paper.png is loaded from the network',
        );
        expect(notes).toContain('./grain.png was not found beside the theme');
        expect(notes).toMatch(
          /themes\/t\/hero\.png is 8\.0 MB, more than the 8 MB/,
        );
        if (process.platform !== 'win32')
          expect(notes).toContain('./logo.woff2 is not a regular file');
      } finally {
        for (const on of ['card', 'button', 'badge', 'avatar'])
          await runCli(
            [
              'experimental',
              'theme',
              'editor',
              'undo',
              't',
              'background-image',
              '--on',
              on,
            ],
            cwd,
          );
        for (const f of ['hero.png', 'logo.woff2'])
          fs.rmSync(path.join(dir, f), {force: true});
      }
    },
    T,
  );
});

describe('a theme image too large for a page', () => {
  it(
    'is named with its size and place, never as React, and points nowhere false',
    async () => {
      const big = path.join(cwd, 'big.png');
      fs.writeFileSync(big, Buffer.alloc(MAX_ASSET_BYTES + 1024));
      try {
        const e = await refusal(async () =>
          renderGenerated(
            await openProject(cwd),
            'big.mjs',
            "export default function P() { return <img src='./big.png' />; }\n",
            [{name: 'big.png', from: big}],
          ),
        );
        expect(e.code).toBe('ERR_RENDER_ASSET_TOO_LARGE');
        expect(e.message).toMatch(
          /big\.png is 8\.0 MB, more than the 8 MB a preview page carries per file/,
        );
        expect(e.message).not.toContain('React');
        expect(e.run).toEqual([]);
      } finally {
        fs.rmSync(big, {force: true});
      }
    },
    T,
  );
});

describe('extra words to a preview command', () => {
  it(
    'list, remove and app each get a command that works, never a bare "too many arguments"',
    async () => {
      const ask = async (/** @type {string[]} */ args) =>
        JSON.parse(
          (
            await runCli(
              ['experimental', 'theme', 'preview', ...args, '--json'],
              cwd,
            )
          ).stdout,
        );
      const names = (/** @type {any} */ r) =>
        (r.suggestions ?? []).map((/** @type {any} */ s) => s.name);
      const list = await ask(['list', 'overview']);
      expect(list.error).toContain('preview list does not take "overview"');
      expect(names(list)[0]).toMatch(/ preview list$/);
      const remove = await ask(['remove', 'colors', 'components']);
      expect(remove.error).toContain(
        'preview remove does not take "components"',
      );
      // A remove of the first page alone is not offered: it may not be meant.
      for (const n of names(remove)) expect(n).not.toMatch(/remove colors$/);
      expect(names(remove)).toContainEqual(
        expect.stringMatching(/ preview remove --help$/),
      );
      const app = await ask(['app', 'my', 'app', '--theme', 't']);
      expect(app.error).toContain('preview app does not take "app"');
      expect(names(app)[0]).toMatch(/ preview app 'my app' --theme t$/);
    },
    T,
  );
});

describe('preview app at a workspace root', () => {
  it('gives the cd to the app, never "no such theme"', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ws-'));
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({name: 'root', private: true}),
      );
      fs.writeFileSync(
        path.join(root, 'pnpm-workspace.yaml'),
        "packages:\n  - 'apps/*'\n",
      );
      fs.mkdirSync(path.join(root, 'apps/web/themes/t'), {recursive: true});
      fs.writeFileSync(
        path.join(root, 'apps/web/package.json'),
        JSON.stringify({
          name: 'web',
          dependencies: {'@astryxdesign/core': '*'},
        }),
      );
      const e = await refusal(() =>
        themeEditPreviewApp('q', {cwd: root, theme: 't'}),
      );
      expect(e.message).not.toContain('There is no theme');
      expect(e.run).toContainEqual(expect.stringMatching(/^cd apps\/web/));
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('a description over the words read', () => {
  it(
    'is quoted as typed, and the refusal says it was cut',
    async () => {
      const said = [
        ...Array.from({length: 45}, (_, i) => `w${i}`),
        'login',
        'form',
      ].join(' ');
      const e = await refusal(() =>
        themeEditPreviewAdd(said, {cwd, path: 'src/app/cut'}),
      );
      expect(e.message).toContain(`"${said}"`);
      expect(e.message).toContain(
        'Only the first 40 different words of a description are read, and this one has 47',
      );
    },
    T,
  );
});

describe('a template typo', () => {
  it(
    'names only pages this app can add',
    async () => {
      const e = await refusal(() =>
        themeEditPreviewAdd(undefined, {
          cwd,
          template: 'dashbord',
          path: 'src/app/typo',
        }),
      );
      // The dashboard page needs packages this app does not have.
      expect(e.message).toContain('There is no page template "dashbord"');
      for (const n of e.run) expect(n).not.toMatch(/--template dashboard\b/);
    },
    T,
  );
});
