#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Proves one generated theme-family stylesheet preserves every selected identity in Chromium
 * @input [--port <n>]
 * @output One line per AST-034 browser contract; exit 1 on a cascade mismatch
 */

const {chromium} = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = Number(portArg === -1 ? 6013 : args[portArg + 1]);
const root = process.cwd();
const sources = path.join(root, 'apps/sandbox/src/themes/theme-family');
const familyFile = path.join(sources, 'sandbox-ocean-family.css');
const beforeFile = path.join(sources, 'unrelated-before.css');

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const name = req.url === '/' ? 'index.html' : req.url.slice(1);
      const file = path.resolve(dir, name);
      if (!file.startsWith(path.resolve(dir))) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (error, bytes) => {
        if (error) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/html',
        });
        res.end(bytes);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

function markup() {
  const specimen = (id, theme, order = '') => `
    <section id="${id}" data-astryx-theme="${theme}" ${order ? `data-family-order="${order}"` : ''}>
      <p class="prose">prose</p>
      <button class="astryx-button" data-variant="primary">button</button>
      <div data-astryx-media="dark"><button class="astryx-button media">media</button></div>
    </section>`;
  return `<!doctype html><html><head>
    <link rel="stylesheet" href="before.css">
    <link rel="stylesheet" href="family.css">
    <style>
      :root { --color-error: rgb(255 0 0); }
      @layer astryx-theme {
        :where([data-family-order='after']) .astryx-button[data-variant='primary'] {
          background-color: var(--color-error);
        }
      }
    </style>
  </head><body>
    ${specimen('switch', 'sandbox-ocean')}
    ${specimen('before', 'sandbox-ocean', 'before')}
    ${specimen('after', 'sandbox-ocean', 'after')}
    <section id="nested" data-astryx-theme="sandbox-ocean">
      <button class="astryx-button" data-variant="primary">base</button>
      <section data-astryx-theme="sandbox-ocean-calm">
        <button class="astryx-button" data-variant="primary">child</button>
        <section data-astryx-theme="sandbox-ocean-calm-deep">
          <button class="astryx-button" data-variant="primary">deep</button>
        </section>
      </section>
    </section>
    ${specimen('sibling', 'sandbox-ocean-midnight')}
  </body></html>`;
}

async function run() {
  if (!fs.existsSync(familyFile)) {
    throw new Error(
      `${familyFile} is missing — run \`pnpm -F @astryxdesign/sandbox generate:theme-family\` first.`,
    );
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-family-'));
  fs.copyFileSync(familyFile, path.join(dir, 'family.css'));
  fs.copyFileSync(beforeFile, path.join(dir, 'before.css'));
  fs.writeFileSync(path.join(dir, 'index.html'), markup());

  let server;
  let browser;
  const failures = [];
  const check = (label, actual, expected) => {
    if (actual === expected) console.log(`✓ ${label} — ${actual}`);
    else {
      failures.push(label);
      console.error(`✗ ${label}: got ${actual}, expected ${expected}`);
    }
  };

  try {
    server = await serve(dir);
    browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1024, height: 800}});
    await page.goto(`http://localhost:${port}/`, {waitUntil: 'networkidle'});

    const read = id =>
      page.locator(`#${id}`).evaluate(node => {
        const prose = getComputedStyle(node.querySelector('.prose'));
        const button = getComputedStyle(
          node.querySelector('.astryx-button[data-variant="primary"]'),
        );
        const media = getComputedStyle(node.querySelector('.media'));
        return {
          background: button.backgroundColor,
          border: button.borderColor,
          minHeight: button.minHeight,
          prose: prose.color,
          surface: getComputedStyle(node).getPropertyValue(
            '--color-background-surface',
          ),
          mediaBorder: media.borderColor,
        };
      });

    const identities = [
      ['sandbox-ocean', 'rgb(0, 119, 182)', 'rgb(2, 62, 138)'],
      ['sandbox-ocean-calm', 'rgb(0, 109, 119)', 'rgb(0, 75, 80)'],
      ['sandbox-ocean-calm-deep', 'rgb(0, 109, 119)', 'rgb(0, 75, 80)'],
      ['sandbox-ocean-midnight', 'rgb(90, 79, 207)', 'rgb(43, 36, 107)'],
    ];
    for (const [identity, background, prose] of identities) {
      await page.locator('#switch').evaluate((node, name) => {
        node.dataset.astryxTheme = name;
      }, identity);
      const seen = await read('switch');
      check(`${identity} component`, seen.background, background);
      check(`${identity} prose`, seen.prose, prose);
      check(`${identity} width adaptation`, seen.minHeight, '42px');
    }

    const nested = await page
      .locator('#nested button')
      .evaluateAll(nodes =>
        nodes.map(node => getComputedStyle(node).backgroundColor),
      );
    check('nested base boundary', nested[0], 'rgb(0, 119, 182)');
    check('nested child boundary', nested[1], 'rgb(0, 109, 119)');
    check('zero-delta descendant identity', nested[2], 'rgb(0, 109, 119)');
    check(
      'sibling isolation',
      (await read('sibling')).background,
      'rgb(90, 79, 207)',
    );
    check(
      'unrelated stylesheet before family loses',
      (await read('before')).background,
      'rgb(0, 119, 182)',
    );
    check(
      'unrelated stylesheet after family loses',
      (await read('after')).background,
      'rgb(0, 119, 182)',
    );
    check(
      'on-dark surface reaches component',
      (await read('switch')).mediaBorder,
      'rgb(144, 224, 239)',
    );

    // Exercise the shared compiler in the browser as well as the family
    // packaging above: an unsafe declaration must not consume valid siblings.
    const {defineTheme, generateThemeCSS} = await import(
      require('node:url').pathToFileURL(
        path.join(root, 'packages/core/dist/theme/index.js'),
      ).href
    );
    const warnings = [];
    const boundary = generateThemeCSS(
      defineTheme({
        name: 'boundary',
        tokens: {
          '--font-family-body': 'Gill\\ Sans, "Segoe;UI", serif /* ; */',
        },
        components: {
          button: {
            base: {
              color: 'rgb(1, 2, 3)',
              backgroundColor: 'red; } #escaped { color: rgb(255, 0, 0)',
              backgroundImage: 'URL(data:image/svg+xml;base64,PHN2Zy8+)',
              borderRadius: '4px',
              '::before': {content: '"kept; { }"'},
            },
          },
        },
      }),
      warnings,
    );
    await page.setContent(
      '<style>#escaped { color: rgb(4, 5, 6); }</style>' +
        '<div data-astryx-theme="boundary"><button class="astryx-button">kept</button></div>' +
        '<div id="escaped">unchanged</div>',
    );
    await page.addStyleTag({content: boundary.component + boundary.prose});
    const boundarySeen = await page.evaluate(() => {
      const button = document.querySelector('.astryx-button');
      const style = getComputedStyle(button);
      return {
        color: style.color,
        radius: style.borderRadius,
        image: style.backgroundImage,
        content: getComputedStyle(button, '::before').content,
        outside: getComputedStyle(document.querySelector('#escaped')).color,
      };
    });
    check('boundary drop is reported once', warnings.length, 1);
    check(
      'safe declaration before the drop paints',
      boundarySeen.color,
      'rgb(1, 2, 3)',
    );
    check('safe declaration after the drop paints', boundarySeen.radius, '4px');
    check(
      'data URL survives',
      boundarySeen.image.includes('data:image/svg+xml;base64,PHN2Zy8+'),
      true,
    );
    check(
      'quoted semicolon and braces survive',
      boundarySeen.content,
      '"kept; { }"',
    );
    check(
      'an unsafe value cannot style another rule',
      boundarySeen.outside,
      'rgb(4, 5, 6)',
    );

    if (failures.length > 0) {
      throw new Error(`${failures.length} theme-family assertion(s) failed`);
    }
    console.log('Theme family cascade guard passed.');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

run().catch(error => {
  console.error('Theme family cascade guard failed:', error);
  process.exit(1);
});
