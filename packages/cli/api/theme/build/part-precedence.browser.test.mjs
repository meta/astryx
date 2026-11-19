// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Who wins on a plain Text, a Timestamp and a Timer, in Chromium, for
 * every mix of a theme's `text` entries (none, a base entry, entries keyed on
 * type with color or size), its `timestamp` and `timer` entries (none or
 * both) and the caller's props (none, color, size, the parts' default color).
 * A part on Text's element changes only what its caller left unset: a plain
 * Text draws the same with or without the part entries, and a prop the caller
 * sets on a Timestamp or a Timer draws as it would with no part entry. CI
 * runs it in node-browser-contracts' "Part precedence browser case" step.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

// The case runs only in node-browser-contracts' "Part precedence browser
// case" step, after the Chromium install; the Node shards list it as skipped.
const BROWSER_STEP = process.env.ASTRYX_PART_PRECEDENCE_BROWSER === '1';
const {chromium} = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(HERE, '../../../../core');
const coreRequire = createRequire(path.join(CORE, 'package.json'));

/** The layer order Theme writes before a runtime theme's CSS. */
const LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

const GREEN = 'rgb(0, 128, 0)';
const BLUE = 'rgb(0, 0, 255)';
const TEAL = 'rgb(0, 128, 128)';
const RED = 'rgb(255, 0, 0)';
const MAGENTA = 'rgb(255, 0, 255)';

/** The theme's `text` entries, each a row of the matrix. */
const TEXT_ENTRIES = {
  none: {},
  base: {text: {base: {color: GREEN, fontSize: '30px'}}},
  keyed: {
    text: {
      'type:body+color:primary': {color: BLUE},
      'type:body+size:lg': {fontSize: '31px'},
      'type:supporting+color:accent': {color: TEAL},
      'type:supporting+size:sm': {fontSize: '32px'},
    },
  },
};

/** The parts on Text's element, with what their entries draw. */
const PARTS = {
  timestamp: {color: RED, fontSize: '20px'},
  timer: {color: MAGENTA, fontSize: '21px'},
};

/** The caller's props, each a column of the matrix. */
const PROPS = {
  none: {},
  accent: {color: 'accent'},
  secondary: {color: 'secondary'},
  sm: {size: 'sm'},
  lg: {size: 'lg'},
};

let browser;
let core;
let themes;
let React;
let server;
let coreCss;

beforeAll(async () => {
  await import(
    pathToFileURL(coreRequire.resolve('temporal-polyfill/full/global')).href
  );
  React = coreRequire('react');
  server = coreRequire('react-dom/server');
  core = await import(pathToFileURL(path.join(CORE, 'dist/index.js')).href);
  themes = await import(
    pathToFileURL(path.join(CORE, 'dist/theme/index.js')).href
  );
  coreCss = fs.readFileSync(path.join(CORE, 'dist/astryx.css'), 'utf8');
  if (BROWSER_STEP) browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

/** @param {string} name @param {Record<string, unknown>} components */
function pageFor(name, components) {
  const theme = themes.defineTheme({name, tokens: {}, components});
  const {prose, component} = themes.generateThemeCSS(theme);
  const h = React.createElement;
  const cases = [];
  for (const [prop, props] of Object.entries(PROPS)) {
    cases.push(
      h(
        'div',
        {key: `text-${prop}`, 'data-case': `text-${prop}`},
        h(core.Text, {type: 'body', ...props}, 'Plain text'),
      ),
      h(
        'div',
        {key: `timestamp-${prop}`, 'data-case': `timestamp-${prop}`},
        h(core.Timestamp, {
          value: 1_700_000_000,
          format: 'absolute',
          hasTooltip: false,
          ...props,
        }),
      ),
      h(
        'div',
        {key: `timer-${prop}`, 'data-case': `timer-${prop}`},
        h(core.Timer, {startTime: 1_700_000_000, ...props}),
      ),
    );
  }
  const markup = server.renderToStaticMarkup(
    h(themes.Theme, {theme}, h('main', null, ...cases)),
  );
  return `<!doctype html><html><head><style>${coreCss}</style>
<style>${LAYER_ORDER}\n@layer reset {\n${prose}\n}</style>
<style>${LAYER_ORDER}\n@layer astryx-theme {\n${component}\n}</style>
</head><body>${markup}</body></html>`;
}

/**
 * The color and font size each case's element draws.
 * @param {string} html
 * @returns {Promise<Record<string, {color: string, fontSize: string}>>}
 */
async function drawn(html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html);
    return await page.evaluate(
      selectors => {
        // This runs in the page, where the browser's globals are.
        const {document, getComputedStyle} = /** @type {any} */ (globalThis);
        /** @type {Record<string, {color: string, fontSize: string}>} */
        const out = {};
        for (const root of document.querySelectorAll('[data-case]')) {
          const id = root.getAttribute('data-case') ?? '';
          const kind = id.split('-')[0];
          const element = root.querySelector(selectors[kind]);
          if (!element) throw new Error(`no ${selectors[kind]} in ${id}`);
          const style = getComputedStyle(element);
          out[id] = {color: style.color, fontSize: style.fontSize};
        }
        return out;
      },
      {
        text: '.astryx-text',
        timestamp: '.astryx-timestamp',
        timer: '.astryx-timer',
      },
    );
  } finally {
    await page.close();
  }
}

describe.runIf(BROWSER_STEP)(
  'a part on Text’s element, against Text’s entries and props',
  () => {
    for (const [row, textEntries] of Object.entries(TEXT_ENTRIES)) {
      it(`with ${row} text entries`, async () => {
        const partEntries = Object.fromEntries(
          Object.entries(PARTS).map(([part, look]) => [part, {base: look}]),
        );
        const without = await drawn(pageFor(`m-${row}`, textEntries));
        const withParts = await drawn(
          pageFor(`m-${row}-parts`, {...textEntries, ...partEntries}),
        );
        /** @type {string[]} */
        const wrong = [];
        const check = (id, property, expected) => {
          const got = withParts[id][property];
          if (got !== expected)
            wrong.push(`${id} ${property}: ${got}, expected ${expected}`);
        };
        for (const prop of Object.keys(PROPS)) {
          // A plain Text: the part entries change nothing.
          check(`text-${prop}`, 'color', without[`text-${prop}`].color);
          check(`text-${prop}`, 'fontSize', without[`text-${prop}`].fontSize);
          for (const [part, look] of Object.entries(PARTS)) {
            const id = `${part}-${prop}`;
            const props = PROPS[prop];
            // A color the caller sets draws as with no part entry; the parts'
            // default color is no choice of the caller's.
            const colorSet = props.color != null && props.color !== 'secondary';
            check(id, 'color', colorSet ? without[id].color : look.color);
            check(
              id,
              'fontSize',
              props.size != null ? without[id].fontSize : look.fontSize,
            );
          }
        }
        expect(wrong).toEqual([]);
      }, 120_000);
    }
  },
);
