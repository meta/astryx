// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {preview} from 'vite';
import {FIXTURE_ASSETS_ROOT, copyFixture} from '../src/fixture-suite.mjs';

const FIXTURE_ID = 'enterprise-scoped-synthetic';
const VIEWPORT = {width: 1280, height: 900};
const MINIMUM_CONTRAST = 4.5;
const GUEST_TOKENS = {
  '--accent': '#7c3aed',
  '--border': '#c4b5fd',
  '--error': '#b42318',
  '--foreground': '#2e1065',
  '--panel': '#f5f3ff',
  '--subtle': '#ede9fe',
};
const CONTRAST_PROBES = [
  ['guest callout body', 'guest-callout'],
  ['guest callout heading', 'guest-callout-heading'],
  ['dialog body', 'dialog-body'],
  ['dialog callout', 'dialog-callout'],
  ['menu item', 'popover-menu-item'],
  ['destructive action', 'destructive-action'],
];

/**
 * pnpm is a .cmd (batch) file on Windows. spawnSync can only run a batch
 * file through a shell — a bare 'pnpm' fails with ENOENT and an explicit
 * 'pnpm.cmd' still fails with EINVAL (batch files need a shell even named
 * exactly). Shelling out through cmd.exe /c directly, rather than
 * spawnSync's shell:true, avoids Node's shell-argument-escaping deprecation
 * warning (DEP0190) — every argument here is a hardcoded literal, never
 * user input, so we build the argv ourselves instead of asking spawnSync to
 * build a shell string. See internal/vibe-tests/src/fixture-suite.mjs for
 * the same pattern.
 */
function runPnpm(args, cwd) {
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
          cwd,
          encoding: 'utf8',
        })
      : spawnSync('pnpm', args, {cwd, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(' ')} failed in ${cwd}\n${result.stdout ?? ''}${result.stderr ?? result.error?.message ?? ''}`,
    );
  }
}

async function openFixture(page, url, mode) {
  await page.goto(url, {waitUntil: 'networkidle'});
  if (mode === 'dark') {
    await page.locator('[data-vibe-probe="mode-control"]').click();
  }
  await page.locator('[data-vibe-probe="dialog-trigger"]').click();
  await page.locator('[data-vibe-probe="popover-trigger"]').click();
  await page.mouse.move(0, 0);
}

async function renderedContrast(page, probe) {
  return page.locator(`[data-vibe-probe="${probe}"]`).evaluate(element => {
    function color(value) {
      const components = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (components.length < 3)
        throw new Error(`cannot parse color: ${value}`);
      return {
        r: components[0],
        g: components[1],
        b: components[2],
        a: components[3] ?? 1,
      };
    }

    function blend(foreground, background, alpha) {
      return {
        r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
        g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
        b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
      };
    }

    function luminance(value) {
      const channels = [value.r, value.g, value.b].map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }

    const foreground = color(getComputedStyle(element).color);
    let backgroundNode = element;
    let background = color(getComputedStyle(backgroundNode).backgroundColor);
    while (background.a === 0 && backgroundNode.parentElement) {
      backgroundNode = backgroundNode.parentElement;
      background = color(getComputedStyle(backgroundNode).backgroundColor);
    }
    if (background.a < 1) {
      background = blend(background, {r: 255, g: 255, b: 255}, background.a);
    }

    let opacity = foreground.a;
    for (
      let node = element;
      node && node !== backgroundNode.parentElement;
      node = node.parentElement
    ) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    const paintedForeground = blend(foreground, background, opacity);
    const foregroundLuminance = luminance(paintedForeground);
    const backgroundLuminance = luminance(background);
    const ratio =
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

    return {
      background: getComputedStyle(backgroundNode).backgroundColor,
      foreground: getComputedStyle(element).color,
      ratio,
    };
  });
}

async function tokenValues(page, probe) {
  return page
    .locator(`[data-vibe-probe="${probe}"]`)
    .evaluate((element, names) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(
        names.map(name => [name, style.getPropertyValue(name).trim()]),
      );
    }, Object.keys(GUEST_TOKENS));
}

async function verifyContrast(browser, url) {
  const failures = [];
  for (const mode of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme: mode,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      viewport: VIEWPORT,
    });
    const page = await context.newPage();
    await openFixture(page, url, mode);

    for (const [name, probe] of CONTRAST_PROBES) {
      const result = await renderedContrast(page, probe);
      console.log(
        `${mode} ${name}: ${result.ratio.toFixed(2)}:1 (${result.foreground} on ${result.background})`,
      );
      if (result.ratio < MINIMUM_CONTRAST) {
        failures.push(
          `${mode} ${name} contrast ${result.ratio.toFixed(2)}:1 is below ${MINIMUM_CONTRAST}:1`,
        );
      }
    }

    await page.locator('[data-vibe-probe="popover-menu-item"]').hover();
    const hover = await renderedContrast(page, 'popover-menu-item');
    console.log(
      `${mode} menu item hover: ${hover.ratio.toFixed(2)}:1 (${hover.foreground} on ${hover.background})`,
    );
    if (hover.ratio < MINIMUM_CONTRAST) {
      failures.push(
        `${mode} menu item hover contrast ${hover.ratio.toFixed(2)}:1 is below ${MINIMUM_CONTRAST}:1`,
      );
    }

    for (const boundary of [
      'guest-boundary',
      'dialog-surface',
      'popover-surface',
    ]) {
      const actual = await tokenValues(page, boundary);
      for (const [token, expected] of Object.entries(GUEST_TOKENS)) {
        if (actual[token] !== expected) {
          failures.push(
            `${mode} ${boundary} resolves ${token} to ${actual[token] || '<unset>'}, expected ${expected}`,
          );
        }
      }
    }
    await context.close();
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
}

async function captureScreenshots(browser, url) {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    viewport: VIEWPORT,
  });
  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.screenshot({
    path: path.join(
      FIXTURE_ASSETS_ROOT,
      'enterprise-scoped-synthetic-light.png',
    ),
  });
  await page.locator('[data-vibe-probe="mode-control"]').click();
  await page.locator('[data-vibe-probe="dialog-trigger"]').click();
  await page.locator('[data-vibe-probe="popover-trigger"]').click();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: path.join(
      FIXTURE_ASSETS_ROOT,
      'enterprise-scoped-synthetic-dark-dialog.png',
    ),
  });
  await context.close();
}

async function main() {
  const command = process.argv.slice(2).find(argument => argument !== '--');
  if (command !== 'contrast' && command !== 'screenshots') {
    throw new Error('usage: fixture-browser.mjs <contrast|screenshots>');
  }

  const sandboxParent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-fixture-browser-'),
  );
  const sandbox = path.join(sandboxParent, FIXTURE_ID);
  let server;
  let browser;
  try {
    copyFixture(FIXTURE_ID, sandbox);
    runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'], sandbox);
    runPnpm(['typecheck'], sandbox);
    runPnpm(['build'], sandbox);
    server = await preview({
      root: sandbox,
      logLevel: 'silent',
      preview: {host: '127.0.0.1', port: 0, strictPort: false},
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('fixture preview did not expose a TCP port');
    }
    const url = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({headless: true});
    if (command === 'contrast') {
      await verifyContrast(browser, url);
      console.log('guest fixture contrast verified in light and dark modes');
    } else {
      await captureScreenshots(browser, url);
      console.log('updated enterprise fixture gallery screenshots');
    }
  } finally {
    await browser?.close();
    await server?.close();
    fs.rmSync(sandboxParent, {recursive: true, force: true});
  }
}

await main();
