#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Asserts production source and prebuilt CSS put Astryx, theme and product styles in the right cascade order
 * @input [--port <n>]
 * @output One line per case; exit 1 if any layer loses to the wrong one
 *
 * `packages/build/src/vite.build.test.ts` reads the built stylesheet and proves
 * each rule landed in the layer it belongs to. It cannot prove what that means:
 * which declaration actually paints is a cascade fact, and jsdom resolves no
 * cascade. This builds the same fixture and looks.
 *
 * Three origins compete on one element, and the order between them is the whole
 * contract:
 *
 *   Astryx's own rule   @layer astryx-base    loses to both
 *   a theme override    @layer astryx-theme   beats Astryx, loses to the app
 *   the app's StyleX    @layer product        beats both
 *
 * The middle row is what shipped broken — the build never split, so everything
 * StyleX emitted outranked `astryx-theme`. The fix for that then inverted the
 * bottom row for a while: wrapping instead of splitting put the app's own
 * styles in `astryx-base`, where a theme could silently restyle them. Both
 * failures are one assertion apart, which is why this checks both directions.
 */

const {chromium} = require('playwright');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {pathToFileURL} = require('node:url');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const port = Number(getArg('port') || 6012);
const REPO_ROOT = process.cwd();
const FIXTURE = path.join(REPO_ROOT, 'packages/build/__fixtures__/layer-split');
const CORE_SRC = path.join(REPO_ROOT, 'packages/core/src');

/** Kept in step with the fixture; a mismatch here reads as a cascade failure. */
const THEME_COLOR = 'rgb(0, 120, 255)';
const PRODUCT_COLOR = 'rgb(255, 140, 0)';

/** The fixture theme's `--color-data-categorical-blue`, light and dark side. */
const DATA_OVERRIDE_LIGHT = 'rgb(1, 2, 3)';
const DATA_OVERRIDE_DARK = 'rgb(4, 5, 6)';
/** Untouched defaults: --color-data-categorical-orange, --color-data-neutral. */
const DATA_DEFAULT = 'rgb(235, 110, 0)';
const DATA_DEFAULT_DARK_SIDE = 'rgb(140, 147, 155)';

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

function createServer(dir, listenPort) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = (req.url === '/' ? '/index.html' : req.url).split('?')[0];
      const resolved = path.resolve(path.join(dir, rel));
      if (!resolved.startsWith(path.resolve(dir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(resolved, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(resolved)] || 'text/plain',
        });
        res.end(data);
      });
    });
    server.listen(listenPort, () => resolve(server));
  });
}

async function buildFixture(outDir) {
  const {build} = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;

  // .github/scripts is outside the workspace, so a bare specifier does not
  // resolve here. The Vite plugin ships as a build artifact.
  const pluginPath = path.join(REPO_ROOT, 'packages/build/dist/vite.mjs');
  if (!fs.existsSync(pluginPath)) {
    throw new Error(
      `${pluginPath} is missing — run \`pnpm -F @astryxdesign/build build\` first.`,
    );
  }
  const {astryxStylex} = await import(pathToFileURL(pluginPath).href);
  await build({
    root: FIXTURE,
    logLevel: 'error',
    build: {outDir, emptyOutDir: true},
    resolve: {alias: {'@astryxdesign/core': CORE_SRC}},
    plugins: [
      react(),
      ...astryxStylex({
        stylexOptions: {
          dev: false,
          unstable_moduleResolution: {type: 'commonJS', rootDir: REPO_ROOT},
          aliases: {
            '@astryxdesign/core/*': [path.join(CORE_SRC, '*')],
            '@astryxdesign/core': [CORE_SRC],
          },
        },
        libraryPattern: 'packages/core/',
      }),
    ],
  });
}

async function run() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cascade-'));
  let server;
  let browser;
  const failures = [];

  try {
    await buildFixture(outDir);
    server = await createServer(outDir, port);
    browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 420, height: 220}});
    await page.goto(`http://localhost:${port}/`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForSelector('#library-only', {timeout: 20000});
    await page.waitForSelector('#data-dark-default', {timeout: 20000});

    const seen = await page.evaluate(() => {
      const color = id => getComputedStyle(document.getElementById(id)).color;
      return {
        themed: getComputedStyle(document.getElementById('library-only'))
          .backgroundColor,
        product: getComputedStyle(document.getElementById('product-wins'))
          .backgroundColor,
        padding: getComputedStyle(document.getElementById('product-box'))
          .padding,
        dataDefault: color('data-default'),
        dataOverride: color('data-override'),
        dataNested: color('data-nested'),
        dataNestedDefault: color('data-nested-default'),
        dataDark: color('data-dark'),
        dataDarkDefault: color('data-dark-default'),
      };
    });

    const check = (label, actual, expected, why) => {
      if (actual === expected) {
        console.log(`✓ ${label} — ${actual}`);
      } else {
        failures.push(label);
        console.error(
          `✗ ${label}: got ${actual}, expected ${expected} — ${why}`,
        );
      }
    };

    check(
      "a theme's component override beats Astryx's own rule",
      seen.themed,
      THEME_COLOR,
      'StyleX is outranking @layer astryx-theme, so no theme can restyle a component',
    );
    check(
      "the app's own StyleX beats the theme",
      seen.product,
      PRODUCT_COLOR,
      'product styles landed in the library layer, so a theme silently restyles app code',
    );
    check(
      "the app's own StyleX applies at all",
      seen.padding,
      '11px',
      'the product layer is not reaching the page',
    );
    check(
      'a data token default reaches an element',
      seen.dataDefault,
      DATA_DEFAULT,
      'nothing declares --color-data-*, so var() resolves to nothing',
    );
    check(
      "a theme's data token override beats the default",
      seen.dataOverride,
      DATA_OVERRIDE_LIGHT,
      'the :root defaults are outranking @layer astryx-theme — they are ' +
        'unlayered, or in a layer that sorts above it',
    );
    check(
      "a nested theme inherits the parent's data token override",
      seen.dataNested,
      DATA_OVERRIDE_LIGHT,
      'the nested theme re-declares the default in its own scope block and ' +
        'shadows the parent override — no other token family does that',
    );
    check(
      'a nested theme still gets the untouched defaults',
      seen.dataNestedDefault,
      DATA_DEFAULT,
      'the defaults do not reach inside a nested theme',
    );
    check(
      "a nested dark theme inherits the parent's override, dark side",
      seen.dataDark,
      DATA_OVERRIDE_DARK,
      'light-dark() is not resolving against the nested theme color-scheme',
    );
    check(
      'a data token default resolves on the dark side',
      seen.dataDarkDefault,
      DATA_DEFAULT_DARK_SIDE,
      'the :root defaults resolve to their light side inside a dark theme',
    );
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
    fs.rmSync(outDir, {recursive: true, force: true});
  }

  if (failures.length > 0) {
    console.error(
      `\nFailing: ${failures.length} cascade rule(s) broken in a production ` +
        `build — ${failures.join('; ')}.`,
    );
    return 1;
  }
  // This existing CI owner already installs Chromium. Also prove the prebuilt
  // public entry's defaults and both load orders without consumer compilation.
  // Keep the opt-in suite out of the ordinary Node lane, which has no browser.
  execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'node',
      'scripts/build-css.data-tokens.browser.test.mjs',
      '--maxWorkers=1',
    ],
    {
      cwd: REPO_ROOT,
      env: {...process.env, ASTRYX_PREBUILT_DATA_BROWSER: '1'},
      stdio: 'inherit',
      timeout: 240_000,
    },
  );
  console.log(
    '\nAstryx < theme < product holds in production source and prebuilt CSS, ' +
      'and the data token defaults sit under a theme override.',
  );
  return 0;
}

run()
  .then(code => {
    process.exitCode = code;
  })
  .catch(e => {
    console.error('Theme layer cascade guard failed:', e);
    process.exit(1);
  });
