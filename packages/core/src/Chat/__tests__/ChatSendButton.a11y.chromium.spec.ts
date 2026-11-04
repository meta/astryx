// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ChatSendButton

/**
 * @file ChatSendButton.a11y.chromium.spec.ts
 * @input Exact-head Storybook build plus checked-in ChatSendButton audit fixtures
 * @output Chromium PNGs, 10-sensor receipts, D7 contrast pairs, coarse hit pairs,
 *   and a fail-closed manifest
 * @position Real-browser evidence for the ChatSendButton component audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/chat-send-button-audit-evidence');
const NARROW_STORY = 'core-chatcomposer--disabled-streaming-narrow';
const SUBJECT = '.astryx-chat-send-button';

// A stale prior run must never fill a missing receipt. Run this file serially
// without retries, and clear its output once before the exact-head matrix starts.
test.describe.configure({mode: 'serial', retries: 0});

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Interaction = 'rest' | 'hover' | 'focus-visible' | 'pressed';
type State = 'send' | 'disabled-send' | 'stop';
type Size = 'sm' | 'md';
type Rgba = {r: number; g: number; b: number; a: number};

interface ContrastPair {
  part: 'icon' | 'focus-indicator' | 'boundary';
  meaningful: boolean;
  foreground: string;
  backdrop: string;
  resolvedBackdrop: string;
  ratio: number | null;
  threshold: number | null;
  exception: string | null;
  passed: boolean;
}

interface Fixture {
  key: string;
  storyId: string;
  name: 'Send' | 'Stop';
  state: State;
  size: Size;
  disabled: boolean;
}

const FIXTURES: Record<string, Fixture> = {
  sendMd: {
    key: 'send-md',
    storyId: 'a11y-button-pattern--chat-send',
    name: 'Send',
    state: 'send',
    size: 'md',
    disabled: false,
  },
  disabledMd: {
    key: 'send-disabled-md',
    storyId: 'a11y-button-pattern--chat-send-disabled',
    name: 'Send',
    state: 'disabled-send',
    size: 'md',
    disabled: true,
  },
  stopMd: {
    key: 'stop-md',
    storyId: 'a11y-button-pattern--chat-send-stop',
    name: 'Stop',
    state: 'stop',
    size: 'md',
    disabled: false,
  },
  sendSm: {
    key: 'send-sm',
    storyId: 'a11y-chatsendbutton-audit--chat-send-small',
    name: 'Send',
    state: 'send',
    size: 'sm',
    disabled: false,
  },
  stopSm: {
    key: 'stop-sm',
    storyId: 'a11y-chatsendbutton-audit--chat-send-stop-small',
    name: 'Stop',
    state: 'stop',
    size: 'sm',
    disabled: false,
  },
};

interface Shot {
  file: string;
  sha256: string;
  width: number;
  height: number;
  distinctColors: number;
  nonBlank: boolean;
}

interface Receipt {
  frame: string;
  passed: boolean;
  failures: string[];
  build: {expected: string; checkout: string; storybook: string};
  story: {id: string; expectedName: string};
  theme: {requested: 'neutral'; observed: string | null};
  mode: {
    requested: Mode;
    observed: string | null;
    colorScheme: string;
    surfaceBackground: string;
    surfaceLuminanceClass: 'light' | 'dark' | 'unknown';
  };
  direction: {requested: Direction; observed: string};
  viewport: {width: number; height: number};
  devicePixelRatio: number;
  media: {
    reducedMotion: boolean;
    forcedColors: boolean;
    coarsePointer: boolean;
    hoverCapable: boolean;
    touchPoints: number;
  };
  semantics: {
    role: string | null;
    accessibleName: string | null;
    disabled: boolean;
    size: string | null;
    variant: string | null;
  };
  geometry: {
    selectorCount: number;
    visibleCount: number;
    width: number;
    height: number;
    circular: boolean;
  };
  interaction: {
    requested: Interaction;
    matchesHover: boolean;
    matchesFocusVisible: boolean;
    matchesActive: boolean;
    cursor: string;
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    opacity: string;
    transform: string;
    outlineColor: string;
    outlineOffset: string;
    outlineStyle: string;
    outlineWidth: string;
    representation: string;
    tokenSignaturePresent: boolean;
    restSha256?: string;
    changedPixels?: boolean;
  };
  contrastPairs: ContrastPair[];
  sensors: Record<
    | 'Build'
    | 'Story'
    | 'Theme'
    | 'Color mode'
    | 'Direction'
    | 'Viewport/media'
    | 'Rendered state'
    | 'Subject geometry'
    | 'Settled render'
    | 'Image',
    {expected: unknown; observed: unknown; passed: boolean}
  >;
  settled: {fontsReady: boolean; pageErrors: string[]; storyError: boolean};
  image: Shot;
}

interface CoarseHitPair {
  fixture: string;
  size: Size;
  state: 'send' | 'stop';
  direction: Direction;
  coarsePointer: boolean;
  touchPoints: number;
  selectorCount: number;
  visibleCount: number;
  target: {x: number; y: number; width: number; height: number};
  hit: boolean;
  centered: boolean;
  passed: boolean;
}

let server: StaticServer;
let head = '';
let build = '';
let browserVersion = 'unknown';
const receipts: Receipt[] = [];
const coarseHitPairs: CoarseHitPair[] = [];

function pngShot(file: string, bytes: Buffer): Shot {
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

function parseRgb(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  const channels = match?.[1].match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) {
    return null;
  }
  return {r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1};
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

function ratio(
  foreground: Rgba | null,
  background: Rgba | null,
): number | null {
  if (foreground == null || background == null) {
    return null;
  }
  const first = luminance(foreground);
  const second = luminance(background);
  return Number(
    (
      (Math.max(first, second) + 0.05) /
      (Math.min(first, second) + 0.05)
    ).toFixed(2),
  );
}

function colorString(color: Rgba): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function sameColor(first: Rgba | null, second: Rgba | null): boolean {
  return (
    first != null &&
    second != null &&
    Math.abs(first.r - second.r) < 0.01 &&
    Math.abs(first.g - second.g) < 0.01 &&
    Math.abs(first.b - second.b) < 0.01 &&
    Math.abs(first.a - second.a) < 0.001
  );
}

function isIdentityTransform(transform: string): boolean {
  if (transform === 'none') {
    return true;
  }
  const values = transform
    .slice(transform.indexOf('(') + 1, transform.lastIndexOf(')'))
    .match(/-?[\d.]+/g)
    ?.map(Number);
  const close = (actual: number, expected: number) =>
    Math.abs(actual - expected) < 0.001;
  if (transform.startsWith('matrix3d(') && values?.length === 16) {
    const expected = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return values.every((value, index) => close(value, expected[index]));
  }
  if (transform.startsWith('matrix(') && values?.length === 6) {
    const expected = [1, 0, 0, 1, 0, 0];
    return values.every((value, index) => close(value, expected[index]));
  }
  return false;
}

function isScale098(transform: string): boolean {
  const values = transform
    .slice(transform.indexOf('(') + 1, transform.lastIndexOf(')'))
    .match(/-?[\d.]+/g)
    ?.map(Number);
  const close = (actual: number, expected: number) =>
    Math.abs(actual - expected) < 0.001;
  if (transform.startsWith('matrix3d(') && values?.length === 16) {
    const expected = [0.98, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return values.every((value, index) => close(value, expected[index]));
  }
  if (transform.startsWith('matrix(') && values?.length === 6) {
    const expected = [0.98, 0, 0, 0.98, 0, 0];
    return values.every((value, index) => close(value, expected[index]));
  }
  return false;
}

function resolveBackdrop(
  backgroundColor: string,
  backgroundImage: string,
  surfaceBackground: string,
): {
  color: Rgba | null;
  css: string;
  overlay: Rgba | null;
} {
  const base = parseRgb(backgroundColor);
  const surface = parseRgb(surfaceBackground);
  const resolvedBase =
    base != null && base.a < 1 && surface != null
      ? composite(base, surface)
      : base;
  const gradientColor = backgroundImage.match(/rgba?\([^)]+\)/)?.[0];
  const overlay = gradientColor ? parseRgb(gradientColor) : null;
  const color =
    resolvedBase != null && overlay != null
      ? composite(overlay, resolvedBase)
      : resolvedBase;
  return {
    color,
    css: color == null ? backgroundColor : colorString(color),
    overlay,
  };
}

function contrastPairs(
  actual: Awaited<ReturnType<typeof readSensors>>,
  fixture: Fixture,
  interaction: Interaction,
): ContrastPair[] {
  const backdrop = resolveBackdrop(
    actual.backgroundColor,
    actual.backgroundImage,
    actual.surfaceBackground,
  );
  const surface = parseRgb(actual.surfaceBackground);
  const iconRatio = ratio(parseRgb(actual.color), backdrop.color);
  const inactive = fixture.disabled;
  const pairs: ContrastPair[] = [
    {
      part: 'icon',
      meaningful: !inactive,
      foreground: actual.color,
      backdrop: `${actual.backgroundColor}; overlay ${actual.backgroundImage}`,
      resolvedBackdrop: backdrop.css,
      ratio: iconRatio,
      threshold: inactive ? null : 3,
      exception: inactive ? 'WCAG inactive-control exception' : null,
      passed: inactive || (iconRatio != null && iconRatio >= 3),
    },
    {
      part: 'boundary',
      meaningful: false,
      foreground: backdrop.css,
      backdrop: actual.surfaceBackground,
      resolvedBackdrop: actual.surfaceBackground,
      ratio: ratio(backdrop.color, surface),
      threshold: null,
      exception:
        'Decorative boundary: the meaningful icon and accessible name identify the control.',
      passed: true,
    },
  ];
  if (interaction === 'focus-visible') {
    const focusRatio = ratio(parseRgb(actual.outlineColor), surface);
    pairs.push({
      part: 'focus-indicator',
      meaningful: true,
      foreground: actual.outlineColor,
      backdrop: actual.surfaceBackground,
      resolvedBackdrop: actual.surfaceBackground,
      ratio: focusRatio,
      threshold: 3,
      exception: null,
      passed: focusRatio != null && focusRatio >= 3,
    });
  }
  return pairs;
}

function storyUrl(
  storyId: string,
  mode: Mode,
  direction: Direction = 'ltr',
): string {
  return (
    `${server.origin}/iframe.html?id=${storyId}&viewMode=story` +
    `&globals=colorMode:${mode};astryxTheme:neutral;direction:${direction}`
  );
}

async function openFixture(
  page: Page,
  fixture: Fixture,
  mode: Mode,
  direction: Direction = 'ltr',
): Promise<{target: Locator; errors: string[]}> {
  const errors: string[] = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', error => errors.push(String(error)));
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  await page.goto(storyUrl(fixture.storyId, mode, direction));
  await page.locator(SUBJECT).first().waitFor();
  await page.waitForFunction(
    expected =>
      document.documentElement.getAttribute('data-theme') === expected,
    mode,
  );
  await holdMotionStill(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.mouse.move(0, 0);
  return {target: page.locator(SUBJECT), errors};
}

async function settleStoryPlayAndBlur(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="disabled-streaming-fixture"]')
        ?.getAttribute('data-stop-requests') === '1',
  );
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page
    .locator(SUBJECT)
    .first()
    .evaluate(element => {
      if (element.matches(':focus-visible')) {
        throw new Error(
          'ChatSendButton retained focus-visible after story play',
        );
      }
    });
}

async function readSensors(page: Page, interaction: Interaction) {
  return page.locator(SUBJECT).evaluateAll((elements, expected) => {
    const visible = elements.filter(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    });
    const element = visible[0] as HTMLButtonElement | undefined;
    const style = element ? getComputedStyle(element) : null;
    const box = element?.getBoundingClientRect();
    const radius = style ? Number.parseFloat(style.borderTopLeftRadius) : 0;
    const parseRgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return channels.length >= 3
        ? {r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1}
        : null;
    };
    const relativeLuminance = (color: {r: number; g: number; b: number}) => {
      const linear = [color.r, color.g, color.b].map(channel => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const resolveColorToken = (name: string) => {
      if (element == null) {
        return '';
      }
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${name})`;
      probe.style.display = 'none';
      element.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    };
    const ancestors: Element[] = [];
    for (
      let current = element?.parentElement;
      current != null;
      current = current.parentElement
    ) {
      ancestors.push(current);
    }
    const surfaceBackground = [
      ...ancestors,
      document.querySelector('[data-astryx-theme]'),
      document.querySelector('#storybook-root'),
      document.body,
      document.documentElement,
    ]
      .map(candidate =>
        candidate == null ? null : getComputedStyle(candidate).backgroundColor,
      )
      .find(value => {
        const color = value == null ? null : parseRgb(value);
        return color != null && color.a > 0.99;
      });
    const surfaceColor = surfaceBackground ? parseRgb(surfaceBackground) : null;
    const surfaceLuminanceClass: 'light' | 'dark' | 'unknown' =
      surfaceColor == null
        ? 'unknown'
        : relativeLuminance(surfaceColor) > 0.5
          ? 'light'
          : 'dark';
    return {
      selectorCount: elements.length,
      visibleCount: visible.length,
      role:
        element?.getAttribute('role') ?? element?.tagName.toLowerCase() ?? null,
      accessibleName: element?.getAttribute('aria-label') ?? null,
      disabled: element?.disabled ?? false,
      size: element?.getAttribute('data-size') ?? null,
      variant: element?.getAttribute('data-variant') ?? null,
      direction: style?.direction ?? '',
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      circular:
        box != null &&
        Math.abs(box.width - box.height) < 0.5 &&
        radius >= Math.min(box.width, box.height) / 2 - 0.5,
      matchesHover: element?.matches(':hover') ?? false,
      matchesFocusVisible: element?.matches(':focus-visible') ?? false,
      matchesActive: element?.matches(':active') ?? false,
      cursor: style?.cursor ?? '',
      color: style?.color ?? '',
      backgroundColor: style?.backgroundColor ?? '',
      backgroundImage: style?.backgroundImage ?? '',
      hoverOverlayToken: resolveColorToken('--color-overlay-hover'),
      pressedOverlayToken: resolveColorToken('--color-overlay-pressed'),
      opacity: style?.opacity ?? '',
      transform: style?.transform ?? '',
      outlineColor: style?.outlineColor ?? '',
      outlineOffset: style?.outlineOffset ?? '',
      outlineStyle: style?.outlineStyle ?? '',
      outlineWidth: style?.outlineWidth ?? '',
      mode: document.documentElement.getAttribute('data-theme'),
      theme:
        document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme') ?? null,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      surfaceBackground: surfaceBackground ?? 'transparent',
      surfaceLuminanceClass,
      fontsReady: document.fonts.status === 'loaded',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      hoverCapable: matchMedia('(hover: hover)').matches,
      touchPoints: navigator.maxTouchPoints,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(node => {
        const nodeStyle = getComputedStyle(node);
        const nodeBox = node.getBoundingClientRect();
        return (
          nodeBox.width > 0 &&
          nodeBox.height > 0 &&
          nodeStyle.display !== 'none' &&
          nodeStyle.visibility !== 'hidden' &&
          nodeStyle.opacity !== '0'
        );
      }),
      expectedInteraction: expected,
      storyId: new URL(location.href).searchParams.get('id'),
    };
  }, interaction);
}

async function screenshotTarget(page: Page, frame: string): Promise<Shot> {
  const target = page.locator(SUBJECT).first();
  await page.locator('[data-a11y-activations] > p').evaluateAll(nodes => {
    for (const node of nodes) {
      (node as HTMLElement).style.visibility = 'hidden';
    }
  });
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error(`${frame}: ChatSendButton has no layout box`);
  }
  const padding = 8;
  const viewport = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
    width: Math.min(
      (viewport?.width ?? box.x + box.width) - Math.max(0, box.x - padding),
      box.width + padding * 2,
    ),
    height: Math.min(
      (viewport?.height ?? box.y + box.height) - Math.max(0, box.y - padding),
      box.height + padding * 2,
    ),
  };
  const bytes = await page.screenshot({animations: 'disabled', clip});
  const file = `chat-send-button__${frame}.png`;
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  return pngShot(file, bytes);
}

async function writeContactSheet(page: Page): Promise<void> {
  const cards = receipts
    .map(receipt => {
      const bytes = fs.readFileSync(path.join(OUTPUT, receipt.image.file));
      const source = `data:image/png;base64,${bytes.toString('base64')}`;
      return `<figure><img src="${source}" alt=""><figcaption>${receipt.frame}</figcaption></figure>`;
    })
    .join('');
  await page.setViewportSize({width: 1200, height: 900});
  await page.setContent(`<!doctype html>
    <style>
      html { color-scheme: light; background: #f3f4f6; }
      body { margin: 20px; font: 12px/1.35 system-ui, sans-serif; color: #111827; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      main { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
      figure { margin: 0; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; background: white; }
      img { display: block; width: 100%; height: 96px; object-fit: contain; }
      figcaption { margin-top: 8px; overflow-wrap: anywhere; }
    </style>
    <h1>ChatSendButton exact-head state evidence</h1>
    <main>${cards}</main>`);
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
            {once: true},
          );
        });
      }),
    );
  });
  await page.screenshot({
    path: path.join(OUTPUT, 'chat-send-button__contact-sheet.png'),
    fullPage: true,
    animations: 'disabled',
  });
}

async function capture(
  page: Page,
  fixture: Fixture,
  mode: Mode,
  interaction: Interaction,
  errors: string[],
  options: {
    direction?: Direction;
    restSha256?: string;
    expectChangedPixels?: boolean;
    expectCoarse?: boolean;
    expectedViewport?: {width: number; height: number};
    frameSuffix?: string;
  } = {},
): Promise<Receipt> {
  const direction = options.direction ?? 'ltr';
  const frame = `${fixture.key}__${interaction}__${mode}${options.frameSuffix ?? ''}`;
  const actual = await readSensors(page, interaction);
  const image = await screenshotTarget(page, frame);
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  const expectedViewport = options.expectedViewport ?? {
    width: 1280,
    height: 720,
  };
  const expectedCoarse = options.expectCoarse ?? false;
  const changedPixels =
    options.restSha256 == null
      ? undefined
      : image.sha256 !== options.restSha256;
  const resolvedBackdrop = resolveBackdrop(
    actual.backgroundColor,
    actual.backgroundImage,
    actual.surfaceBackground,
  );
  const overlayIsAlpha =
    resolvedBackdrop.overlay != null &&
    resolvedBackdrop.overlay.a > 0 &&
    resolvedBackdrop.overlay.a < 1;
  const hoverOverlayMatches = sameColor(
    resolvedBackdrop.overlay,
    parseRgb(actual.hoverOverlayToken),
  );
  const pressedOverlayMatches = sameColor(
    resolvedBackdrop.overlay,
    parseRgb(actual.pressedOverlayToken),
  );
  const representation = fixture.disabled
    ? 'Disabled: native disabled, muted and non-interactive'
    : interaction === 'hover'
      ? 'Hovered: overlay style'
      : interaction === 'focus-visible'
        ? 'Focused: outline style'
        : interaction === 'pressed'
          ? 'Pressed: scale(0.98) plus pressed overlay'
          : 'Rest: base tokens with no interaction';
  const interactionStateIsExclusive =
    interaction === 'rest'
      ? !actual.matchesHover &&
        !actual.matchesFocusVisible &&
        !actual.matchesActive &&
        actual.outlineStyle === 'none'
      : interaction === 'hover'
        ? actual.matchesHover &&
          !actual.matchesFocusVisible &&
          !actual.matchesActive &&
          actual.outlineStyle === 'none'
        : interaction === 'focus-visible'
          ? !actual.matchesHover &&
            actual.matchesFocusVisible &&
            !actual.matchesActive &&
            actual.outlineStyle !== 'none'
          : actual.matchesHover &&
            !actual.matchesFocusVisible &&
            actual.matchesActive &&
            actual.outlineStyle === 'none';
  const tokenSignaturePresent = fixture.disabled
    ? actual.disabled &&
      actual.cursor === 'default' &&
      Number.parseFloat(actual.opacity) < 1 &&
      actual.backgroundImage === 'none' &&
      isIdentityTransform(actual.transform) &&
      interactionStateIsExclusive
    : interaction === 'hover'
      ? overlayIsAlpha && hoverOverlayMatches && interactionStateIsExclusive
      : interaction === 'focus-visible'
        ? actual.outlineStyle !== 'none' &&
          Number.parseFloat(actual.outlineWidth) >= 2 &&
          Number.parseFloat(actual.outlineOffset) >= 3 &&
          interactionStateIsExclusive
        : interaction === 'pressed'
          ? overlayIsAlpha &&
            pressedOverlayMatches &&
            isScale098(actual.transform) &&
            interactionStateIsExclusive
          : interactionStateIsExclusive;
  const renderedContrastPairs = contrastPairs(actual, fixture, interaction);
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      failures.push(message);
    }
  };

  check(
    actual.selectorCount === 1,
    'expected exactly one ChatSendButton selector match',
  );
  check(
    actual.visibleCount === 1,
    'expected exactly one visible ChatSendButton',
  );
  check(actual.storyId === fixture.storyId, 'Storybook story id drifted');
  check(actual.role === 'button', 'native button role drifted');
  check(actual.accessibleName === fixture.name, 'accessible name drifted');
  check(actual.disabled === fixture.disabled, 'disabled state drifted');
  check(actual.size === fixture.size, 'size attribute drifted');
  check(
    actual.variant === (fixture.state === 'stop' ? 'secondary' : 'primary'),
    'state variant drifted',
  );
  check(actual.direction === direction, 'computed direction drifted');
  check(actual.circular, 'target is not circular');
  check(
    actual.width >= 24 && actual.height >= 24,
    'target does not contain a 24px square',
  );
  check(
    image.nonBlank && image.width > 0 && image.height > 0,
    'PNG is blank or has no painted dimensions',
  );
  check(actual.mode === mode, 'color mode did not settle');
  check(actual.theme === 'neutral', 'neutral theme did not settle');
  check(
    actual.surfaceLuminanceClass === mode,
    'rendered surface luminance does not match color mode',
  );
  check(actual.colorScheme.includes(mode), 'computed color-scheme drifted');
  check(actual.fontsReady, 'fonts did not settle');
  check(actual.reducedMotion, 'motion was not held still');
  check(!actual.forcedColors, 'forced-colors unexpectedly active');
  check(
    actual.hoverCapable === !actual.coarsePointer,
    'pointer and hover media disagree',
  );
  check(actual.coarsePointer === expectedCoarse, 'pointer modality drifted');
  check(
    viewport.width === expectedViewport.width &&
      viewport.height === expectedViewport.height,
    'viewport drifted',
  );
  check(viewport.dpr === 1, 'device pixel ratio drifted');
  check(tokenSignaturePresent, `${representation} token signature is absent`);
  for (const pair of renderedContrastPairs) {
    check(pair.passed, `${pair.part} contrast pair failed`);
  }
  check(!actual.storyError, 'Storybook rendered an error surface');
  check(errors.length === 0, 'page emitted an error');
  if (options.expectCoarse) {
    check(actual.touchPoints > 0, 'coarse-pointer context has no touch points');
  }
  check(
    interactionStateIsExclusive,
    `${interaction} state is not interaction-exclusive`,
  );
  if (options.expectChangedPixels != null) {
    check(
      changedPixels === options.expectChangedPixels,
      options.expectChangedPixels
        ? 'interaction pixels are identical to rest'
        : 'disabled hover changed pixels',
    );
  }
  if (fixture.disabled) {
    check(actual.cursor === 'default', 'disabled cursor is not default');
    check(
      actual.backgroundImage === 'none',
      'disabled state paints a hover image',
    );
    check(Number.parseFloat(actual.opacity) < 1, 'disabled state is not muted');
    check(
      isIdentityTransform(actual.transform),
      'disabled state paints a non-identity transform',
    );
  }

  const receipt: Receipt = {
    frame,
    passed: failures.length === 0,
    failures,
    build: {expected: head, checkout: head, storybook: build},
    story: {id: fixture.storyId, expectedName: fixture.name},
    theme: {requested: 'neutral', observed: actual.theme},
    mode: {
      requested: mode,
      observed: actual.mode,
      colorScheme: actual.colorScheme,
      surfaceBackground: actual.surfaceBackground,
      surfaceLuminanceClass: actual.surfaceLuminanceClass,
    },
    direction: {requested: direction, observed: actual.direction},
    viewport: {width: viewport.width, height: viewport.height},
    devicePixelRatio: viewport.dpr,
    media: {
      reducedMotion: actual.reducedMotion,
      forcedColors: actual.forcedColors,
      coarsePointer: actual.coarsePointer,
      hoverCapable: actual.hoverCapable,
      touchPoints: actual.touchPoints,
    },
    semantics: {
      role: actual.role,
      accessibleName: actual.accessibleName,
      disabled: actual.disabled,
      size: actual.size,
      variant: actual.variant,
    },
    geometry: {
      selectorCount: actual.selectorCount,
      visibleCount: actual.visibleCount,
      width: actual.width,
      height: actual.height,
      circular: actual.circular,
    },
    interaction: {
      requested: interaction,
      matchesHover: actual.matchesHover,
      matchesFocusVisible: actual.matchesFocusVisible,
      matchesActive: actual.matchesActive,
      cursor: actual.cursor,
      color: actual.color,
      backgroundColor: actual.backgroundColor,
      backgroundImage: actual.backgroundImage,
      opacity: actual.opacity,
      transform: actual.transform,
      outlineColor: actual.outlineColor,
      outlineOffset: actual.outlineOffset,
      outlineStyle: actual.outlineStyle,
      outlineWidth: actual.outlineWidth,
      representation,
      tokenSignaturePresent,
      restSha256: options.restSha256,
      changedPixels,
    },
    contrastPairs: renderedContrastPairs,
    sensors: {
      Build: {
        expected: {headSha: head},
        observed: {checkoutSha: head, storybookSha: build},
        passed: build === head,
      },
      Story: {
        expected: {id: fixture.storyId, accessibleName: fixture.name},
        observed: {id: actual.storyId, accessibleName: actual.accessibleName},
        passed:
          actual.storyId === fixture.storyId &&
          actual.accessibleName === fixture.name,
      },
      Theme: {
        expected: 'neutral',
        observed: actual.theme,
        passed: actual.theme === 'neutral',
      },
      'Color mode': {
        expected: {
          global: mode,
          colorScheme: mode,
          surfaceLuminanceClass: mode,
        },
        observed: {
          global: actual.mode,
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
        expected: direction,
        observed: actual.direction,
        passed: actual.direction === direction,
      },
      'Viewport/media': {
        expected: {
          viewport: expectedViewport,
          devicePixelRatio: 1,
          forcedColors: false,
          reducedMotion: true,
          coarsePointer: expectedCoarse,
          hoverCapable: !expectedCoarse,
        },
        observed: {
          viewport: {width: viewport.width, height: viewport.height},
          devicePixelRatio: viewport.dpr,
          forcedColors: actual.forcedColors,
          reducedMotion: actual.reducedMotion,
          coarsePointer: actual.coarsePointer,
          hoverCapable: actual.hoverCapable,
          touchPoints: actual.touchPoints,
        },
        passed:
          viewport.width === expectedViewport.width &&
          viewport.height === expectedViewport.height &&
          viewport.dpr === 1 &&
          !actual.forcedColors &&
          actual.reducedMotion &&
          actual.coarsePointer === expectedCoarse &&
          actual.hoverCapable === !expectedCoarse &&
          (!expectedCoarse || actual.touchPoints > 0),
      },
      'Rendered state': {
        expected: {
          role: 'button',
          accessibleName: fixture.name,
          disabled: fixture.disabled,
          size: fixture.size,
          variant: fixture.state === 'stop' ? 'secondary' : 'primary',
          interaction,
          stateSignature: {
            hover: interaction === 'hover' || interaction === 'pressed',
            focusVisible: interaction === 'focus-visible',
            active: interaction === 'pressed',
            outline: interaction === 'focus-visible' ? 'visible' : 'none',
          },
          representation,
        },
        observed: {
          role: actual.role,
          accessibleName: actual.accessibleName,
          disabled: actual.disabled,
          size: actual.size,
          variant: actual.variant,
          interaction,
          stateSignature: {
            hover: actual.matchesHover,
            focusVisible: actual.matchesFocusVisible,
            active: actual.matchesActive,
            outline: actual.outlineStyle,
          },
          representation,
          tokenSignaturePresent,
          contrastPairs: renderedContrastPairs,
          changedPixels,
        },
        passed:
          actual.role === 'button' &&
          actual.accessibleName === fixture.name &&
          actual.disabled === fixture.disabled &&
          actual.size === fixture.size &&
          actual.variant ===
            (fixture.state === 'stop' ? 'secondary' : 'primary') &&
          interactionStateIsExclusive &&
          tokenSignaturePresent &&
          renderedContrastPairs.every(pair => pair.passed) &&
          (options.expectChangedPixels == null ||
            changedPixels === options.expectChangedPixels),
      },
      'Subject geometry': {
        expected: {
          selectorCount: 1,
          visibleCount: 1,
          nonZero: true,
          circular: true,
          contains24pxSquare: true,
        },
        observed: {
          selectorCount: actual.selectorCount,
          visibleCount: actual.visibleCount,
          width: actual.width,
          height: actual.height,
          circular: actual.circular,
        },
        passed:
          actual.selectorCount === 1 &&
          actual.visibleCount === 1 &&
          actual.width >= 24 &&
          actual.height >= 24 &&
          actual.circular,
      },
      'Settled render': {
        expected: {
          fontsReady: true,
          reducedMotion: true,
          storyError: false,
          pageErrors: 0,
        },
        observed: {
          fontsReady: actual.fontsReady,
          reducedMotion: actual.reducedMotion,
          storyError: actual.storyError,
          pageErrors: errors,
        },
        passed:
          actual.fontsReady &&
          actual.reducedMotion &&
          !actual.storyError &&
          errors.length === 0,
      },
      Image: {
        expected: {path: frame, nonBlankHash: true, nonZeroPixels: true},
        observed: image,
        passed:
          image.sha256.length === 64 &&
          image.width > 0 &&
          image.height > 0 &&
          image.nonBlank,
      },
    },
    settled: {
      fontsReady: actual.fontsReady,
      pageErrors: [...errors],
      storyError: actual.storyError,
    },
    image,
  };
  receipts.push(receipt);
  expect(failures, `${frame}: fail-closed sensor receipt`).toEqual([]);
  return receipt;
}

async function tabToSubject(page: Page): Promise<void> {
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('Tab');
    if (
      await page
        .locator(SUBJECT)
        .first()
        .evaluate(element => document.activeElement === element)
    ) {
      return;
    }
  }
  throw new Error('Tab did not reach ChatSendButton');
}

async function driveInteraction(
  page: Page,
  fixture: Fixture,
  interaction: Exclude<Interaction, 'rest'>,
): Promise<void> {
  const target = page.locator(SUBJECT).first();
  if (interaction === 'hover') {
    await target.hover();
    return;
  }
  if (interaction === 'focus-visible') {
    await tabToSubject(page);
    return;
  }
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error(`${fixture.key}: target has no layout box`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function coarseContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: {width: 320, height: 640},
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
}

async function readCoarseHitPair(
  page: Page,
  fixture: Fixture,
  direction: Direction,
): Promise<CoarseHitPair> {
  await openFixture(page, fixture, 'light', direction);
  return page.locator(SUBJECT).evaluateAll(
    (elements, expected) => {
      const visible = elements.filter(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      });
      const target = visible[0];
      const box = target?.getBoundingClientRect() ?? new DOMRect();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitTarget =
        target != null && (hit === target || target.contains(hit));
      const targetCenter = target?.getBoundingClientRect();
      const centered =
        targetCenter != null &&
        Math.abs(targetCenter.x + targetCenter.width / 2 - cx) < 0.5 &&
        Math.abs(targetCenter.y + targetCenter.height / 2 - cy) < 0.5;
      const coarsePointer = matchMedia('(pointer: coarse)').matches;
      const touchPoints = navigator.maxTouchPoints;
      const passed =
        elements.length === 1 &&
        visible.length === 1 &&
        box.width >= 24 &&
        box.height >= 24 &&
        coarsePointer &&
        touchPoints > 0 &&
        hitTarget &&
        centered;
      return {
        fixture: expected.key,
        size: expected.size,
        state: expected.state,
        direction: expected.direction,
        coarsePointer,
        touchPoints,
        selectorCount: elements.length,
        visibleCount: visible.length,
        target: {x: box.x, y: box.y, width: box.width, height: box.height},
        hit: hitTarget,
        centered,
        passed,
      };
    },
    {
      key: fixture.key,
      size: fixture.size,
      state: fixture.state as 'send' | 'stop',
      direction,
    },
  );
}

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
      'apps/storybook/stories/ChatSendButtonAudit.stories.tsx',
      'packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts',
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
  if (!head || !build) {
    await server?.close();
    return;
  }
  const manifestPath = path.join(OUTPUT, 'manifest.json');
  const contactSheetFile = 'chat-send-button__contact-sheet.png';
  const contactSheetPath = path.join(OUTPUT, contactSheetFile);
  const contactSheet = fs.existsSync(contactSheetPath)
    ? pngShot(contactSheetFile, fs.readFileSync(contactSheetPath))
    : null;
  const mergedFrames = [...receipts];
  const mergedCoarseHitPairs = [...coarseHitPairs];
  const d7ContrastPairs = mergedFrames.flatMap(frame =>
    frame.contrastPairs.map(pair => ({frame: frame.frame, ...pair})),
  );
  const expectedFrames: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    for (const fixture of [FIXTURES.sendMd, FIXTURES.stopMd]) {
      for (const interaction of [
        'rest',
        'hover',
        'focus-visible',
        'pressed',
      ] as const) {
        expectedFrames.push(`${fixture.key}__${interaction}__${mode}`);
      }
    }
    expectedFrames.push(
      `${FIXTURES.disabledMd.key}__rest__${mode}`,
      `${FIXTURES.disabledMd.key}__hover__${mode}`,
      `${FIXTURES.sendSm.key}__rest__${mode}`,
      `${FIXTURES.stopSm.key}__rest__${mode}`,
      `stop-md-narrow-coarse__rest__${mode}__320px-coarse`,
    );
  }
  const expectedPairs = [
    FIXTURES.sendSm,
    FIXTURES.sendMd,
    FIXTURES.stopSm,
    FIXTURES.stopMd,
  ].flatMap(fixture =>
    (['ltr', 'rtl'] as const).map(direction => `${fixture.key}:${direction}`),
  );
  const matrixFailures = [
    ...(contactSheet?.nonBlank ? [] : ['missing or blank contact sheet']),
    ...expectedFrames
      .filter(frame => !mergedFrames.some(receipt => receipt.frame === frame))
      .map(frame => `missing frame: ${frame}`),
    ...mergedFrames
      .filter(receipt => !receipt.passed)
      .map(receipt => `failed frame: ${receipt.frame}`),
    ...expectedPairs
      .filter(
        pair =>
          !mergedCoarseHitPairs.some(
            receipt => `${receipt.fixture}:${receipt.direction}` === pair,
          ),
      )
      .map(pair => `missing coarse hit pair: ${pair}`),
    ...mergedCoarseHitPairs
      .filter(pair => !pair.passed)
      .map(pair => `failed coarse hit pair: ${pair.fixture}:${pair.direction}`),
    ...d7ContrastPairs
      .filter(pair => !pair.passed)
      .map(pair => `failed D7 contrast pair: ${pair.frame}/${pair.part}`),
    ...(['light', 'dark'] as const).flatMap(mode =>
      (['send', 'stop'] as const).flatMap(state => {
        const small = mergedFrames.find(
          frame => frame.frame === `${state}-sm__rest__${mode}`,
        );
        const medium = mergedFrames.find(
          frame => frame.frame === `${state}-md__rest__${mode}`,
        );
        return small != null &&
          medium != null &&
          medium.geometry.width > small.geometry.width &&
          medium.geometry.height > small.geometry.height
          ? []
          : [`size geometry did not increase: ${state}/${mode}`];
      }),
    ),
  ];
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        component: 'core/ChatSendButton',
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
          requiredPair: false,
          reason:
            'The runtime fix changes event composition only and has no rendering delta, so Q12 requires exact-head state evidence rather than a before/after pixel pair.',
          contactSheet,
        },
        notApplicable: {
          loading: 'ChatSendButton exposes no loading state.',
          status: 'ChatSendButton exposes no status-message state.',
          selected: 'ChatSendButton is an action, not a selectable control.',
          empty:
            'The icon-only action has no empty-content state; its translated name is always present.',
          overflow:
            'The icon-only circular target contains no variable text content that can overflow.',
        },
        stateVisualConformance: {
          enabledSendMd: ['rest', 'hover', 'focus-visible', 'pressed'],
          disabledSendMd: ['rest', 'hover-no-paint'],
          stopMd: ['rest', 'hover', 'focus-visible', 'pressed'],
          sendSm: ['rest'],
          stopSm: ['rest'],
          colorModes: ['light', 'dark'],
        },
        frames: mergedFrames,
        d7ContrastPairs,
        coarseHitPairs: mergedCoarseHitPairs,
      },
      null,
      2,
    )}\n`,
  );
  await server?.close();
  expect(matrixFailures, 'complete exact-head evidence matrix').toEqual([]);
});

for (const mode of ['light', 'dark'] as const) {
  test(`captures the ${mode} interaction, disabled, and size matrix`, async ({
    page,
  }) => {
    for (const fixture of [FIXTURES.sendMd, FIXTURES.stopMd]) {
      const {errors: restErrors} = await openFixture(page, fixture, mode);
      const rest = await capture(page, fixture, mode, 'rest', restErrors);

      for (const interaction of [
        'hover',
        'focus-visible',
        'pressed',
      ] as const) {
        const {errors} = await openFixture(page, fixture, mode);
        await driveInteraction(page, fixture, interaction);
        await capture(page, fixture, mode, interaction, errors, {
          restSha256: rest.image.sha256,
          expectChangedPixels: true,
        });
        if (interaction === 'pressed') {
          await page.mouse.up();
        }
      }
    }

    const disabled = FIXTURES.disabledMd;
    const {errors: disabledRestErrors} = await openFixture(
      page,
      disabled,
      mode,
    );
    const disabledRest = await capture(
      page,
      disabled,
      mode,
      'rest',
      disabledRestErrors,
    );
    const {errors: disabledHoverErrors} = await openFixture(
      page,
      disabled,
      mode,
    );
    await page.locator(SUBJECT).hover({force: true});
    await capture(page, disabled, mode, 'hover', disabledHoverErrors, {
      restSha256: disabledRest.image.sha256,
      expectChangedPixels: false,
    });

    for (const fixture of [FIXTURES.sendSm, FIXTURES.stopSm]) {
      const {errors} = await openFixture(page, fixture, mode);
      await capture(page, fixture, mode, 'rest', errors);
    }
  });
}

test('captures 320px coarse-pointer evidence from DisabledStreamingNarrow', async ({
  browser,
}) => {
  const context = await coarseContext(browser);
  const page = await context.newPage();
  const fixture: Fixture = {
    ...FIXTURES.stopMd,
    key: 'stop-md-narrow-coarse',
    storyId: NARROW_STORY,
  };
  for (const mode of ['light', 'dark'] as const) {
    const {errors} = await openFixture(page, fixture, mode);
    await settleStoryPlayAndBlur(page);
    await capture(page, fixture, mode, 'rest', errors, {
      expectCoarse: true,
      expectedViewport: {width: 320, height: 640},
      frameSuffix: '__320px-coarse',
    });
  }
  await context.close();
});

test('records the complete coarse hit-target matrix', async ({browser}) => {
  const context = await coarseContext(browser);
  const page = await context.newPage();
  for (const fixture of [
    FIXTURES.sendSm,
    FIXTURES.sendMd,
    FIXTURES.stopSm,
    FIXTURES.stopMd,
  ]) {
    for (const direction of ['ltr', 'rtl'] as const) {
      const pair = await readCoarseHitPair(page, fixture, direction);
      coarseHitPairs.push(pair);
      expect(pair.passed, `${fixture.key}/${direction}: coarse hit pair`).toBe(
        true,
      );
    }
  }
  await writeContactSheet(page);
  await context.close();
});
