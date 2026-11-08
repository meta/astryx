#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Asserts hover yields to pressed overlays in built Astryx CSS
 * @input [--css <path>] [--port <n>]
 * @output Computed hover/pressed values for image and color overlays; exit 1
 *   when Chromium paints hover during :active or touch loses pressed feedback
 *
 * StyleX gives a media-nested rule another priority bucket. In selector-based
 * output that bucket becomes generated specificity, so a guarded hover rule
 * can beat a bare :active rule even though :active is the later interaction
 * state. jsdom has neither pseudo-state forcing nor a cascade, so this probe
 * reads the built stylesheet, applies its real atomic classes, and asks
 * Chromium what paints while :hover and :active match together.
 */

const {chromium} = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const args = process.argv.slice(2);
const getArg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};

const cssPath = path.resolve(
  process.cwd(),
  getArg('css') || 'packages/core/dist/astryx.css',
);
const port = Number(getArg('port') || 0);

const TOKENS = {
  hover: 'rgba(10, 20, 30, 0.25)',
  pressed: 'rgba(40, 50, 60, 0.5)',
  neutral: 'rgba(70, 80, 90, 0.2)',
};

function stateClass(css, {property, token, state, media, neutral = false}) {
  const line = css.split('\n').find(candidate => {
    const inHoverMedia = candidate.includes('@media (hover: hover)');
    return (
      inHoverMedia === media &&
      candidate.includes(`:${state}:where(`) &&
      !candidate.includes('::') &&
      candidate.includes(`${property}:`) &&
      candidate.includes(`var(--color-overlay-${token})`) &&
      candidate.includes('var(--color-neutral)') === neutral
    );
  });
  const className = line?.match(/\.([a-zA-Z][a-zA-Z0-9_-]*)/)?.[1];
  if (!line || !className) {
    throw new Error(
      `Missing ${media ? 'media ' : ''}:${state} ${property} ` +
        `${token}${neutral ? ' on neutral' : ''} rule in ${cssPath}`,
    );
  }
  return className;
}

function classesFor(css, property, neutral = false) {
  return [
    stateClass(css, {
      property,
      token: 'hover',
      state: 'hover',
      media: true,
      neutral,
    }),
    stateClass(css, {
      property,
      token: 'pressed',
      state: 'active',
      media: true,
      neutral,
    }),
    stateClass(css, {
      property,
      token: 'pressed',
      state: 'active',
      media: false,
      neutral,
    }),
  ].join(' ');
}

function pageMarkup(css) {
  const vars = [
    `--color-overlay-hover:${TOKENS.hover}`,
    `--color-overlay-pressed:${TOKENS.pressed}`,
    `--color-neutral:${TOKENS.neutral}`,
  ].join(';');
  return `<!doctype html>
<html><head><link rel="stylesheet" href="/astryx.css"></head><body>
  <button id="image" class="${classesFor(css, 'background-image')}" style="${vars}">image</button>
  <button id="color" class="${classesFor(css, 'background-color')}" style="${vars}">color</button>
  <button id="neutral" class="${classesFor(css, 'background-image', true)}" style="${vars}">neutral</button>
  <button id="disabled" class="${classesFor(css, 'background-image')}" style="${vars}" disabled>disabled</button>
</body></html>`;
}

function serve(css, html) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      if (request.url === '/astryx.css') {
        response.writeHead(200, {'Content-Type': 'text/css'});
        response.end(css);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html'});
      response.end(html);
    });
    server.listen(port, '127.0.0.1', () =>
      resolve({server, port: server.address().port}),
    );
  });
}

async function forceState(context, page, selector, states, property) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const {root} = await session.send('DOM.getDocument', {depth: -1});
    const {nodeId} = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    await session.send('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: states,
    });
    return await page.$eval(
      selector,
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    );
  } finally {
    await session.detach();
  }
}

function checkIncludes(label, value, expected, failures) {
  if (value.includes(expected)) {
    console.log(`✓ ${label} — ${value}`);
  } else {
    failures.push(`${label}: got ${value}, expected it to include ${expected}`);
  }
}

function checkEquals(label, value, expected, failures) {
  if (value === expected) {
    console.log(`✓ ${label} — ${value}`);
  } else {
    failures.push(`${label}: got ${value}, expected ${expected}`);
  }
}

async function run() {
  if (!fs.existsSync(cssPath)) {
    throw new Error(
      `${cssPath} is missing — run \`pnpm -F @astryxdesign/core build:css\` first.`,
    );
  }
  const css = fs.readFileSync(cssPath, 'utf8');
  const html = pageMarkup(css);
  const {server, port: servedPort} = await serve(css, html);
  const browser = await chromium.launch();
  const failures = [];

  try {
    const desktop = await browser.newContext({
      viewport: {width: 480, height: 240},
    });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(`http://127.0.0.1:${servedPort}`, {
      waitUntil: 'networkidle',
    });
    const imageHover = await forceState(
      desktop,
      desktopPage,
      '#image',
      ['hover'],
      'background-image',
    );
    const imagePressed = await forceState(
      desktop,
      desktopPage,
      '#image',
      ['hover', 'active'],
      'background-image',
    );
    const colorHover = await forceState(
      desktop,
      desktopPage,
      '#color',
      ['hover'],
      'background-color',
    );
    const colorPressed = await forceState(
      desktop,
      desktopPage,
      '#color',
      ['hover', 'active'],
      'background-color',
    );
    const neutralPressed = await forceState(
      desktop,
      desktopPage,
      '#neutral',
      ['hover', 'active'],
      'background-image',
    );
    const disabledHover = await forceState(
      desktop,
      desktopPage,
      '#disabled',
      ['hover'],
      'background-image',
    );

    checkIncludes(
      'image hover paints the hover token',
      imageHover,
      TOKENS.hover,
      failures,
    );
    checkIncludes(
      'image press paints the pressed token',
      imagePressed,
      TOKENS.pressed,
      failures,
    );
    checkIncludes(
      'color hover paints the hover token',
      colorHover,
      TOKENS.hover,
      failures,
    );
    checkIncludes(
      'color press paints the pressed token',
      colorPressed,
      TOKENS.pressed,
      failures,
    );
    checkIncludes(
      'neutral press keeps its base layer',
      neutralPressed,
      TOKENS.neutral,
      failures,
    );
    checkIncludes(
      'neutral press paints the pressed token',
      neutralPressed,
      TOKENS.pressed,
      failures,
    );
    checkEquals(
      'disabled hover remains unpainted',
      disabledHover,
      'none',
      failures,
    );
    await desktop.close();

    const touch = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: {width: 390, height: 844},
    });
    const touchPage = await touch.newPage();
    await touchPage.goto(`http://127.0.0.1:${servedPort}`, {
      waitUntil: 'networkidle',
    });
    const hoverCapable = await touchPage.evaluate(
      () => matchMedia('(hover: hover)').matches,
    );
    if (hoverCapable) {
      failures.push('touch context unexpectedly matches (hover: hover)');
    }
    const touchPressed = await forceState(
      touch,
      touchPage,
      '#image',
      ['active'],
      'background-image',
    );
    checkIncludes(
      'touch keeps the bare pressed fallback',
      touchPressed,
      TOKENS.pressed,
      failures,
    );
    await touch.close();
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    return 1;
  }
  console.log('\nHover yields to pressed, and touch retains pressed feedback.');
  return 0;
}

if (require.main === module) {
  run()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error('Pressed-overlay cascade guard failed:', error);
      process.exit(1);
    });
}
