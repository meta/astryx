// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Capture: turn a shot plan into PNGs, plus the theming evidence needed
 *       to explain a diff.
 *
 * @input  a built Storybook directory and a shot plan
 * @output one PNG per shot under <out>/shots, a capture manifest, and the set
 *         of theming targets actually observed in the DOM
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 * Determinism. A visual gate that flickers is worse than no gate — every
 * false diff costs a human judgement and teaches everyone to ignore it. So
 * the page is pinned: no external network (nothing that renders may depend on
 * a CDN being up), animations and transitions forced to their end state,
 * carets hidden, a fixed viewport and device scale factor, a frozen clock in
 * a fixed timezone, and a wait on `document.fonts.ready` before the shutter.
 * Even so, a baseline is only comparable against a capture from the same OS
 * and browser build, which is why the manifest records the platform and the
 * comparison refuses to cross it.
 *
 * Speed. Storybook applies the theme through a global, so a theme change is a
 * re-render, not a reload: the plan is walked grouped by story, and the theme
 * and color mode are switched over Storybook's own channel while the page
 * stays put (~130ms per shot against ~1s for a reload). Independent story
 * groups run on a small fixed worker pool. Their browser execution is
 * canonicalized by story and starts in the default light theme before any fast
 * global update, so an accepted exact plan and the full release plan cannot
 * seed mount-time state differently. `--no-fast-globals` forces a reload per
 * shot for the case where a story's own state would survive the re-render and
 * make the shot depend on the one before it.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const CONTENT_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Injected before every shot: hold animation at its end state, hide carets. */
const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
html { scrollbar-width: none !important; }
::-webkit-scrollbar { display: none !important; }
`;

/** Injected before every story script: a seeded PRNG in place of Math.random.
 *
 * Most of the stories that could not reproduce themselves were charts built on
 * random sample data — nothing about them is unstable except the numbers. A
 * fixed seed turns them back into ordinary regression subjects instead of
 * entries on an exclusion list. Stories whose instability is real (GPU
 * rasterisation, streaming animation) stay unstable and belong in
 * `excludeStories`.
 */
const SEEDED_RANDOM = `(() => {
  let state = 0x2f6e2b1 >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

// BrowserContext routing does not cover network opened from dedicated/shared
// workers. A static Storybook needs none of these constructors, so remove the
// channels before any PR-authored script runs. Service workers are separately
// disabled in the context options below.
export const BACKGROUND_NETWORK_GUARD = `(() => {
  const Blocked = class {
    constructor() { throw new Error('Network channel disabled during visual capture'); }
  };
  for (const name of ['WebSocket', 'Worker', 'SharedWorker']) {
    Object.defineProperty(globalThis, name, {value: Blocked, configurable: false});
  }
})();`;

/** The instant every capture happens at, and the zone it happens in.
 *
 * Stories that build their data from `new Date()` photograph a different day
 * on every run, so the gate reports them changed every single day — and a
 * gate that always says changed teaches everyone to skim the changed list.
 *
 * Wednesday 13 May 2026, 10:15 UTC, chosen so that a date-driven story still
 * has something to show: mid-month and mid-week, so a "today" marker has
 * ordinary days around it and does not sit on the edge of a month grid; and
 * mid-morning, so the day's earlier events are already past while its later
 * ones are still ahead. A clock that put everything in the past would hide a
 * regression in how future events are drawn. The zone is pinned with it —
 * an instant alone is a different wall-clock hour on every machine, and the
 * hour is the half of this choice that does the work.
 */
const FROZEN_NOW = new Date('2026-05-13T10:15:00Z');
const TIMEZONE_ID = 'UTC';

/**
 * Serve a directory over loopback. The gate never talks to the network, so
 * this is the only origin the browser can reach.
 * @param {string} dir
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
export function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Install the network boundary before any PR-authored Storybook code runs. */
export async function blockExternalNetwork(context, origin) {
  await context.route('**', route =>
    isSameOrigin(route.request().url(), origin) ? route.continue() : route.abort(),
  );
  // A routed WebSocket never connects unless connectToServer() is called. Close
  // every socket: a static Storybook needs none, including its dev-only HMR.
  await context.routeWebSocket(/.*/, socket => socket.close({code: 1008, reason: 'blocked'}));
}

export const CAPTURE_CONTEXT_SECURITY = {serviceWorkers: 'block'};

/**
 * Split a capture plan across workers without ever splitting one story.
 *
 * Story boundaries are load-bearing: theme and mode changes reuse one loaded
 * Storybook document, and every navigation resets the seeded PRNG. Keeping all
 * shots for a story together preserves both fast globals and deterministic
 * random state while letting independent stories run in parallel.
 *
 * @param {import('./plan.mjs').Shot[]} plan
 * @param {number} concurrency
 * @returns {import('./plan.mjs').Shot[][]}
 */
export function partitionCapturePlan(plan, concurrency, bootstrapGlobals = null) {
  if (plan.length === 0) return [];
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), plan.length));
  const groups = [];
  const groupByStory = Object.create(null);
  for (const shot of plan) {
    let group = groupByStory[shot.storyId];
    if (!group) {
      group = [];
      groupByStory[shot.storyId] = group;
      groups.push(group);
    }
    group.push(shot);
  }

  // An accepted PR plan follows baseline insertion order, while the canonical
  // release plan is key-sorted. Fast globals preserve mounted story state, so
  // execution order must come from the shots themselves rather than whichever
  // caller supplied them. The manifest is still written in authoritative plan
  // order; this ordering is only for browser work.
  if (bootstrapGlobals) {
    const isBootstrap = shot =>
      shot.theme === bootstrapGlobals.astryxTheme &&
      shot.mode === bootstrapGlobals.colorMode;
    groups.sort((a, b) => a[0].storyId.localeCompare(b[0].storyId));
    for (const group of groups) {
      group.sort((a, b) => {
        const bootstrap = Number(isBootstrap(b)) - Number(isBootstrap(a));
        return bootstrap || a.key.localeCompare(b.key);
      });
    }
  }

  const partitions = Array.from({length: workerCount}, () => []);
  const loads = Array(workerCount).fill(0);
  for (const group of groups) {
    let worker = 0;
    for (let index = 1; index < workerCount; index += 1) {
      if (loads[index] < loads[worker]) worker = index;
    }
    partitions[worker].push(...group);
    loads[worker] += group.length;
  }
  return partitions.filter(partition => partition.length > 0);
}

export function storyLoadGlobals(shot, fastGlobals, bootstrapGlobals) {
  const requested = {astryxTheme: shot.theme, colorMode: shot.mode};
  const initial = fastGlobals ? bootstrapGlobals : requested;
  return {
    initial,
    requested,
    needsUpdate:
      initial.astryxTheme !== requested.astryxTheme ||
      initial.colorMode !== requested.colorMode,
  };
}

export function serveDirectory(dir) {
  const root = fs.realpathSync(dir);
  const server = http.createServer((req, res) => {
    let requested;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      requested = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.realpath(requested, (realpathError, realPath) => {
      if (realpathError) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      if (realPath !== root && !realPath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(realPath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(realPath)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
  });
  return new Promise(resolve => {
    server.listen(0, () => {
      resolve({
        port: server.address().port,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

/**
 * Every `astryx-*` class present in the document, with the theming data each
 * one carries. This is what turns "these pixels moved" into "the `selected`
 * state stopped reaching `astryx-top-nav-item`", and what proves a theme
 * override had something to bind to at all.
 * @param {import('playwright').Page} page
 * @returns {Promise<Record<string, string[]>>}
 */
async function observeTargets(page) {
  return page.evaluate(() => {
    /** @type {Record<string, Set<string>>} */
    const observed = {};
    for (const element of document.querySelectorAll('[class*="astryx-"]')) {
      for (const className of element.classList) {
        if (!className.startsWith('astryx-')) continue;
        const key = className.slice('astryx-'.length);
        observed[key] ??= new Set();
        for (const attribute of element.attributes) {
          if (!attribute.name.startsWith('data-')) continue;
          const name = attribute.name.slice('data-'.length);
          // themeProps emits bare names for states and name/value for props.
          observed[key].add(attribute.value === '' || attribute.value === 'true' ? name : `${name}:${attribute.value}`);
        }
      }
    }
    return Object.fromEntries(Object.entries(observed).map(([key, values]) => [key, [...values]]));
  });
}

export async function waitForStoryFinished(page, storyId) {
  await page.waitForFunction(
    expectedStoryId => {
      const preview = globalThis.__STORYBOOK_PREVIEW__;
      return preview?.selectionStore?.selection?.storyId === expectedStoryId && preview?.currentRender?.phase === 'finished';
    },
    storyId,
    {timeout: 30000},
  );
}

/**
 * @param {import('playwright').Page} page
 * @param {{astryxTheme: string, colorMode: string}} globals
 * @param {string} storyId
 */
export async function storyUsesPlayFunction(page, storyId) {
  return page.evaluate(expectedStoryId => {
    const preview = globalThis.__STORYBOOK_PREVIEW__;
    return (
      preview?.selectionStore?.selection?.storyId === expectedStoryId &&
      typeof preview?.currentRender?.story?.playFunction === 'function'
    );
  }, storyId);
}

/**
 * @param {import('playwright').Page} page
 * @param {{astryxTheme: string, colorMode: string}} globals
 * @param {string} storyId
 */
export async function applyGlobals(page, globals, storyId) {
  await page.evaluate(
    async ({next, expectedStoryId}) => {
      const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
      if (!channel) throw new Error('Storybook preview channel unavailable');
      await new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
          channel.off('storyFinished', finish);
          clearTimeout(timer);
        };
        const finish = result => {
          if (result?.storyId !== expectedStoryId) return;
          cleanup();
          if (result.status === 'success') resolve(undefined);
          else reject(new Error('Storybook story failed after updating globals'));
        };
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('timed out waiting for storyFinished'));
        }, 15000);
        channel.on('storyFinished', finish);
        channel.emit('updateGlobals', {globals: next});
      });
    },
    {next: globals, expectedStoryId: storyId},
  );
}

/**
 * A theme Storybook does not know about silently renders as the default one,
 * which would quietly compare the wrong picture against the baseline forever.
 * `<Theme>` reflects what it actually applied, so ask the DOM.
 * @param {import('playwright').Page} page
 * @param {{theme: string, mode: string}} expected
 */
async function verifyApplied(page, expected) {
  const applied = await page.evaluate(() => {
    const themed = document.querySelector('[data-astryx-theme]');
    return {
      theme: themed?.getAttribute('data-astryx-theme') ?? null,
      mode: document.documentElement.getAttribute('data-theme'),
    };
  });
  if (applied.theme !== expected.theme) {
    throw new Error(
      `requested theme "${expected.theme}" but the story rendered "${applied.theme}" — register it in apps/storybook/.storybook/preview.tsx`,
    );
  }
  if (applied.mode !== expected.mode) {
    throw new Error(`requested mode "${expected.mode}" but the story rendered "${applied.mode}"`);
  }
}

/**
 * Wait until the page has stopped moving.
 *
 * Fonts and CSS transitions are the easy half; the half that actually bites is
 * layout a component computes in an effect — a selection indicator that
 * measures its target and then positions itself. Under load that lands after
 * the shutter, and the shot differs from the same shot on a quieter run. So
 * the geometry of every themed element is sampled until two consecutive
 * frames agree.
 *
 * @param {import('playwright').Page} page
 * @param {number} settleMs
 */
async function settle(page, settleMs) {
  await page.evaluate(
    ms =>
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms)));
      }),
    settleMs,
  );
  await page.evaluate(() => document.fonts.ready);

  let previous = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const geometry = await page.evaluate(() =>
      [...document.querySelectorAll('[class*="astryx-"]')]
        .map(element => {
          const box = element.getBoundingClientRect();
          return `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`;
        })
        .join('|'),
    );
    if (geometry === previous) return;
    previous = geometry;
    await page.waitForTimeout(25);
  }
}

export function partitionScoutStories(storyIds, concurrency) {
  if (storyIds.length === 0) return [];
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), storyIds.length));
  const partitions = Array.from({length: workerCount}, () => []);
  storyIds.forEach((storyId, index) => partitions[index % workerCount].push(storyId));
  return partitions;
}

async function scoutPartition({storyIds, browser, origin, theme, viewport, onStory}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    timezoneId: TIMEZONE_ID,
    ...CAPTURE_CONTEXT_SECURITY,
  });
  await context.clock.setFixedTime(FROZEN_NOW);
  await context.addInitScript(BACKGROUND_NETWORK_GUARD);
  await context.addInitScript(SEEDED_RANDOM);
  await blockExternalNetwork(context, origin);
  const page = await context.newPage();
  const observations = {};

  try {
    for (const storyId of storyIds) {
      try {
        await page.goto(
          `${origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story&globals=astryxTheme:${theme};colorMode:light`,
          {waitUntil: 'load', timeout: 30000},
        );
        await page.waitForSelector('#storybook-root > *', {timeout: 20000});
        observations[storyId] = await observeTargets(page);
      } catch {
        // A story that will not render is the capture's problem to report, not
        // the scout's; it simply contributes no observations.
        observations[storyId] = {};
      }
      onStory();
    }
  } finally {
    await context.close();
  }
  return observations;
}

/**
 * Load stories without photographing them, and report what each one rendered.
 *
 * A screenshot is expensive; a page load and a DOM read are not. Scouting is
 * how the theme matrix finds a story that actually renders `badge` in its
 * `warning` variant, instead of assuming the component's default story covers
 * every state a theme styles. Without it the matrix photographs the same
 * default over and over and leaves most overrides unverified.
 *
 * @param {object} options
 * @param {string[]} options.storyIds
 * @param {string} options.storybookDir
 * @param {string} options.theme - any theme; observed targets do not depend on it
 * @param {{width: number, height: number}} options.viewport
 * @param {number} [options.concurrency]
 * @param {(progress: {done: number, total: number}) => void} [options.onProgress]
 * @returns {Promise<Record<string, Record<string, string[]>>>} story id → observed targets
 */
export async function scout({storyIds, storybookDir, theme, viewport, concurrency = 1, onProgress}) {
  const {chromium} = await import('playwright');
  const server = await serveDirectory(storybookDir);
  const origin = `http://127.0.0.1:${server.port}`;
  let browser;
  try {
    browser = await chromium.launch();
    let done = 0;
    const results = await Promise.all(
      partitionScoutStories(storyIds, concurrency).map(partition =>
        scoutPartition({
          storyIds: partition,
          browser,
          origin,
          theme,
          viewport,
          onStory: () => onProgress?.({done: ++done, total: storyIds.length}),
        }),
      ),
    );
    const observed = Object.assign({}, ...results);
    return Object.fromEntries(storyIds.map(storyId => [storyId, observed[storyId] ?? {}]));
  } finally {
    await browser?.close().catch(() => {});
    await server.close();
  }
}

async function capturePartition({
  plan,
  browser,
  origin,
  shotsDir,
  viewport,
  settleMs,
  fastGlobals,
  bootstrapGlobals,
  onShot,
}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    timezoneId: TIMEZONE_ID,
    ...CAPTURE_CONTEXT_SECURITY,
  });
  await context.clock.setFixedTime(FROZEN_NOW);
  await context.addInitScript(BACKGROUND_NETWORK_GUARD);
  await context.addInitScript(SEEDED_RANDOM);
  await blockExternalNetwork(context, origin);
  const page = await context.newPage();
  await page.addStyleTag({content: FREEZE_CSS}).catch(() => {});

  const shots = {};
  const observed = {};
  const failures = [];
  const playStories = new Set();
  let currentStory = null;
  const loadStory = async (shot, globals) => {
    const globalsParam = `astryxTheme:${globals.astryxTheme};colorMode:${globals.colorMode}`;
    await page.goto(
      `${origin}/iframe.html?id=${encodeURIComponent(shot.storyId)}&viewMode=story&globals=${globalsParam}`,
      {waitUntil: 'load', timeout: 30000},
    );
    await page.waitForSelector('#storybook-root > *', {timeout: 30000});
    await waitForStoryFinished(page, shot.storyId);
  };

  try {
    for (const shot of plan) {
      try {
        const {initial, requested: globals} = storyLoadGlobals(
          shot,
          fastGlobals,
          bootstrapGlobals,
        );
        const knownPlayStory = playStories.has(shot.storyId);
        const needsLoad =
          !fastGlobals || currentStory !== shot.storyId || knownPlayStory;
        if (needsLoad) {
          const loadGlobals = knownPlayStory ? globals : initial;
          await loadStory(shot, loadGlobals);
          const usesPlay =
            knownPlayStory ||
            (await storyUsesPlayFunction(page, shot.storyId));
          if (usesPlay) playStories.add(shot.storyId);
          currentStory = shot.storyId;
          if (
            loadGlobals.astryxTheme !== globals.astryxTheme ||
            loadGlobals.colorMode !== globals.colorMode
          ) {
            if (usesPlay) {
              // A globals rerender does not replay Storybook interactions. Load
              // the final environment directly so play state cannot leak from
              // the bootstrap theme or disappear during the rerender.
              await loadStory(shot, globals);
            } else {
              // Let mount-time state settle in one canonical environment before a
              // fast global update. Otherwise a default-open layer remembers the
              // first theme in the caller's plan and every later shot inherits it.
              await page.addStyleTag({content: FREEZE_CSS});
              await settle(page, settleMs);
              await verifyApplied(page, {
                theme: loadGlobals.astryxTheme,
                mode: loadGlobals.colorMode,
              });
              await applyGlobals(page, globals, shot.storyId);
            }
          }
        } else {
          await applyGlobals(page, globals, shot.storyId);
        }
        await page.addStyleTag({content: FREEZE_CSS});
        await settle(page, settleMs);
        await verifyApplied(page, {theme: shot.theme, mode: shot.mode});

        const png = await page.screenshot({fullPage: true, animations: 'disabled'});
        fs.writeFileSync(path.join(shotsDir, `${shot.key}.png`), png);
        const size = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        shots[shot.key] = {
          sha256: crypto.createHash('sha256').update(png).digest('hex'),
          width: size.width,
          height: size.height,
          storyId: shot.storyId,
          title: shot.title,
          name: shot.name,
          component: shot.component,
          theme: shot.theme,
          mode: shot.mode,
          reasons: shot.reasons,
        };

        for (const [key, values] of Object.entries(await observeTargets(page))) {
          observed[key] ??= new Set();
          for (const value of values) observed[key].add(value);
        }
      } catch (error) {
        failures.push({key: shot.key, error: String(error?.message ?? error).slice(0, 400)});
        // A story that will not render poisons the page for the next shot in the
        // same story group; force a fresh navigation on the next iteration.
        currentStory = null;
      }
      onShot(shot.key);
    }
  } finally {
    await context.close();
  }

  return {shots, observed, failures};
}

/**
 * @param {object} options
 * @param {import('./plan.mjs').Shot[]} options.plan
 * @param {string} options.storybookDir
 * @param {string} options.outDir
 * @param {{width: number, height: number}} options.viewport
 * @param {number} options.settleMs
 * @param {boolean} options.fastGlobals
 * @param {{astryxTheme: string, colorMode: string}} options.bootstrapGlobals
 * @param {number} [options.concurrency]
 * @param {(progress: {done: number, total: number, key: string}) => void} [options.onProgress]
 * @returns {Promise<{manifest: object, failures: Array<{key: string, error: string}>}>}
 */
export async function capture({
  plan,
  storybookDir,
  outDir,
  viewport,
  settleMs,
  fastGlobals,
  bootstrapGlobals,
  concurrency = 1,
  onProgress,
}) {
  const {chromium} = await import('playwright');
  const shotsDir = path.join(outDir, 'shots');
  fs.mkdirSync(shotsDir, {recursive: true});

  const server = await serveDirectory(storybookDir);
  const origin = `http://127.0.0.1:${server.port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const browserVersion = browser.version();
    let done = 0;
    const results = await Promise.all(
      partitionCapturePlan(plan, concurrency, bootstrapGlobals).map(partition =>
        capturePartition({
          plan: partition,
          browser,
          origin,
          shotsDir,
          viewport,
          settleMs,
          fastGlobals,
          bootstrapGlobals,
          onShot: key => onProgress?.({done: ++done, total: plan.length, key}),
        }),
      ),
    );

    const captured = Object.assign({}, ...results.map(result => result.shots));
    const shots = Object.fromEntries(
      plan.filter(shot => captured[shot.key]).map(shot => [shot.key, captured[shot.key]]),
    );
    const observed = {};
    for (const result of results) {
      for (const [key, values] of Object.entries(result.observed)) {
        observed[key] ??= new Set();
        for (const value of values) observed[key].add(value);
      }
    }

    const failuresByKey = Object.fromEntries(
      results.flatMap(result => result.failures).map(failure => [failure.key, failure]),
    );
    const failures = plan.flatMap(shot =>
      failuresByKey[shot.key] ? [failuresByKey[shot.key]] : [],
    );

    return {
      manifest: {
        version: 1,
        platform: `${process.platform}-${process.arch}`,
        browser: `chromium-${browserVersion}`,
        viewport,
        settleMs,
        frozenClock: FROZEN_NOW.toISOString(),
        timezoneId: TIMEZONE_ID,
        capturedAt: new Date().toISOString(),
        shots,
        observedTargets: Object.fromEntries(
          Object.entries(observed).map(([key, values]) => [key, [...values].sort()]),
        ),
      },
      failures,
    };
  } finally {
    await browser?.close().catch(() => {});
    await server.close();
  }
}
