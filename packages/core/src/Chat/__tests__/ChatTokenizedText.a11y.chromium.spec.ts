// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ChatTokenizedText

/**
 * @file ChatTokenizedText.a11y.chromium.spec.ts
 * @input Exact-head Storybook build and ChatTokenizedText stories
 * @output Light/dark PNGs, 10-sensor receipts, contact sheet, and fail-closed manifest
 * @position Real-browser evidence for the ChatTokenizedText component audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/chat-tokenized-text-audit-evidence');
const TARGET = '.astryx-chat-tokenized-text';

type Mode = 'light' | 'dark';

interface AuditCase {
  key: string;
  storyId: string;
  expectedTokens: number;
  expectedBadges: number;
  expectedText: string[];
  excludedText?: string[];
  narrow?: boolean;
}

interface ImageReceipt {
  file: string;
  sha256: string;
  width: number;
  height: number;
  distinctColors: number;
  nonBlank: boolean;
}

interface FrameReceipt {
  frame: string;
  passed: boolean;
  failures: string[];
  sensors: Record<
    string,
    {expected: unknown; observed: unknown; passed: boolean}
  >;
  image: ImageReceipt;
}

const CASES: AuditCase[] = [
  {
    key: 'single-token',
    storyId: 'core-chattokenizedtext--single-token',
    expectedTokens: 1,
    expectedBadges: 1,
    expectedText: ['@Cindy Zhang'],
  },
  {
    key: 'multiple-tokens',
    storyId: 'core-chattokenizedtext--multiple-tokens',
    expectedTokens: 3,
    expectedBadges: 3,
    expectedText: ['@Cindy Zhang', '@Alex Rivera', '@Navi'],
  },
  {
    key: 'plain-text',
    storyId: 'core-chattokenizedtext--plain-text',
    expectedTokens: 0,
    expectedBadges: 0,
    expectedText: ['Just a regular message with no mentions.'],
  },
  {
    key: 'mixed-variants',
    storyId: 'core-chattokenizedtext--mixed-variants',
    expectedTokens: 3,
    expectedBadges: 3,
    expectedText: ['@Cindy', '#bug', '#feature'],
  },
  {
    key: 'tokens-at-edges',
    storyId: 'core-chattokenizedtext--tokens-at-edges',
    expectedTokens: 2,
    expectedBadges: 2,
    expectedText: ['@Cindy Zhang', '@Navi'],
  },
  {
    key: 'icon-and-custom',
    storyId: 'core-chattokenizedtext--icon-and-custom-tokens',
    expectedTokens: 2,
    expectedBadges: 1,
    expectedText: ['@Cindy Zhang', '@Navi'],
  },
  {
    key: 'empty-value-narrow',
    storyId: 'core-chattokenizedtext--empty-value-narrow',
    expectedTokens: 1,
    expectedBadges: 1,
    expectedText: ['@Alice Rivera', 'remains readable'],
    excludedText: ['Ignored'],
    narrow: true,
  },
];

let server: StaticServer | undefined;
let head = '';
let storybookHead = '';
let browserVersion = 'unknown';
const receipts: FrameReceipt[] = [];

function inspectPng(file: string, bytes: Buffer): ImageReceipt {
  const png = PNG.sync.read(bytes);
  const colors = new Set<string>();
  for (let index = 0; index < png.data.length; index += 4) {
    colors.add(
      `${png.data[index]},${png.data[index + 1]},${png.data[index + 2]},${png.data[index + 3]}`,
    );
  }
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: png.width,
    height: png.height,
    distinctColors: colors.size,
    nonBlank: colors.size > 1,
  };
}

function storyUrl(auditCase: AuditCase, mode: Mode): string {
  return (
    `${server?.origin}/iframe.html?id=${auditCase.storyId}&viewMode=story` +
    `&globals=colorMode:${mode};astryxTheme:neutral;direction:ltr`
  );
}

async function capture(
  page: Page,
  auditCase: AuditCase,
  mode: Mode,
): Promise<string[]> {
  const viewport = auditCase.narrow
    ? {width: 320, height: 640}
    : {width: 1024, height: 768};
  await page.setViewportSize(viewport);
  const errors: string[] = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', error => errors.push(String(error)));
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  await page.goto(storyUrl(auditCase, mode));
  await page.locator(TARGET).waitFor();
  await page.waitForFunction(
    expected =>
      document.documentElement.getAttribute('data-theme') === expected,
    mode,
  );
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);

  const actual = await page.locator(TARGET).evaluate(element => {
    const root = element as HTMLElement;
    const rect = root.getBoundingClientRect();
    const storyRoot = document.getElementById('storybook-root');
    const style = getComputedStyle(root);
    return {
      storyId: new URL(location.href).searchParams.get('id'),
      tagName: root.tagName,
      targetCount: document.querySelectorAll('.astryx-chat-tokenized-text')
        .length,
      tokenCount: root.querySelectorAll(':scope > span').length,
      badgeCount: root.querySelectorAll('[data-variant]').length,
      text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
      interactiveCount: root.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
      direction: style.direction,
      display: style.display,
      geometry: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
      },
      viewport: {width: innerWidth, height: innerHeight},
      storyOverflowFree:
        storyRoot == null || storyRoot.scrollWidth <= storyRoot.clientWidth,
      fontsReady: document.fonts.status === 'loaded',
      storyError:
        document.querySelector('[data-storybook-error]') != null ||
        document.body.textContent?.includes('Error rendering story') === true,
      themeName:
        document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme') ?? null,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  });

  const file = `ChatTokenizedText__${auditCase.key}__neutral-${mode}__ltr.png`;
  const bytes = await page
    .locator('#storybook-root')
    .screenshot({animations: 'disabled'});
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  const image = inspectPng(file, bytes);

  const failures: string[] = [];
  if (actual.storyId !== auditCase.storyId) {
    failures.push('Storybook served the wrong story');
  }
  if (actual.tagName !== 'SPAN') {
    failures.push('root is not a span');
  }
  if (actual.targetCount !== 1) {
    failures.push('theme target is not unique');
  }
  if (actual.tokenCount !== auditCase.expectedTokens) {
    failures.push(
      `expected ${auditCase.expectedTokens} rendered tokens, observed ${actual.tokenCount}`,
    );
  }
  if (actual.badgeCount !== auditCase.expectedBadges) {
    failures.push(
      `expected ${auditCase.expectedBadges} badges, observed ${actual.badgeCount}`,
    );
  }
  for (const text of auditCase.expectedText) {
    if (!actual.text.includes(text)) {
      failures.push(`missing text: ${text}`);
    }
  }
  for (const text of auditCase.excludedText ?? []) {
    if (actual.text.includes(text)) {
      failures.push(`unexpected text: ${text}`);
    }
  }
  if (actual.interactiveCount !== 0) {
    failures.push('unexpected interactive child');
  }
  if (actual.direction !== 'ltr') {
    failures.push('unexpected direction');
  }
  if (actual.themeName !== 'neutral') {
    failures.push('neutral theme did not settle');
  }
  if (actual.theme !== mode) {
    failures.push('theme mode did not settle');
  }
  if (!actual.storyOverflowFree) {
    failures.push('component story overflow detected');
  }
  if (
    actual.geometry.width <= 0 ||
    actual.geometry.height <= 0 ||
    actual.geometry.x < 0 ||
    actual.geometry.right > actual.viewport.width
  ) {
    failures.push('subject geometry escaped the viewport');
  }
  if (!actual.fontsReady) {
    failures.push('fonts did not settle');
  }
  if (actual.storyError) {
    failures.push('Storybook rendered an error');
  }
  if (errors.length > 0) {
    failures.push(`page errors: ${errors.join('; ')}`);
  }
  if (!image.nonBlank) {
    failures.push('blank image');
  }

  const sensors: FrameReceipt['sensors'] = {
    Build: {
      expected: head,
      observed: storybookHead,
      passed: head === storybookHead,
    },
    Story: {
      expected: auditCase.storyId,
      observed: actual.storyId,
      passed: actual.storyId === auditCase.storyId,
    },
    Theme: {
      expected: 'neutral',
      observed: actual.themeName,
      passed: actual.themeName === 'neutral',
    },
    'Color mode': {
      expected: mode,
      observed: actual.theme,
      passed: mode === actual.theme,
    },
    Direction: {
      expected: 'ltr',
      observed: actual.direction,
      passed: actual.direction === 'ltr',
    },
    'Viewport/media': {
      expected: viewport,
      observed: actual.viewport,
      passed:
        actual.viewport.width === viewport.width &&
        actual.viewport.height === viewport.height,
    },
    'Rendered state': {
      expected: {
        tokenCount: auditCase.expectedTokens,
        badgeCount: auditCase.expectedBadges,
        expectedText: auditCase.expectedText,
        excludedText: auditCase.excludedText ?? [],
        interactiveCount: 0,
      },
      observed: {
        tokenCount: actual.tokenCount,
        badgeCount: actual.badgeCount,
        text: actual.text,
        interactiveCount: actual.interactiveCount,
      },
      passed: failures.every(
        failure =>
          !failure.includes('token') &&
          !failure.includes('badge') &&
          !failure.includes('text') &&
          !failure.includes('interactive'),
      ),
    },
    'Subject geometry': {
      expected: {visible: true, overflowFree: true, insideViewport: true},
      observed: {
        geometry: actual.geometry,
        storyOverflowFree: actual.storyOverflowFree,
      },
      passed:
        actual.geometry.width > 0 &&
        actual.geometry.height > 0 &&
        actual.geometry.x >= 0 &&
        actual.geometry.right <= actual.viewport.width &&
        actual.storyOverflowFree,
    },
    'Settled render': {
      expected: {fontsReady: true, pageErrors: 0, storyError: false},
      observed: {
        fontsReady: actual.fontsReady,
        pageErrors: errors,
        storyError: actual.storyError,
      },
      passed: actual.fontsReady && errors.length === 0 && !actual.storyError,
    },
    Image: {
      expected: {nonBlank: true, nonZeroPixels: true},
      observed: image,
      passed: image.nonBlank && image.width > 0 && image.height > 0,
    },
  };

  const frame = `${auditCase.key}__neutral-${mode}__ltr`;
  const receipt: FrameReceipt = {
    frame,
    passed:
      failures.length === 0 &&
      Object.values(sensors).every(sensor => sensor.passed),
    failures,
    sensors,
    image,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${frame}.sensors.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  receipts.push(receipt);
  return failures.map(failure => `${frame}: ${failure}`);
}

async function writeContactSheet(page: Page): Promise<ImageReceipt> {
  const figures = receipts
    .map(receipt => {
      const bytes = fs.readFileSync(path.join(OUTPUT, receipt.image.file));
      return `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt=""><figcaption>${receipt.frame}</figcaption></figure>`;
    })
    .join('');
  await page.setViewportSize({width: 1200, height: 900});
  await page.setContent(`<!doctype html>
    <style>
      html { color-scheme: light; background: #f3f4f6; }
      body { margin: 20px; font: 12px/1.35 system-ui, sans-serif; color: #111827; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      figure { margin: 0; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; background: white; }
      img { display: block; width: 100%; height: 120px; object-fit: contain; }
      figcaption { margin-top: 8px; overflow-wrap: anywhere; }
    </style>
    <h1>ChatTokenizedText exact-head state evidence</h1>
    <main>${figures}</main>`);
  await page.locator('img').evaluateAll(async images => {
    await Promise.all(
      images.map(async image => {
        const candidate = image as HTMLImageElement;
        if (candidate.complete) {
          return;
        }
        await new Promise<void>((resolve, reject) => {
          candidate.addEventListener('load', () => resolve(), {once: true});
          candidate.addEventListener(
            'error',
            () => reject(new Error('image failed')),
            {
              once: true,
            },
          );
        });
      }),
    );
  });
  const file = 'ChatTokenizedText__contact-sheet.png';
  const bytes = await page.screenshot({fullPage: true, animations: 'disabled'});
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  return inspectPng(file, bytes);
}

test.describe.configure({mode: 'serial', retries: 0});

test.beforeAll(async () => {
  head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const dirty = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'apps/storybook/stories/ChatTokenizedText.stories.tsx',
      'packages/core/src/Chat/ChatTokenizedText.tsx',
      'packages/core/src/Chat/__tests__/ChatTokenizedText.a11y.chromium.spec.ts',
    ],
    {encoding: 'utf8'},
  ).trim();
  if (dirty !== '') {
    throw new Error(
      `browser evidence requires committed source files: ${dirty}`,
    );
  }
  if (process.env.ASTRYX_HEAD_SHA && process.env.ASTRYX_HEAD_SHA !== head) {
    throw new Error('PR head differs from the checked out source');
  }
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error('Storybook build is missing its source stamp');
  }
  storybookHead = (await stamp.text()).trim();
  if (storybookHead !== head) {
    throw new Error('Storybook bytes differ from the PR head');
  }
});

test.afterAll(async () => {
  const expectedFrames = CASES.flatMap(auditCase =>
    (['light', 'dark'] as const).map(
      mode => `${auditCase.key}__neutral-${mode}__ltr`,
    ),
  );
  const observed = new Set(receipts.map(receipt => receipt.frame));
  const failures = [
    ...expectedFrames
      .filter(frame => !observed.has(frame))
      .map(frame => `missing frame: ${frame}`),
    ...receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => `failed frame: ${receipt.frame}`),
  ];
  const contactSheetFile = 'ChatTokenizedText__contact-sheet.png';
  const contactSheetPath = path.join(OUTPUT, contactSheetFile);
  const contactSheet = fs.existsSync(contactSheetPath)
    ? inspectPng(contactSheetFile, fs.readFileSync(contactSheetPath))
    : null;
  if (contactSheet?.nonBlank !== true) {
    failures.push('missing contact sheet');
  }
  if (head && storybookHead) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/ChatTokenizedText',
          headSha: head,
          storybookSha: storybookHead,
          baselineHeadSha: process.env.ASTRYX_AUDIT_BASELINE_HEAD ?? null,
          browser: browserVersion,
          failClosed: true,
          matrixComplete: failures.length === 0,
          matrixFailures: failures,
          sensorCount: 10,
          requiredSensors: [
            'Build',
            'Story',
            'Theme',
            'Color mode',
            'Direction',
            'Viewport/media',
            'Rendered state',
            'Subject geometry',
            'Settled render',
            'Image',
          ],
          visualEvidence: {
            requiredPair: false,
            reason:
              'The repair removes a non-advancing empty match and does not intentionally change settled pixels. The base behavior has no settled before frame because rendering does not terminate; bounded unit evidence proves that failure, and exact-head frames verify the repaired state.',
            subjectiveAcceptanceClaimed: false,
            contactSheet,
          },
          notApplicable: {
            hover: 'ChatTokenizedText owns no interaction.',
            focus: 'ChatTokenizedText introduces no focusable element.',
            pressed: 'ChatTokenizedText has no activation behavior.',
            disabled: 'ChatTokenizedText exposes no disabled state.',
            loading: 'ChatTokenizedText exposes no loading state.',
            selected: 'ChatTokenizedText exposes no selection state.',
            keyboard: 'ChatTokenizedText owns no keyboard interaction.',
            pointerTarget: 'ChatTokenizedText owns no pointer target.',
            rtl: 'A source-hashed verified-N/A record covers its direction-neutral inline flow.',
          },
          unverified: {
            assistiveTechnology:
              'Browser semantics and axe output are measured; spoken output was not tested with assistive technology.',
            customTokenContent:
              'Semantics, interaction, and paint inside custom token renderers remain caller owned.',
          },
          stateVisualConformance: {
            states: CASES.map(auditCase => auditCase.key),
            colorModes: ['light', 'dark'],
            narrow320: ['empty-value-narrow'],
          },
          frames: receipts,
        },
        null,
        2,
      )}\n`,
    );
  }
  await server?.close();
  expect(failures, 'complete exact-head evidence matrix').toEqual([]);
});

test('captures the complete light, dark, and 320px state matrix', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const failures: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    for (const auditCase of CASES) {
      failures.push(...(await capture(page, auditCase, mode)));
    }
  }
  const contactSheet = await writeContactSheet(page);
  if (!contactSheet.nonBlank) {
    failures.push('contact sheet is blank');
  }
  expect(failures).toEqual([]);
});
