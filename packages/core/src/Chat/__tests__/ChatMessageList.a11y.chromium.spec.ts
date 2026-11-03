// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ChatMessageList

/**
 * @file ChatMessageList.a11y.chromium.spec.ts
 * @input Uses the component-owned Storybook fixtures and exact-head build stamp
 * @output Chromium screenshots and fail-closed semantic sensor receipts
 * @position Browser evidence for the ChatMessageList audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Browser, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/chat-message-list-audit-evidence');
const CONVERSATION = 'core-chatmessagelist--conversation';
const EMPTY = 'core-chatmessagelist--empty';
const DENSITIES = 'core-chatmessagelist--density-and-alignment';
const OVERFLOW = 'core-chatmessagelist--overflow';
const LOADING = 'core-chatmessagelist--loading-older';
const VIEWPORT = {width: 1024, height: 768};

interface Case {
  state: string;
  storyId: string;
  index: number;
  targetCount: number;
  articleCount: number;
  density: 'compact' | 'balanced' | 'spacious';
  busy: boolean;
  text?: string;
  name?: string;
  args?: string;
  viewport?: {width: number; height: number};
  direction?: 'ltr' | 'rtl';
  coarsePointer?: boolean;
  requiresOverflow?: boolean;
  /** The top loader is shown, silent inside the log (spec:AST-086 FR4, FR8). */
  hiddenLoader?: boolean;
}

// Expectations are authored from the public fixture and component source, not
// discovered from the page under test.
const CASES: Case[] = [
  {
    state: 'conversation',
    storyId: CONVERSATION,
    index: 0,
    targetCount: 1,
    articleCount: 2,
    density: 'balanced',
    busy: false,
    text: 'The issue is resolved.',
  },
  {
    state: 'empty',
    storyId: EMPTY,
    index: 0,
    targetCount: 2,
    articleCount: 0,
    density: 'balanced',
    busy: false,
    name: 'Text empty state',
    text: 'No messages yet',
  },
  // This input-state receipt is identical on the broken and corrected builds.
  // The separate visible-output case below must reject the old blank result.
  {
    state: 'numeric-empty',
    storyId: EMPTY,
    index: 1,
    targetCount: 2,
    articleCount: 0,
    density: 'balanced',
    busy: false,
    name: 'Numeric empty state',
  },
  {
    state: 'numeric-empty-visible',
    storyId: EMPTY,
    index: 1,
    targetCount: 2,
    articleCount: 0,
    density: 'balanced',
    busy: false,
    name: 'Numeric empty state',
    text: '0',
  },
  {
    state: 'compact-top',
    storyId: DENSITIES,
    index: 0,
    targetCount: 3,
    articleCount: 1,
    density: 'compact',
    busy: false,
    text: 'A short conversation.',
  },
  {
    state: 'balanced-bottom',
    storyId: DENSITIES,
    index: 1,
    targetCount: 3,
    articleCount: 1,
    density: 'balanced',
    busy: false,
    text: 'A short conversation.',
  },
  {
    state: 'spacious-bottom',
    storyId: DENSITIES,
    index: 2,
    targetCount: 3,
    articleCount: 1,
    density: 'spacious',
    busy: false,
    text: 'A short conversation.',
  },
  {
    state: 'streaming',
    storyId: CONVERSATION,
    index: 0,
    targetCount: 1,
    articleCount: 2,
    density: 'balanced',
    busy: true,
    text: 'The issue is resolved.',
    args: 'isStreaming:true',
  },
  {
    state: 'overflow',
    storyId: OVERFLOW,
    index: 0,
    targetCount: 1,
    articleCount: 8,
    density: 'balanced',
    busy: false,
    text: 'Conversation item 1.',
    requiresOverflow: true,
  },
  {
    state: 'loading-older',
    storyId: LOADING,
    index: 0,
    targetCount: 1,
    articleCount: 1,
    density: 'balanced',
    busy: false,
    text: 'Earlier message remains readable',
    hiddenLoader: true,
  },
];

const frames: Record<string, unknown>[] = [];
let storybook: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let browserVersion = 'unknown';

test.beforeAll(async () => {
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expectedHead = process.env.ASTRYX_HEAD_SHA;
  if (expectedHead && expectedHead !== checkoutSha) {
    throw new Error('The audited checkout does not match the PR head');
  }
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${storybook.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error(
      `The Storybook build has no source stamp (${stamp.status})`,
    );
  }
  storybookSha = (await stamp.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      'The served Storybook build does not match the audited checkout',
    );
  }
  fs.mkdirSync(OUTPUT, {recursive: true});
});

test.afterAll(async () => {
  if (checkoutSha && storybookSha) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/ChatMessageList',
          headSha: checkoutSha,
          storybookSha,
          browser: browserVersion,
          frames,
        },
        null,
        2,
      )}\n`,
    );
  }
  await storybook?.close();
});

async function capture(page: Page, scenario: Case, mode: 'light' | 'dark') {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(String(error));
  page.on('pageerror', onError);
  const viewport = scenario.viewport ?? VIEWPORT;
  try {
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion: 'reduce'});
    browserVersion = page.context().browser()?.version() ?? 'unknown';
    const direction = scenario.direction ?? 'ltr';
    const args = scenario.args
      ? `&args=${encodeURIComponent(scenario.args)}`
      : '';
    await page.goto(
      `${storybook.origin}/iframe.html?id=${scenario.storyId}&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral;direction:${direction}${args}`,
    );
    const logs = page.getByRole('log');
    await logs.first().waitFor();
    if (scenario.hiddenLoader) {
      await page
        .locator('[role="log"] .astryx-spinner[aria-hidden="true"]')
        .waitFor();
    }
    await holdMotionStill(page);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(
      expected =>
        document.documentElement.getAttribute('data-theme') === expected,
      mode,
    );
    const subject = logs.nth(scenario.index);
    const box = await subject.boundingBox();
    const observed = await subject.evaluate(
      (node, measures) => ({
        role: node.getAttribute('role'),
        name: node.getAttribute('aria-label'),
        live: node.getAttribute('aria-live'),
        busy: node.getAttribute('aria-busy'),
        density: node.getAttribute('data-density'),
        direction: getComputedStyle(node).direction,
        text: (node as HTMLElement).innerText,
        articleCount: node.querySelectorAll('article').length,
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        ...(measures.overflow
          ? {
              parentScrollHeight: node.parentElement?.scrollHeight ?? 0,
              parentClientHeight: node.parentElement?.clientHeight ?? 0,
            }
          : {}),
        ...(measures.loader
          ? {
              hiddenLoader:
                node
                  .querySelector('.astryx-spinner')
                  ?.closest('[aria-hidden="true"]') != null,
              exposedStatus: [...node.querySelectorAll('[role="status"]')].some(
                status => status.closest('[aria-hidden="true"]') == null,
              ),
            }
          : {}),
      }),
      {
        overflow: Boolean(scenario.requiresOverflow),
        loader: Boolean(scenario.hiddenLoader),
      },
    );
    const environment = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.bottom > 0 &&
          box.right > 0 &&
          box.top < innerHeight &&
          box.left < innerWidth &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      }),
    }));

    // All assertions precede the screenshot, so a failed sensor cannot mint evidence.
    expect(await logs.count(), scenario.state).toBe(scenario.targetCount);
    expect(box, scenario.state).not.toBeNull();
    expect(await subject.isVisible()).toBe(true);
    expect(observed.role).toBe('log');
    expect(observed.live).toBe('polite');
    expect(observed.busy).toBe(scenario.busy ? 'true' : null);
    expect(observed.density).toBe(scenario.density);
    expect(observed.direction).toBe(direction);
    expect(observed.articleCount).toBe(scenario.articleCount);
    if (scenario.name != null) {
      expect(observed.name).toBe(scenario.name);
    }
    if (scenario.text != null) {
      expect(observed.text).toContain(scenario.text);
    }
    if (scenario.hiddenLoader) {
      expect(observed.hiddenLoader).toBe(true);
      expect(observed.exposedStatus).toBe(false);
    }
    expect(observed.width).toBeGreaterThan(0);
    expect(observed.height).toBeGreaterThan(0);
    if (scenario.requiresOverflow) {
      expect(observed.parentScrollHeight ?? 0).toBeGreaterThan(
        (observed.parentClientHeight ?? 0) + 1,
      );
    }
    expect(environment.theme).toBe('neutral');
    expect(environment.mode).toBe(mode);
    expect(environment.colorScheme).toBe(mode);
    expect(environment.fonts).toBe('loaded');
    expect(environment.viewport).toEqual(viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.forcedColors).toBe(false);
    expect(environment.coarsePointer).toBe(scenario.coarsePointer ?? false);
    expect(environment.storyError).toBe(false);
    if (viewport.width === 320) {
      expect(environment.horizontalOverflow).toBe(false);
      expect(observed.scrollWidth).toBeLessThanOrEqual(
        observed.clientWidth + 1,
      );
    }
    expect(errors).toEqual([]);

    const file = `ChatMessageList__${scenario.state}__neutral-${mode}__${direction}.png`;
    const png = await (
      scenario.requiresOverflow ? subject.locator('xpath=..') : subject
    ).screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);
    const receipt = {
      expected: {
        build: checkoutSha,
        storyId: scenario.storyId,
        theme: 'neutral',
        mode,
        direction,
        viewport,
        targetCount: scenario.targetCount,
        articleCount: scenario.articleCount,
        density: scenario.density,
        busy: scenario.busy,
        name: scenario.name,
        text: scenario.text,
        coarsePointer: scenario.coarsePointer ?? false,
        ...(scenario.requiresOverflow ? {requiresOverflow: true} : {}),
        ...(scenario.hiddenLoader ? {hiddenLoader: true} : {}),
      },
      observed: {
        build: storybookSha,
        storyId: scenario.storyId,
        targetCount: await logs.count(),
        ...observed,
        ...environment,
        pageErrors: errors.length,
        selectorVisible: await subject.isVisible(),
        geometry: box,
      },
      image: {
        file,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      browser: browserVersion,
      passed: true,
    };
    fs.writeFileSync(path.join(OUTPUT, file), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${file}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    frames.push({
      state: scenario.state,
      mode,
      direction,
      receipt: `${file}.sensors.json`,
      image: receipt.image,
    });
  } finally {
    page.off('pageerror', onError);
  }
}

test('captures transcript states in Chromium light and dark', async ({
  page,
}) => {
  for (const mode of ['light', 'dark'] as const) {
    for (const scenario of CASES) {
      await capture(page, scenario, mode);
    }
  }
});

test('captures right-to-left and narrow coarse-pointer transcripts', async ({
  browser,
  page,
}: {
  browser: Browser;
  page: Page;
}) => {
  for (const mode of ['light', 'dark'] as const) {
    await capture(page, {...CASES[0], state: 'rtl', direction: 'rtl'}, mode);
  }
  const context = await browser.newContext({
    viewport: {width: 320, height: 640},
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  try {
    const touchPage = await context.newPage();
    for (const mode of ['light', 'dark'] as const) {
      await capture(
        touchPage,
        {
          ...CASES[0],
          state: 'narrow-touch',
          viewport: {width: 320, height: 640},
          coarsePointer: true,
        },
        mode,
      );
    }
  } finally {
    await context.close();
  }
});
