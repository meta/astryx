// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ChatSystemMessage

/**
 * @file ChatSystemMessage.a11y.chromium.spec.ts
 * @input Exact-head Storybook build plus checked-in ChatSystemMessage audit fixtures
 * @output Chromium PNGs, canonical 10-sensor receipts, D7 pairs, and a fail-closed manifest
 * @position Real-browser evidence for the ChatSystemMessage component audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Browser, type Page} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/chat-system-message-audit-evidence');
const STATES_STORY = 'a11y-chatsystemmessage-audit--states';
const NARROW_STORY = 'a11y-chatsystemmessage-audit--narrow';

type Mode = 'light' | 'dark';
type Direction = 'ltr';
type Rgba = {r: number; g: number; b: number; a: number};

interface AuditCase {
  key: string;
  storyId: string;
  text: string;
  variant: 'default' | 'divider';
  expectedIconCount: number | null;
  narrow: boolean;
  expectWrap?: boolean;
  nestedInLiveLog?: boolean;
}

interface ContrastPair {
  part: 'text' | 'icon' | 'divider-line';
  meaningful: boolean;
  foreground: string;
  backdrop: string;
  ratio: number | null;
  threshold: number | null;
  exception: string | null;
  passed: boolean;
}

interface ImageReceipt {
  file: string;
  sha256: string;
  width: number;
  height: number;
  distinctColors: number;
  nonBlank: boolean;
}

const CASES: AuditCase[] = [
  {
    key: 'default',
    storyId: STATES_STORY,
    text: 'Conversation started',
    variant: 'default',
    expectedIconCount: 0,
    narrow: false,
  },
  {
    key: 'default-icon',
    storyId: STATES_STORY,
    text: 'Messages are end-to-end encrypted',
    variant: 'default',
    expectedIconCount: 1,
    narrow: false,
  },
  {
    key: 'divider',
    storyId: STATES_STORY,
    text: 'Today',
    variant: 'divider',
    expectedIconCount: 0,
    narrow: false,
  },
  {
    key: 'divider-icon',
    storyId: STATES_STORY,
    text: 'March 15, 2026',
    variant: 'divider',
    // The public contract for this combination is unresolved. Record the
    // observed count without freezing either candidate behavior in this test.
    expectedIconCount: null,
    narrow: false,
  },
  {
    key: 'nested-log',
    storyId: STATES_STORY,
    text: 'Conversation archived',
    variant: 'default',
    expectedIconCount: 0,
    narrow: false,
    nestedInLiveLog: true,
  },
  {
    key: 'narrow-default',
    storyId: NARROW_STORY,
    text: 'Conversation marked as resolved',
    variant: 'default',
    expectedIconCount: 1,
    narrow: true,
  },
  {
    key: 'narrow-divider',
    storyId: NARROW_STORY,
    text: 'March 15, 2026',
    variant: 'divider',
    expectedIconCount: 0,
    narrow: true,
  },
  {
    key: 'long-default',
    storyId: NARROW_STORY,
    text: 'Messages are end-to-end encrypted for everyone in this conversation and on every signed-in device.',
    variant: 'default',
    expectedIconCount: 1,
    narrow: true,
    expectWrap: true,
  },
];

let server: StaticServer;
let head = '';
let build = '';
let browserVersion = 'unknown';
const receipts: Record<string, unknown>[] = [];

function parseRgb(value: string): Rgba | null {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return channels.length >= 3
    ? {r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1}
    : null;
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  const channel = (front: number, back: number) =>
    alpha === 0
      ? 0
      : (front * foreground.a + back * background.a * (1 - foreground.a)) /
        alpha;
  return {
    r: channel(foreground.r, background.r),
    g: channel(foreground.g, background.g),
    b: channel(foreground.b, background.b),
    a: alpha,
  };
}

function luminance(color: Rgba): number {
  const linear = [color.r, color.g, color.b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number | null {
  const front = parseRgb(foreground);
  const back = parseRgb(background);
  if (front == null || back == null) {
    return null;
  }
  const resolved = front.a < 1 ? composite(front, back) : front;
  const first = luminance(resolved);
  const second = luminance(back);
  return Number(
    (
      (Math.max(first, second) + 0.05) /
      (Math.min(first, second) + 0.05)
    ).toFixed(2),
  );
}

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

function storyUrl(storyId: string, mode: Mode): string {
  return (
    `${server.origin}/iframe.html?id=${storyId}&viewMode=story` +
    `&globals=colorMode:${mode};astryxTheme:neutral;direction:ltr`
  );
}

async function openCase(
  page: Page,
  auditCase: AuditCase,
  mode: Mode,
): Promise<{errors: string[]}> {
  const errors: string[] = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', error => errors.push(String(error)));
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  await page.goto(storyUrl(auditCase.storyId, mode));
  await page.locator(`[data-system-message-case="${auditCase.key}"]`).waitFor();
  await page.waitForFunction(
    expected =>
      document.documentElement.getAttribute('data-theme') === expected,
    mode,
  );
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  return {errors};
}

async function capture(
  page: Page,
  auditCase: AuditCase,
  mode: Mode,
  errors: string[],
  options: {
    viewport?: {width: number; height: number};
    coarsePointer?: boolean;
    touchPoints?: boolean;
  } = {},
): Promise<string[]> {
  const viewport = options.viewport ?? {width: 1024, height: 768};
  await page.setViewportSize(viewport);
  const target = page.locator(`[data-system-message-case="${auditCase.key}"]`);
  const actual = await target.evaluate(element => {
    const root = element as HTMLElement;
    const rootStyle = getComputedStyle(root);
    const separator = root.querySelector<HTMLElement>('[role="separator"]');
    const labelId = separator?.getAttribute('aria-labelledby');
    const label = labelId ? document.getElementById(labelId) : null;
    const textElement = label ?? root;
    const content = root.firstElementChild as HTMLElement | null;
    const textStyle = getComputedStyle(textElement);
    const line = separator?.firstElementChild as HTMLElement | null;
    const lineStyle = line ? getComputedStyle(line) : null;
    const rect = root.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect() ?? null;
    const liveLog = root.closest<HTMLElement>('[role="log"]');
    const textLineTops = new Set<number>();
    const textWalker = document.createTreeWalker(
      textElement,
      NodeFilter.SHOW_TEXT,
    );
    for (
      let textNode = textWalker.nextNode();
      textNode != null;
      textNode = textWalker.nextNode()
    ) {
      if ((textNode.textContent ?? '').trim() === '') {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(textNode);
      for (const lineRect of range.getClientRects()) {
        if (lineRect.width > 0 && lineRect.height > 0) {
          textLineTops.add(Math.round(lineRect.top * 2) / 2);
        }
      }
    }
    const textLineCount = textLineTops.size;
    const parse = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return channels.length >= 3
        ? {r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1}
        : null;
    };
    const candidates: Element[] = [];
    for (
      let current = root.parentElement;
      current != null;
      current = current.parentElement
    ) {
      candidates.push(current);
    }
    candidates.push(document.body, document.documentElement);
    const surfaceBackground =
      candidates
        .map(candidate => getComputedStyle(candidate).backgroundColor)
        .find(value => {
          const color = parse(value);
          return color != null && color.a > 0.99;
        }) ?? 'transparent';
    const surface = parse(surfaceBackground);
    const surfaceLuminanceClass =
      surface == null
        ? 'unknown'
        : (() => {
            const linear = [surface.r, surface.g, surface.b].map(channel => {
              const value = channel / 255;
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            });
            const value =
              0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
            return value > 0.5 ? 'light' : 'dark';
          })();
    return {
      storyId: new URL(location.href).searchParams.get('id'),
      selectorCount: document.querySelectorAll(
        `[data-system-message-case="${root.dataset.systemMessageCase}"]`,
      ).length,
      visible: rect.width > 0 && rect.height > 0,
      text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
      role: root.getAttribute('role'),
      variant: root.getAttribute('data-variant'),
      separatorCount: root.querySelectorAll('[role="separator"]').length,
      separatorOrientation: separator?.getAttribute('aria-orientation') ?? null,
      separatorLabelledTargetText:
        label?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      iconCount: root.querySelectorAll('svg, [data-slot="icon"]').length,
      interactiveCount: root.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
      direction: rootStyle.direction,
      color: textStyle.color,
      iconColor:
        root.querySelector('svg, [data-slot="icon"]') == null
          ? null
          : getComputedStyle(
              root.querySelector('svg, [data-slot="icon"]') as Element,
            ).color,
      lineColor: lineStyle?.backgroundColor ?? null,
      fontSize: textStyle.fontSize,
      geometry: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      contentGeometry:
        contentRect == null
          ? null
          : {
              x: contentRect.x,
              y: contentRect.y,
              width: contentRect.width,
              height: contentRect.height,
            },
      contentStartsWithinRoot:
        contentRect == null || contentRect.left >= rect.left - 1,
      contentEndsWithinRoot:
        contentRect == null || contentRect.right <= rect.right + 1,
      textLineCount,
      liveLog:
        liveLog == null
          ? null
          : {
              role: liveLog.getAttribute('role'),
              ariaLive: liveLog.getAttribute('aria-live'),
            },
      overflowFree:
        root.scrollWidth <= root.clientWidth + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1,
      mode: document.documentElement.getAttribute('data-theme'),
      theme:
        document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme') ?? null,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      surfaceBackground,
      surfaceLuminanceClass,
      viewport: {width: innerWidth, height: innerHeight},
      devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      hoverCapable: matchMedia('(hover: hover)').matches,
      touchPoints: navigator.maxTouchPoints,
      fontsReady: document.fonts.status === 'loaded',
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
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      }),
    };
  });

  const file = `ChatSystemMessage__${auditCase.key}__neutral-${mode}__ltr.png`;
  const bytes = await target.screenshot({animations: 'disabled'});
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  const image = inspectPng(file, bytes);
  const textRatio = contrastRatio(actual.color, actual.surfaceBackground);
  const contrastPairs: ContrastPair[] = [
    {
      part: 'text',
      meaningful: true,
      foreground: actual.color,
      backdrop: actual.surfaceBackground,
      ratio: textRatio,
      threshold: 4.5,
      exception: null,
      passed: textRatio != null && textRatio >= 4.5,
    },
  ];
  if (actual.iconColor != null) {
    contrastPairs.push({
      part: 'icon',
      meaningful: false,
      foreground: actual.iconColor,
      backdrop: actual.surfaceBackground,
      ratio: contrastRatio(actual.iconColor, actual.surfaceBackground),
      threshold: null,
      exception:
        'The caller-provided icon appears with visible text and is not the only source of meaning.',
      passed: true,
    });
  }
  if (actual.lineColor != null) {
    contrastPairs.push({
      part: 'divider-line',
      meaningful: false,
      foreground: actual.lineColor,
      backdrop: actual.surfaceBackground,
      ratio: contrastRatio(actual.lineColor, actual.surfaceBackground),
      threshold: null,
      exception:
        'The visible label and labelled separator expose the section boundary without relying on the painted rule.',
      passed: true,
    });
  }

  const expected = {
    build: head,
    storyId: auditCase.storyId,
    theme: 'neutral',
    mode,
    direction: 'ltr' as Direction,
    viewport,
    reducedMotion: true,
    forcedColors: false,
    coarsePointer: options.coarsePointer ?? false,
    touchPoints: options.touchPoints ?? false,
    // No live role of its own: the chat log delivers it (spec:AST-086 FR4).
    role: null,
    variant: auditCase.variant,
    text: auditCase.text,
    separatorCount: auditCase.variant === 'divider' ? 1 : 0,
    separatorOrientation: auditCase.variant === 'divider' ? 'horizontal' : null,
    separatorLabelledTargetText:
      auditCase.variant === 'divider' ? auditCase.text : null,
    iconCount: auditCase.expectedIconCount,
    interactiveCount: 0,
    expectWrap: auditCase.expectWrap ?? false,
    textLineExpectation: auditCase.expectWrap ? 'multiple' : 'single',
    liveLog: auditCase.nestedInLiveLog
      ? {role: 'log', ariaLive: 'polite'}
      : null,
  };
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      failures.push(message);
    }
  };

  const textLineCountMatches = expected.expectWrap
    ? actual.textLineCount >= 2
    : actual.textLineCount === 1;

  check(actual.storyId === expected.storyId, 'Storybook story id drifted');
  check(actual.selectorCount === 1, 'expected exactly one audit subject');
  check(actual.visible, 'audit subject has no visible geometry');
  check(actual.text === expected.text, 'visible content drifted');
  check(actual.role === expected.role, 'root role drifted');
  check(actual.variant === expected.variant, 'variant reflection drifted');
  check(
    actual.separatorCount === expected.separatorCount,
    'separator count drifted',
  );
  check(
    actual.separatorOrientation === expected.separatorOrientation,
    'separator orientation drifted',
  );
  check(
    actual.separatorLabelledTargetText === expected.separatorLabelledTargetText,
    'separator labelled target text drifted',
  );
  if (expected.iconCount != null) {
    check(actual.iconCount === expected.iconCount, 'icon presence drifted');
  }
  check(
    actual.interactiveCount === expected.interactiveCount,
    'component unexpectedly owns an interactive target',
  );
  check(actual.direction === expected.direction, 'computed direction drifted');
  check(actual.overflowFree, 'component or page has horizontal overflow');
  check(
    textLineCountMatches,
    `text line count ${actual.textLineCount} does not match the ${expected.textLineExpectation} expectation`,
  );
  if (expected.expectWrap) {
    check(
      actual.contentStartsWithinRoot,
      'long content crosses the root start edge',
    );
    check(
      actual.contentEndsWithinRoot,
      'long content crosses the root end edge',
    );
  }
  check(
    JSON.stringify(actual.liveLog) === JSON.stringify(expected.liveLog),
    'live-log composition drifted',
  );
  check(actual.theme === expected.theme, 'neutral theme did not settle');
  check(actual.mode === expected.mode, 'color mode did not settle');
  check(actual.colorScheme.includes(mode), 'computed color-scheme drifted');
  check(
    actual.surfaceLuminanceClass === mode,
    'surface luminance does not match color mode',
  );
  check(
    actual.viewport.width === viewport.width &&
      actual.viewport.height === viewport.height,
    'viewport drifted',
  );
  check(actual.devicePixelRatio === 1, 'device pixel ratio drifted');
  check(actual.reducedMotion, 'motion was not held still');
  check(!actual.forcedColors, 'forced-colors unexpectedly active');
  check(
    actual.coarsePointer === expected.coarsePointer,
    'pointer modality drifted',
  );
  if (expected.touchPoints) {
    check(actual.touchPoints > 0, 'coarse-pointer context has no touch points');
  }
  check(actual.fontsReady, 'fonts did not settle');
  check(!actual.storyError, 'Storybook rendered an error surface');
  check(errors.length === 0, 'page emitted an error');
  check(image.nonBlank, 'subject crop is blank');
  for (const pair of contrastPairs) {
    check(pair.passed, `${pair.part} contrast pair failed`);
  }

  const sensorRows = {
    Build: {
      expected: {headSha: head},
      observed: {checkoutSha: head, storybookSha: build},
      passed: build === head,
    },
    Story: {
      expected: {id: expected.storyId, case: auditCase.key},
      observed: {id: actual.storyId, selectorCount: actual.selectorCount},
      passed: actual.storyId === expected.storyId && actual.selectorCount === 1,
    },
    Theme: {
      expected: expected.theme,
      observed: actual.theme,
      passed: actual.theme === expected.theme,
    },
    'Color mode': {
      expected: {
        mode,
        colorScheme: mode,
        surfaceLuminanceClass: mode,
      },
      observed: {
        mode: actual.mode,
        colorScheme: actual.colorScheme,
        surfaceBackground: actual.surfaceBackground,
        surfaceLuminanceClass: actual.surfaceLuminanceClass,
      },
      passed:
        actual.mode === mode &&
        actual.colorScheme.includes(mode) &&
        actual.surfaceLuminanceClass === mode,
    },
    Direction: {
      expected: expected.direction,
      observed: actual.direction,
      passed: actual.direction === expected.direction,
    },
    'Viewport/media': {
      expected: {
        viewport,
        devicePixelRatio: 1,
        reducedMotion: true,
        forcedColors: false,
        coarsePointer: expected.coarsePointer,
      },
      observed: {
        viewport: actual.viewport,
        devicePixelRatio: actual.devicePixelRatio,
        reducedMotion: actual.reducedMotion,
        forcedColors: actual.forcedColors,
        coarsePointer: actual.coarsePointer,
        hoverCapable: actual.hoverCapable,
        touchPoints: actual.touchPoints,
      },
      passed:
        actual.viewport.width === viewport.width &&
        actual.viewport.height === viewport.height &&
        actual.devicePixelRatio === 1 &&
        actual.reducedMotion &&
        !actual.forcedColors &&
        actual.coarsePointer === expected.coarsePointer &&
        (!expected.touchPoints || actual.touchPoints > 0),
    },
    'Rendered state': {
      expected: {
        role: expected.role,
        variant: expected.variant,
        text: expected.text,
        separatorCount: expected.separatorCount,
        separatorOrientation: expected.separatorOrientation,
        separatorLabelledTargetText: expected.separatorLabelledTargetText,
        iconCount: expected.iconCount,
        interactiveCount: 0,
        liveLog: expected.liveLog,
      },
      observed: {
        role: actual.role,
        variant: actual.variant,
        text: actual.text,
        separatorCount: actual.separatorCount,
        separatorOrientation: actual.separatorOrientation,
        separatorLabelledTargetText: actual.separatorLabelledTargetText,
        iconCount: actual.iconCount,
        interactiveCount: actual.interactiveCount,
        liveLog: actual.liveLog,
        dividerIconContract:
          auditCase.key === 'divider-icon' ? 'unresolved' : null,
        contrastPairs,
      },
      passed:
        actual.role === expected.role &&
        actual.variant === expected.variant &&
        actual.text === expected.text &&
        actual.separatorCount === expected.separatorCount &&
        actual.separatorOrientation === expected.separatorOrientation &&
        actual.separatorLabelledTargetText ===
          expected.separatorLabelledTargetText &&
        (expected.iconCount == null ||
          actual.iconCount === expected.iconCount) &&
        actual.interactiveCount === 0 &&
        JSON.stringify(actual.liveLog) === JSON.stringify(expected.liveLog) &&
        contrastPairs.every(pair => pair.passed),
    },
    'Subject geometry': {
      expected: {
        visible: true,
        overflowFree: true,
        nonZero: true,
        wraps: expected.expectWrap,
        textLineExpectation: expected.textLineExpectation,
        insideInlineEdges: expected.expectWrap,
      },
      observed: {
        ...actual.geometry,
        contentGeometry: actual.contentGeometry,
        contentStartsWithinRoot: actual.contentStartsWithinRoot,
        contentEndsWithinRoot: actual.contentEndsWithinRoot,
        textLineCount: actual.textLineCount,
        overflowFree: actual.overflowFree,
      },
      passed:
        actual.visible &&
        actual.geometry.width > 0 &&
        actual.geometry.height > 0 &&
        actual.overflowFree &&
        textLineCountMatches &&
        (!expected.expectWrap ||
          (actual.contentStartsWithinRoot && actual.contentEndsWithinRoot)),
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
  const receipt = {
    frame: `${auditCase.key}__neutral-${mode}__ltr`,
    passed: failures.length === 0,
    failures,
    expected,
    observed: actual,
    contrastPairs,
    sensors: sensorRows,
    image,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${file}.sensors.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  receipts.push(receipt);
  return failures.map(detail => `${auditCase.key}/${mode}: ${detail}`);
}

async function writeContactSheet(page: Page): Promise<ImageReceipt> {
  const figures = receipts
    .map(receipt => {
      const image = receipt.image as ImageReceipt;
      const bytes = fs.readFileSync(path.join(OUTPUT, image.file));
      return `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt=""><figcaption>${String(receipt.frame)}</figcaption></figure>`;
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
      img { display: block; width: 100%; height: 96px; object-fit: contain; }
      figcaption { margin-top: 8px; overflow-wrap: anywhere; }
    </style>
    <h1>ChatSystemMessage exact-head state evidence</h1>
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
            () => reject(new Error('contact-sheet image failed')),
            {once: true},
          );
        });
      }),
    );
  });
  const file = 'ChatSystemMessage__contact-sheet.png';
  const bytes = await page.screenshot({fullPage: true, animations: 'disabled'});
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  return inspectPng(file, bytes);
}

async function mobilePage(
  browser: Browser,
): Promise<{page: Page; close: () => Promise<void>}> {
  const context = await browser.newContext({
    viewport: {width: 320, height: 640},
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  return {
    page: await context.newPage(),
    close: async () => {
      await context.close();
    },
  };
}

test.describe.configure({mode: 'serial', retries: 0});

test.beforeAll(async () => {
  head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const dirtyTracked = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    {encoding: 'utf8'},
  ).trim();
  const dirtyEvidenceFiles = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'apps/storybook/stories/ChatSystemMessage.stories.tsx',
      'apps/storybook/stories/ChatSystemMessageAudit.stories.tsx',
      'packages/core/src/Chat/__tests__/ChatSystemMessage.a11y.chromium.spec.ts',
    ],
    {encoding: 'utf8'},
  ).trim();
  const dirty = [dirtyTracked, dirtyEvidenceFiles].filter(Boolean).join('\n');
  if (dirty !== '') {
    throw new Error(
      `browser evidence requires a clean committed source set: ${dirty}`,
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
  build = (await stamp.text()).trim();
  if (build !== head) {
    throw new Error('Storybook bytes differ from the PR head');
  }
});

test.afterAll(async () => {
  const expectedFrames = CASES.flatMap(auditCase =>
    (['light', 'dark'] as const).map(
      mode => `${auditCase.key}__neutral-${mode}__ltr`,
    ),
  );
  const observedFrames = new Set(
    receipts.map(receipt => String(receipt.frame)),
  );
  const d7ContrastPairs = receipts.flatMap(receipt =>
    (receipt.contrastPairs as ContrastPair[]).map(pair => ({
      frame: receipt.frame,
      ...pair,
    })),
  );
  const matrixFailures = [
    ...expectedFrames
      .filter(frame => !observedFrames.has(frame))
      .map(frame => `missing frame: ${frame}`),
    ...receipts
      .filter(receipt => receipt.passed !== true)
      .map(receipt => `failed frame: ${String(receipt.frame)}`),
    ...d7ContrastPairs
      .filter(pair => !pair.passed)
      .map(pair => `failed D7 pair: ${String(pair.frame)}/${pair.part}`),
  ];
  const contactSheetFile = 'ChatSystemMessage__contact-sheet.png';
  const contactSheetPath = path.join(OUTPUT, contactSheetFile);
  const contactSheet = fs.existsSync(contactSheetPath)
    ? inspectPng(contactSheetFile, fs.readFileSync(contactSheetPath))
    : null;
  if (contactSheet?.nonBlank !== true) {
    matrixFailures.push('missing or blank contact sheet');
  }
  if (head && build) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/ChatSystemMessage',
          headSha: head,
          storybookSha: build,
          browser: browserVersion,
          failClosed: true,
          matrixComplete: matrixFailures.length === 0,
          matrixFailures,
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
            requiredPair: true,
            reason:
              'The production wrapping repair changes long-content pixels. The PR report links the failing-before and fixed-after exact-head artifacts and receipts.',
            subjectiveAcceptanceClaimed: false,
            contactSheet,
          },
          unresolved: {
            dividerIcon:
              'The public icon input is supplied to the divider fixture and its observed output is recorded without asserting either candidate contract.',
          },
          notApplicable: {
            hover: 'ChatSystemMessage has no component-owned interaction.',
            focus:
              'ChatSystemMessage introduces no focusable element or focus-visible state.',
            pressed: 'ChatSystemMessage has no activation behavior.',
            disabled: 'ChatSystemMessage exposes no disabled state.',
            loading: 'ChatSystemMessage exposes no loading state.',
            selected: 'ChatSystemMessage exposes no selection state.',
            keyboard: 'ChatSystemMessage owns no keyboard interaction.',
            pointerTarget: 'ChatSystemMessage owns no pointer target.',
          },
          emptyContentPartitions: {
            emptyString:
              'Focused unit evidence: the default variant has no root role and renders the content unchanged (empty). In the divider variant, the root and separator remain; no visible label or accessible name is produced.',
            numericZero:
              'Focused unit evidence: the default variant has no root role and renders the content unchanged as one 0. In the divider variant, the root and separator remain; Divider paints two zero text nodes (textContent="00") with no accessible name.',
            emptyFragment:
              'Focused unit evidence: the default variant has no root role and renders the content unchanged (empty). In the divider variant, the root and separator remain; no visible label or accessible name is produced.',
          },
          sharedAdvisories: {
            dividerFalseyLabel:
              'Under spec:AST-002/FR15, empty string and empty Fragment content leave the separator without a visible label or accessible name, while numeric zero paints stray textContent="00" with no accessible name. This shared advisory is routed to component:Divider.',
            dividerLongLabelOverflow:
              'Source inspection shows that a long divider label can cross the inline edge because Divider owns a non-shrinking label. This is routed to component:Divider without assigning the defect to ChatSystemMessage.',
            dividerForcedColors:
              'The Divider rule may disappear in forced colors; this audit does not exercise that mode and routes the advisory to component:Divider.',
          },
          unverified: {
            forcedColors:
              'Forced-colors rendering was not exercised. The default row makes no support claim, and the disappearing Divider rule is a shared component:Divider advisory.',
            assistiveTechnology:
              'Browser role exposure is measured; spoken output was not recorded with real assistive technology, which spec:AST-009 does not require for routing claims.',
          },
          stateVisualConformance: {
            default: ['text', 'text-with-icon', 'wrapped-long-content'],
            divider: [
              'labelled-separator',
              'unresolved-divider-icon-observation',
            ],
            nestedLiveLog: ['no-live-role-inside-polite-log'],
            colorModes: ['light', 'dark'],
            narrowCoarsePointer: [
              'default-with-icon',
              'divider',
              'wrapped-long-content',
            ],
          },
          frames: receipts,
          d7ContrastPairs,
        },
        null,
        2,
      )}\n`,
    );
  }
  await server?.close();
  expect(matrixFailures, 'complete exact-head evidence matrix').toEqual([]);
});

test('captures the complete neutral light and dark state matrix', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const failures: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    for (const auditCase of CASES.filter(item => !item.narrow)) {
      const {errors} = await openCase(page, auditCase, mode);
      failures.push(...(await capture(page, auditCase, mode, errors)));
    }
  }
  expect(failures).toEqual([]);
});

test('captures 320px coarse-pointer reflow and the contact sheet', async ({
  browser,
}) => {
  const mobile = await mobilePage(browser);
  try {
    const failures: string[] = [];
    for (const mode of ['light', 'dark'] as const) {
      for (const auditCase of CASES.filter(item => item.narrow)) {
        const {errors} = await openCase(mobile.page, auditCase, mode);
        failures.push(
          ...(await capture(mobile.page, auditCase, mode, errors, {
            viewport: {width: 320, height: 640},
            coarsePointer: true,
            touchPoints: true,
          })),
        );
      }
    }
    const contactSheet = await writeContactSheet(mobile.page);
    expect(contactSheet.nonBlank).toBe(true);
    expect(failures).toEqual([]);
  } finally {
    await mobile.close();
  }
});
