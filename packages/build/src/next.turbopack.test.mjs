// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next.turbopack.test.mjs
 * @input ASTRYX_TURBOPACK_E2E=1 and installed Chromium;
 *   __fixtures__/next-turbopack: an app with its own Babel config, mixed
 *   `*.tsx` rule list and StyleX PostCSS plugin, Core linked from a workspace
 *   (with its own node_modules) and Lab installed
 * @output Proves Turbopack `next build` and `next dev` render Astryx with the
 *   prebuilt class names and source-built rules (spec:AST-080 FR7), keep the
 *   app's rules to its files in their order, let a theme override win, and
 *   declare Core's data-colour defaults in an app with Core alone
 * @position End-to-end check for the Turbopack half of @astryxdesign/build, run by
 *   `pnpm test:build` (the Build package's own CI job) or directly:
 *   ASTRYX_TURBOPACK_E2E=1 pnpm exec vitest run --project node packages/build/src/next.turbopack.test.mjs
 */

import {execFileSync, spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(packageDir, '../..');
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  TURBOPACK: undefined,
  NODE_PATH: undefined,
};

let root, app, html, css, ruleLog;
const roots = [];

const nextBin = (dir = app) =>
  path.join(dir, 'node_modules/next/dist/bin/next');

function symlink(target, name, into) {
  const at = path.join(into, 'node_modules', name);
  fs.mkdirSync(path.dirname(at), {recursive: true});
  fs.symlinkSync(target, at, 'junction');
}

/** Copy a package's published files, as a registry install lays them out. */
function install(name, to) {
  const from = path.join(repoRoot, 'packages', name);
  const {files} = JSON.parse(fs.readFileSync(`${from}/package.json`, 'utf8'));
  for (const entry of ['package.json', ...files]) {
    if (!fs.existsSync(path.join(from, entry))) continue;
    fs.cpSync(path.join(from, entry), path.join(to, entry), {
      recursive: true,
      filter: file => !/[\\/]__tests__$|\.test\.tsx?$/.test(file),
    });
  }
}

/** A scratch copy of the fixture app, with Core linked and Lab if asked. */
function scratchApp({lab}) {
  // Inside the repository (an ignored scratch directory), so Turbopack's
  // workspace root covers the linked package's real path.
  const dir = fs.mkdtempSync(path.join(packageDir, '.astryx-next-turbopack-'));
  roots.push(dir);
  const app = path.join(dir, 'app');
  fs.cpSync(path.join(packageDir, '__fixtures__/next-turbopack'), app, {
    recursive: true,
  });
  const dependencies = {
    [packageDir]: ['next', '@babel/core', '@stylexjs/babel-plugin'],
    [repoRoot]: ['react', 'react-dom', 'typescript', '@types/react'],
    [`${repoRoot}/packages/lab`]: ['d3-array', 'd3-scale', 'd3-shape'],
  };
  dependencies[packageDir].push('@stylexjs/postcss-plugin', '@stylexjs/stylex');
  dependencies[repoRoot].push('@types/node');
  for (const [from, names] of Object.entries(dependencies)) {
    for (const name of names) {
      symlink(
        fs.realpathSync(path.join(from, 'node_modules', name)),
        name,
        app,
      );
    }
  }
  symlink(packageDir, '@astryxdesign/build', app);
  // Core linked from a workspace (`file:`, `pnpm link`, a monorepo package)...
  const core = path.join(dir, 'core');
  install('core', core);
  symlink(core, '@astryxdesign/core', app);
  const intl = `${repoRoot}/packages/core/node_modules/intl-messageformat`;
  symlink(fs.realpathSync(intl), 'intl-messageformat', core);
  // ...and Lab as a registry install: a real directory under node_modules.
  if (lab) install('lab', path.join(app, 'node_modules/@astryxdesign/lab'));
  return app;
}

/** The page a build rendered, without scripts or links, and its stylesheets. */
function built(dir) {
  const page = fs.readFileSync(
    path.join(dir, '.next/server/app/index.html'),
    'utf8',
  );
  const chunks = path.join(dir, '.next/static/chunks');
  const sheets = fs
    .readdirSync(chunks)
    .filter(file => file.endsWith('.css'))
    .map(file => fs.readFileSync(path.join(chunks, file), 'utf8'));
  return {page, css: sheets.join('\n')};
}

/**
 * The page a just-started `next dev` serves at `origin`. Only "not listening
 * yet" is waited out, up to `timeout`; its first answer must be the page, and
 * every other outcome fails, naming the command.
 */
async function servedPage(origin, child, command, timeout = 300_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(
        `${command} exited (${child.exitCode ?? child.signalCode}) before listening on ${origin}`,
      );
    }
    const response = await fetch(origin).catch(error => {
      if (error.cause?.code === 'ECONNREFUSED') return null;
      throw error;
    });
    if (response != null) {
      if (!response.ok) {
        throw new Error(
          `${command} answered ${origin} with ${response.status}`,
        );
      }
      return response.text();
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${command} never listened on ${origin} within ${timeout / 1000} s`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/** The rendered class lists, split by whether Astryx or the app made them. */
function classLists(page) {
  const lists = [...page.matchAll(/<\w+([^>]*?) class="([^"]*)"/g)].map(
    ([, attrs, classes]) => ({attrs, classes: classes.split(/\s+/)}),
  );
  const isHook = name => name.startsWith('astryx-');
  return {
    hooks: lists.flatMap(list => list.classes.filter(isHook)),
    astryx: lists
      .filter(list => list.classes.some(isHook))
      .flatMap(list => list.classes.filter(name => name && !isHook(name))),
    app: lists
      .filter(list => list.attrs.includes('id="card"'))
      .flatMap(list => list.classes),
  };
}

/** Astryx and app classes alike render with the classes their rules use. */
function expectStyled(page, stylesheet) {
  const {hooks, astryx, app: own} = classLists(page);
  expect(hooks).toEqual(
    expect.arrayContaining(['astryx-button', 'astryx-stat']),
  );
  expect(astryx.length).toBeGreaterThan(20);
  expect(own.length).toBeGreaterThan(0);
  for (const name of astryx) expect(name).toMatch(/^x[a-z0-9]+$/);
  for (const name of own) expect(name).toMatch(/^p[a-z0-9]+$/);
  for (const name of [...astryx, ...own]) {
    expect(stylesheet, name).toContain(`.${name}`);
  }
}

// Real Next.js builds, a dev server and Chromium take minutes of every core, so
// the default suite skips them; ASTRYX_TURBOPACK_E2E=1 runs them (with Chromium),
// as `pnpm test:build` does on the Build package's own CI runner.
describe.runIf(process.env.ASTRYX_TURBOPACK_E2E === '1')(
  'Turbopack end to end (ASTRYX_TURBOPACK_E2E=1)',
  () => {
    beforeAll(() => {
      app = scratchApp({lab: true});
      root = path.dirname(app);
      // From the parent, as `next build <dir>` runs; `next dev` below runs in the app.
      execFileSync(process.execPath, [nextBin(), 'build', 'app'], {
        cwd: root,
        env,
      });
      ruleLog = fs.readFileSync(path.join(app, 'rules.log'), 'utf8');
      ({page: html, css} = built(app));
    }, 600_000);

    afterAll(() => {
      for (const dir of roots) {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

    describe('withAstryx() under Turbopack', () => {
      it('builds a linked Core and an installed Lab with their prebuilt class names', () => {
        expectStyled(html, css);
      });

      it("runs the app's mixed rule list in order, on the app's files only", () => {
        // The app loader also throws on Astryx source, failing the build.
        const runs = [...ruleLog.matchAll(/^(\S+) (.*)$/gm)];
        const page = path.join(app, 'src/app/page.tsx');
        const names = runs
          .filter(([, , file]) => file === page)
          .map(run => run[1]);
        expect([...new Set(names)]).toEqual(['a', 'stylex', 'b']);
        expect(runs.every(run => run[2].startsWith(path.dirname(page)))).toBe(
          true,
        );
      });

      it('emits Astryx rules in astryx-base layers, without a priority layer', () => {
        expect(css).toContain('@layer astryx-base');
        expect(css).not.toMatch(/@layer priority|\.astryx[a-z0-9]{5,}/);
      });

      it('serves the same in next dev', async () => {
        const port = await new Promise(resolve => {
          const server = net.createServer().listen(0, () => {
            const {port: free} = server.address();
            server.close(() => resolve(free));
          });
        });
        const args = [nextBin(), 'dev', '-p', String(port)];
        const command = [process.execPath, ...args].join(' ');
        const child = spawn(process.execPath, args, {
          cwd: app,
          env,
          detached: true,
          stdio: 'ignore',
        });
        try {
          const origin = `http://localhost:${port}`;
          const page = await servedPage(
            origin,
            child,
            `${command} (in ${app})`,
          );
          const hrefs = [...page.matchAll(/href="([^"]+\.css[^"]*)"/g)];
          const sheets = await Promise.all(
            hrefs.map(async ([, href]) => (await fetch(origin + href)).text()),
          );
          expectStyled(page, sheets.join('\n'));
        } finally {
          process.kill(-child.pid, 'SIGKILL');
        }
      }, 600_000);

      it('lets a theme override win in either load order', async () => {
        // A theme stylesheet registers the layer order itself (spec:AST-080 FR3).
        const theme =
          '@layer reset, astryx-base, astryx-theme;\n' +
          '@layer astryx-theme { .astryx-button { background-color: rgb(0, 120, 255); } }';
        const body = html.replace(/<link[^>]*>|<script[\s\S]*?<\/script>/g, '');
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          const colors = [];
          for (const sheets of [[css], [theme, css], [css, theme]]) {
            const styles = sheets
              .map(sheet => `<style>${sheet}</style>`)
              .join('');
            await page.setContent(body.replace('</head>', `${styles}</head>`));
            colors.push(
              await page.$eval('.astryx-button', button =>
                getComputedStyle(button).getPropertyValue('background-color'),
              ),
            );
          }
          // The destructive Button's source-built `--color-error`, then the override.
          expect(colors).toEqual([
            'rgb(227, 25, 59)',
            'rgb(0, 120, 255)',
            'rgb(0, 120, 255)',
          ]);
        } finally {
          await browser.close();
        }
      });
    });

    describe('withAstryx() under Turbopack, with Core alone', () => {
      let page, sheet;

      beforeAll(() => {
        const coreOnly = scratchApp({lab: false});
        // An app reading a Core data colour as plain CSS, as dist dataVars compile.
        fs.writeFileSync(
          path.join(coreOnly, 'src/app/page.tsx'),
          [
            "import * as stylex from '@stylexjs/stylex';",
            "import {Text} from '@astryxdesign/core';",
            "const styles = stylex.create({swatch: {height: 8, backgroundColor: 'var(--color-data-categorical-blue)'}});",
            'export default function Page() {',
            '  return <main><Text>Hello</Text><div id="swatch" {...stylex.props(styles.swatch)} /></main>;',
            '}',
            '',
          ].join('\n'),
        );
        execFileSync(process.execPath, [nextBin(coreOnly), 'build'], {
          cwd: coreOnly,
          env,
        });
        ({page, css: sheet} = built(coreOnly));
      }, 600_000);

      it("declares Core's data-colour defaults, as astryx.css does", () => {
        expect(sheet).toMatch(/--color-data-categorical-blue:/);
      });

      it('colours a swatch that reads one', async () => {
        const body = page.replace(/<link[^>]*>|<script[\s\S]*?<\/script>/g, '');
        const browser = await chromium.launch();
        try {
          const tab = await browser.newPage();
          await tab.setContent(
            body.replace('</head>', `<style>${sheet}</style></head>`),
          );
          expect(
            await tab.$eval('#swatch', swatch =>
              getComputedStyle(swatch).getPropertyValue('background-color'),
            ),
          ).toBe('rgb(1, 113, 227)');
        } finally {
          await browser.close();
        }
      });
    });
  },
);
