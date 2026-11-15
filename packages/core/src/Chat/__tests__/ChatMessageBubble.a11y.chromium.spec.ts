// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageBubble.a11y.chromium.spec.ts
 * @input Uses the dedicated ChatMessageBubble Storybook fixtures
 * @output Real-Chromium light, dark, RTL, density, grouping, empty, and
 *   narrow-overflow evidence with sensor receipts
 * @position Browser evidence for the ChatMessageBubble component contract
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  type ChatMessageBubbleAuditProvenance,
  resolveChatMessageBubbleAuditProvenance,
} from './ChatMessageBubble.auditProvenance';

const OUTPUT = path.resolve('test-results/chat-message-bubble-audit-evidence');
const STATES_STORY = 'core-chatmessagebubble--states';
const NARROW_STORY = 'core-chatmessagebubble--narrow-long-content';
const STATES = [
  'sender-alignment',
  'filled-and-ghost',
  'assistant-group',
  'user-group',
  'density',
  'numeric-slots',
  'empty-content',
] as const;

interface Receipt {
  state: string;
  storyId: string;
  build: string;
  browser: string;
  theme: string;
  colorMode: string;
  direction: string;
  viewport: {width: number; height: number};
  devicePixelRatio: number;
  media: {reducedMotion: boolean; coarsePointer: boolean};
  rendered: Record<string, unknown>;
  geometry: {selectorCount: number; width: number; height: number};
  settled: {fontsReady: boolean; pageErrors: number};
  image: {file: string; sha256: string; width: number; height: number};
}

const receipts: Receipt[] = [];
let storybook: StaticServer;
let browserVersion = 'unknown';
let auditProvenance: ChatMessageBubbleAuditProvenance | null = null;

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

test.beforeAll(async () => {
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  fs.mkdirSync(OUTPUT, {recursive: true});
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  auditProvenance = await resolveChatMessageBubbleAuditProvenance({
    checkoutSha,
    expectedHeadSha: process.env.ASTRYX_HEAD_SHA,
    storybookOrigin: storybook.origin,
  });
});

test.afterAll(async () => {
  if (auditProvenance == null) {
    await storybook?.close();
    return;
  }
  const manifestPath = path.join(OUTPUT, 'manifest.json');
  const previous = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).frames ?? [])
    : [];
  const frames = [...previous, ...receipts].filter(
    (frame, index, all) =>
      all.findIndex(
        other =>
          other.state === frame.state &&
          other.storyId === frame.storyId &&
          other.colorMode === frame.colorMode &&
          other.direction === frame.direction,
      ) === index,
  );
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        version: 2,
        component: 'core/ChatMessageBubble',
        headSha: auditProvenance.headSha,
        checkoutSha: auditProvenance.checkoutSha,
        storybookSha: auditProvenance.storybookSha,
        provenanceMode: auditProvenance.mode,
        browser: browserVersion,
        frames,
      },
      null,
      2,
    )}\n`,
  );
  await storybook?.close();
});

async function openStory(
  page: Page,
  storyId: string,
  {
    colorMode = 'light',
    direction = 'ltr',
  }: {colorMode?: 'light' | 'dark'; direction?: 'ltr' | 'rtl'} = {},
): Promise<string[]> {
  const errors = pageErrors(page);
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story` +
      `&globals=colorMode:${colorMode};astryxTheme:neutral;direction:${direction}`,
  );
  await page.locator('#storybook-root > *').waitFor();
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  return errors;
}

function stateLocator(page: Page, state: string): Locator {
  return page.locator(`[data-bubble-audit-state="${state}"]`);
}

function pngImage(file: string, bytes: Buffer) {
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function capture(
  page: Page,
  locator: Locator,
  {
    state,
    storyId,
    colorMode,
    direction,
    errors,
  }: {
    state: string;
    storyId: string;
    colorMode: 'light' | 'dark';
    direction: 'ltr' | 'rtl';
    errors: string[];
  },
): Promise<Receipt> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error(`${state}: the evidence subject has no visible box`);
  }
  const rendered = await locator.evaluate(host => {
    const bubbles = [...host.querySelectorAll('.astryx-chat-message-bubble')];
    const numeric = host.querySelector('[data-testid="numeric-slot-bubble"]');

    const parseColor = (input: string): [number, number, number, number] => {
      if (input === 'transparent') {
        return [0, 0, 0, 0];
      }
      const channels = input.match(/[\d.]+/g)?.map(Number) ?? [];
      return [
        channels[0] ?? 0,
        channels[1] ?? 0,
        channels[2] ?? 0,
        channels[3] ?? 1,
      ];
    };
    const over = (
      foreground: [number, number, number, number],
      backdrop: [number, number, number, number],
    ): [number, number, number, number] => {
      const alpha = foreground[3] + backdrop[3] * (1 - foreground[3]);
      if (alpha === 0) {
        return [0, 0, 0, 0];
      }
      return [
        (foreground[0] * foreground[3] +
          backdrop[0] * backdrop[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] +
          backdrop[1] * backdrop[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] +
          backdrop[2] * backdrop[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    };
    const backdropOf = (element: Element) => {
      const layers: [number, number, number, number][] = [];
      for (
        let current: Element | null = element;
        current != null;
        current = current.parentElement
      ) {
        layers.push(parseColor(getComputedStyle(current).backgroundColor));
      }
      const dark =
        getComputedStyle(document.documentElement).colorScheme === 'dark';
      return layers
        .reverse()
        .reduce(over, dark ? [0, 0, 0, 1] : [255, 255, 255, 1]);
    };
    const luminance = (color: [number, number, number, number]) => {
      const linear = color.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const ratio = (
      foreground: [number, number, number, number],
      backdrop: [number, number, number, number],
    ) => {
      const paintedForeground = over(foreground, backdrop);
      const lighter = Math.max(
        luminance(paintedForeground),
        luminance(backdrop),
      );
      const darker = Math.min(
        luminance(paintedForeground),
        luminance(backdrop),
      );
      return (lighter + 0.05) / (darker + 0.05);
    };

    return {
      bubbleCount: bubbles.length,
      targetValues: bubbles.map(element => {
        const styles = getComputedStyle(element);
        const backdrop = backdropOf(element);
        return {
          sender: element.getAttribute('data-sender'),
          variant: element.getAttribute('data-variant'),
          density: element.getAttribute('data-density'),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          backdrop: `rgb(${backdrop.slice(0, 3).map(Math.round).join(', ')})`,
          contrastRatio:
            element.textContent?.trim() === ''
              ? null
              : Number(ratio(parseColor(styles.color), backdrop).toFixed(2)),
          corners: {
            topLeft: styles.borderTopLeftRadius,
            topRight: styles.borderTopRightRadius,
            bottomRight: styles.borderBottomRightRadius,
            bottomLeft: styles.borderBottomLeftRadius,
          },
        };
      }),
      nameSlots: host.querySelectorAll('[data-chat-name]').length,
      numericNameAligned:
        numeric?.previousElementSibling?.hasAttribute('data-chat-name') ??
        false,
      numericMetadataAligned:
        numeric?.nextElementSibling?.textContent?.trim() === '0',
      overflowFree: host.scrollWidth <= host.clientWidth + 1,
    };
  });
  const window = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
    dpr: globalThis.devicePixelRatio,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
  }));
  const bytes = await locator.screenshot({animations: 'disabled'});
  const file = `chat-message-bubble__${state}__${colorMode}__${direction}.png`;
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  if (auditProvenance == null) {
    throw new Error('ChatMessageBubble audit provenance is unresolved');
  }
  const receipt: Receipt = {
    state,
    storyId,
    build: auditProvenance.build,
    browser: browserVersion,
    theme:
      (await page
        .locator('[data-astryx-theme]')
        .first()
        .getAttribute('data-astryx-theme')) ?? 'neutral',
    colorMode,
    direction: await locator.evaluate(
      element => getComputedStyle(element).direction,
    ),
    viewport: {width: window.width, height: window.height},
    devicePixelRatio: window.dpr,
    media: {
      reducedMotion: window.reducedMotion,
      coarsePointer: window.coarsePointer,
    },
    rendered,
    geometry: {
      selectorCount: await locator.count(),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    settled: {fontsReady: true, pageErrors: errors.length},
    image: pngImage(file, bytes),
  };
  receipts.push(receipt);
  return receipt;
}

type CornerName = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

function expectGroupedCorners(
  receipt: Receipt,
  sender: 'assistant' | 'user',
): void {
  const values = receipt.rendered.targetValues as {
    sender: string;
    corners: Record<CornerName, string>;
  }[];
  expect(values).toHaveLength(3);
  expect(values.every(value => value.sender === sender)).toBe(true);

  const senderSideIsLeft =
    (sender === 'assistant' && receipt.direction === 'ltr') ||
    (sender === 'user' && receipt.direction === 'rtl');
  const top: CornerName = senderSideIsLeft ? 'topLeft' : 'topRight';
  const bottom: CornerName = senderSideIsLeft ? 'bottomLeft' : 'bottomRight';
  const oppositeTop: CornerName = senderSideIsLeft ? 'topRight' : 'topLeft';
  const oppositeBottom: CornerName = senderSideIsLeft
    ? 'bottomRight'
    : 'bottomLeft';
  const [first, middle, last] = values;

  expect(first.corners[bottom]).toBe(middle.corners[bottom]);
  expect(middle.corners[top]).toBe(last.corners[top]);
  expect(first.corners[bottom]).not.toBe(first.corners[top]);
  expect(last.corners[top]).not.toBe(last.corners[bottom]);
  expect(values.map(value => value.corners[oppositeTop])).toEqual([
    first.corners[oppositeTop],
    first.corners[oppositeTop],
    first.corners[oppositeTop],
  ]);
  expect(values.map(value => value.corners[oppositeBottom])).toEqual([
    first.corners[oppositeBottom],
    first.corners[oppositeBottom],
    first.corners[oppositeBottom],
  ]);
}

test('captures every visible state in neutral light and dark', async ({
  page,
}) => {
  for (const colorMode of ['light', 'dark'] as const) {
    const errors = await openStory(page, STATES_STORY, {colorMode});
    for (const state of STATES) {
      const locator = stateLocator(page, state);
      const receipt = await capture(page, locator, {
        state,
        storyId: STATES_STORY,
        colorMode,
        direction: 'ltr',
        errors,
      });
      expect(receipt.geometry.selectorCount).toBe(1);
      expect(receipt.geometry.width).toBeGreaterThan(0);
      expect(receipt.geometry.height).toBeGreaterThan(0);
      const ratios = (
        receipt.rendered.targetValues as {contrastRatio: number | null}[]
      )
        .map(value => value.contrastRatio)
        .filter((value): value is number => value != null);
      for (const ratio of ratios) {
        expect(
          ratio,
          `${state}/${colorMode}: bubble text contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      if (state === 'assistant-group' || state === 'user-group') {
        expectGroupedCorners(
          receipt,
          state === 'assistant-group' ? 'assistant' : 'user',
        );
      }
      if (state === 'numeric-slots') {
        expect(receipt.rendered.nameSlots).toBe(1);
        expect(receipt.rendered.numericNameAligned).toBe(true);
        expect(receipt.rendered.numericMetadataAligned).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  }
});

test('captures sender alignment and grouped corners in RTL', async ({page}) => {
  for (const colorMode of ['light', 'dark'] as const) {
    const errors = await openStory(page, STATES_STORY, {
      colorMode,
      direction: 'rtl',
    });
    for (const state of ['sender-alignment', 'assistant-group', 'user-group']) {
      const receipt = await capture(page, stateLocator(page, state), {
        state,
        storyId: STATES_STORY,
        colorMode,
        direction: 'rtl',
        errors,
      });
      expect(receipt.direction).toBe('rtl');
      if (state === 'assistant-group' || state === 'user-group') {
        expectGroupedCorners(
          receipt,
          state === 'assistant-group' ? 'assistant' : 'user',
        );
      }
    }
    expect(errors).toEqual([]);
  }
});

test('keeps long content inside a 320px fixture', async ({page}) => {
  for (const colorMode of ['light', 'dark'] as const) {
    const errors = await openStory(page, NARROW_STORY, {colorMode});
    const subject = page.locator('[data-chat-message-bubble-narrow]');
    const receipt = await capture(page, subject, {
      state: 'narrow-long-content',
      storyId: NARROW_STORY,
      colorMode,
      direction: 'ltr',
      errors,
    });
    expect(receipt.geometry.width).toBeLessThanOrEqual(320);
    expect(receipt.rendered.overflowFree).toBe(true);
    expect(errors).toEqual([]);
  }
});
