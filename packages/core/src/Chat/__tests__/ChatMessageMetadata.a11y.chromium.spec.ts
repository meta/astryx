// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ChatMessageMetadata

/**
 * @file ChatMessageMetadata.a11y.chromium.spec.ts
 * @input Exact-head Storybook build and component-owned metadata fixtures
 * @output Chromium PNGs, semantic/paint sensor receipts, and a fail-closed manifest
 * @position Browser evidence for the ChatMessageMetadata component audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve(
  'test-results/chat-message-metadata-audit-evidence',
);
const STATES = 'core-chatmessagemetadata--states';
const NARROW = 'core-chatmessagemetadata--narrow-overflow';
const LABELS = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  error: 'Failed',
} as const;

interface Case {
  name: string;
  storyId: string;
  rootCount: number;
  text: string;
  status?: keyof typeof LABELS;
  button?: boolean;
  sender?: 'user' | 'assistant';
}

// These expectations are fixture/source facts, never values copied from a page.
const CASES: Case[] = [
  ...Object.entries(LABELS).map(([status, label]) => ({
    name: `status-${status}`,
    storyId: STATES,
    rootCount: 1,
    text: `10:30·${label}`,
    status: status as keyof typeof LABELS,
    sender: 'user' as const,
  })),
  {
    name: 'assistant-footer',
    storyId: STATES,
    rootCount: 1,
    text: '10:31·Copy reply',
    button: true,
    sender: 'assistant',
  },
  {
    name: 'empty-footer',
    storyId: STATES,
    rootCount: 1,
    text: '10:32',
    sender: 'assistant',
  },
  {
    name: 'empty-timestamp',
    storyId: STATES,
    rootCount: 1,
    text: 'Model info',
    sender: 'assistant',
  },
  {
    name: 'empty-row',
    storyId: STATES,
    rootCount: 0,
    text: '',
    sender: 'assistant',
  },
  {
    name: 'numeric-slots',
    storyId: STATES,
    rootCount: 1,
    text: '0·0',
    sender: 'user',
  },
  {
    name: 'standalone',
    storyId: STATES,
    rootCount: 1,
    text: '11:00·Read',
    status: 'read',
  },
  {
    name: 'narrow-overflow',
    storyId: NARROW,
    rootCount: 1,
    text: '10:32·A longer metadata description that can grow when translated into a different language·Delivered',
    status: 'delivered',
    sender: 'assistant',
  },
];

let server: StaticServer;
let head: string;
let build: string;
const frames: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  if (process.env.ASTRYX_HEAD_SHA && process.env.ASTRYX_HEAD_SHA !== head) {
    throw new Error('PR head differs from the checked out source');
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error('Storybook build is missing its source stamp');
  }
  build = (await stamp.text()).trim();
  if (build !== head) {
    throw new Error('Storybook bytes differ from the PR head');
  }
  fs.mkdirSync(OUTPUT, {recursive: true});
});

test.afterAll(async () => {
  const previous = fs.existsSync(path.join(OUTPUT, 'manifest.json'))
    ? (JSON.parse(fs.readFileSync(path.join(OUTPUT, 'manifest.json'), 'utf8'))
        .frames ?? [])
    : [];
  if (head && build) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/ChatMessageMetadata',
          headSha: head,
          storybookSha: build,
          frames: [...previous, ...frames].filter(
            (frame, index, all) =>
              all.findIndex(
                other =>
                  other.state === frame.state &&
                  other.mode === frame.mode &&
                  other.direction === frame.direction,
              ) === index,
          ),
        },
        null,
        2,
      )}\n`,
    );
  }
  await server?.close();
});

async function capture(
  page: Page,
  scenario: Case,
  mode: 'light' | 'dark',
  direction: 'ltr' | 'rtl',
  options: {
    viewport?: {width: number; height: number};
    coarsePointer?: boolean;
    state?: string;
  } = {},
) {
  const viewport = options.viewport ?? {width: 1024, height: 768};
  const state = options.state ?? scenario.name;
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(String(error));
  page.on('pageerror', onError);
  await page.setViewportSize(viewport);
  await page.goto(
    `${server.origin}/iframe.html?id=${scenario.storyId}&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral;direction:${direction}`,
  );
  const panel = page.locator(`[data-metadata-case="${scenario.name}"]`);
  await panel.waitFor();
  await page.waitForFunction(
    expected =>
      document.documentElement.getAttribute('data-theme') === expected,
    mode,
  );
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  const roots = panel.locator('.astryx-chat-message-metadata');
  const actual = await panel.evaluate((element, expected) => {
    const root = element.querySelector('.astryx-chat-message-metadata');
    const status = root?.querySelector('[title]');
    const rect = element.getBoundingClientRect();
    const rootStyle = root ? getComputedStyle(root) : null;
    return {
      rootCount: element.querySelectorAll('.astryx-chat-message-metadata')
        .length,
      text: (root?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      direction: rootStyle?.direction ?? getComputedStyle(element).direction,
      color: rootStyle?.color ?? null,
      fontSize: rootStyle?.fontSize ?? null,
      statusColor: status ? getComputedStyle(status).color : null,
      statusTitle: status?.getAttribute('title') ?? null,
      statusLabel: status?.getAttribute('aria-label') ?? null,
      buttonCount: element.querySelectorAll('button').length,
      sender:
        element.querySelector('article')?.getAttribute('data-sender') ?? null,
      overflowFree: element.scrollWidth <= element.clientWidth + 1,
      rootWidth: root?.getBoundingClientRect().width ?? null,
      childX: root
        ? [...root.children].map(child => child.getBoundingClientRect().x)
        : [],
      geometry: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      rootVisible: root
        ? root.getBoundingClientRect().width > 0 &&
          root.getBoundingClientRect().height > 0
        : false,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(node => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
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
      mode: document.documentElement.getAttribute('data-theme'),
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      expectedSubject: expected,
    };
  }, scenario.name);
  const expected = {
    build: head,
    storyId: scenario.storyId,
    theme: 'neutral',
    mode,
    direction,
    viewport,
    coarsePointer: options.coarsePointer ?? false,
    reducedMotion: true,
    rootCount: scenario.rootCount,
    text: scenario.text,
    statusTitle: scenario.status ? LABELS[scenario.status] : null,
    buttonCount: scenario.button ? 1 : 0,
    sender: scenario.sender ?? null,
  };
  const failures: string[] = [];
  const check = (ok: boolean, detail: string) => {
    if (!ok) {
      failures.push(detail);
    }
  };
  check(actual.rootCount === expected.rootCount, 'metadata root count');
  check(actual.text === expected.text, 'visible content and separators');
  check(actual.direction === direction, 'computed direction');
  if (scenario.name === 'status-read' || scenario.name === 'assistant-footer') {
    const first = actual.childX[0];
    const last = actual.childX[actual.childX.length - 1];
    const goesRight =
      scenario.sender === 'user' ? direction === 'rtl' : direction === 'ltr';
    check(
      first != null &&
        last != null &&
        (goesRight ? first < last : first > last),
      'sender-relative visual order',
    );
  }
  check(actual.statusTitle === expected.statusTitle, 'translated status title');
  check(actual.buttonCount === expected.buttonCount, 'footer button');
  check(actual.sender === expected.sender, 'message sender');
  check(
    actual.theme === 'neutral' &&
      actual.mode === mode &&
      actual.colorScheme === mode,
    'resolved theme',
  );
  check(
    actual.fonts === 'loaded' && actual.reducedMotion,
    'settled fonts and reduced motion',
  );
  check(
    actual.viewport.width === viewport.width &&
      actual.viewport.height === viewport.height &&
      actual.coarsePointer === expected.coarsePointer,
    'viewport and pointer',
  );
  check(
    actual.geometry.width > 0 &&
      actual.geometry.height > 0 &&
      !actual.storyError,
    'visible fixture with no Storybook error',
  );
  check(
    actual.rootCount === 0 || actual.rootVisible,
    'visible metadata subject',
  );
  check(
    actual.overflowFree && !actual.horizontalOverflow,
    'no horizontal overflow',
  );
  check(errors.length === 0, 'no page errors');
  const file = `ChatMessageMetadata__${state}__neutral-${mode}__${direction}.png`;
  const png = await panel.screenshot({animations: 'disabled'});
  const image = {
    file,
    sha256: createHash('sha256').update(png).digest('hex'),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
  fs.writeFileSync(path.join(OUTPUT, file), png);
  const receipt = {
    expected,
    observed: {...actual, build, storyId: scenario.storyId, pageErrors: errors},
    browser: page.context().browser()?.version() ?? 'unknown',
    image,
    passed: failures.length === 0,
    failures,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${file}.sensors.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  frames.push({
    state,
    mode,
    direction,
    receipt: `${file}.sensors.json`,
    image,
    passed: receipt.passed,
    failures,
  });
  expect(await roots.count()).toBe(actual.rootCount);
  page.off('pageerror', onError);
  return failures.map(detail => `${state}/${mode}/${direction}: ${detail}`);
}

test('captures light and dark status, composition, empty, and overflow states', async ({
  page,
}) => {
  const failures: string[] = [];
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const mode of ['light', 'dark'] as const) {
    for (const scenario of CASES) {
      failures.push(...(await capture(page, scenario, mode, 'ltr')));
    }
  }
  expect(failures).toEqual([]);
});

test('captures sender ordering in RTL', async ({page}) => {
  const failures: string[] = [];
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const mode of ['light', 'dark'] as const) {
    for (const scenario of CASES.filter(
      item => item.name === 'status-read' || item.name === 'assistant-footer',
    )) {
      failures.push(...(await capture(page, scenario, mode, 'rtl')));
    }
  }
  expect(failures).toEqual([]);
});

test('captures narrow touch reflow in both modes', async ({browser}) => {
  const viewport = {width: 320, height: 640};
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const scenario = CASES.find(item => item.name === 'narrow-overflow');
    if (!scenario) {
      throw new Error('Narrow metadata fixture is missing');
    }
    const failures: string[] = [];
    for (const mode of ['light', 'dark'] as const) {
      failures.push(
        ...(await capture(page, scenario, mode, 'ltr', {
          viewport,
          coarsePointer: true,
          state: 'narrow-touch',
        })),
      );
    }
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
