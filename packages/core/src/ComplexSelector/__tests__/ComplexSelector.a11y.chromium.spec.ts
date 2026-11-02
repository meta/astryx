// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ComplexSelector

/**
 * @file ComplexSelector.a11y.chromium.spec.ts
 * @input Exact-head ComplexSelector stories: the audit matrix, the secondary
 *   toolbar trigger, and the tree-search popup, across states, themes,
 *   direction, pointers, viewport sizes, and an app-declared layer inset
 * @output Screenshots and fail-closed sensor receipts for the ComplexSelector whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a ComplexSelector audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {inflateSync} from 'node:zlib';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/complex-selector-audit-evidence');
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 720};
const SHORT = {width: 1024, height: 360};
/** An app-declared bar over the block-end edge, as an app declares it once. */
const APP_INSET_BLOCK_END = 80;
/** The layer runtime's gutter at the default spacing scale (spacing-4). */
const RUNTIME_GUTTER = 16;
/** The popup's offset from its control (spacing-1 at the default scale) plus 1px. */
const POPUP_OFFSET_TOLERANCE = 5;

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter' | 'probe';
type Pointer = 'fine' | 'coarse';
type Story = 'matrix' | 'secondary' | 'tree';
type State =
  | 'rest'
  | 'hover'
  | 'focus-visible'
  | 'pressed'
  | 'open'
  | 'disabled-hover'
  | 'disabled-focus'
  | 'caller-open'
  | 'tall-open';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  state: State;
  pointer: Pointer;
  forcedColors: boolean;
  viewport: {width: number; height: number};
  inset: boolean;
};

type AuditReceipt = {passed: boolean; expected: Record<string, unknown>};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story: options.story ?? 'matrix',
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      state: options.state ?? 'rest',
      pointer: options.pointer ?? 'fine',
      forcedColors: options.forcedColors ?? false,
      viewport: options.viewport ?? WIDE,
      inset: options.inset ?? false,
    });
  }
}

addPair('matrix-rest');
addPair('matrix-rest-butter', {theme: 'butter'});
addPair('matrix-rest-probe', {theme: 'probe'});
addPair('matrix-rest-rtl', {direction: 'rtl'});
addPair('matrix-rest-narrow', {viewport: NARROW});
addPair('matrix-rest-coarse', {viewport: NARROW, pointer: 'coarse'});
addPair('matrix-rest-forced-colors', {forcedColors: true});
addPair('input-hover', {state: 'hover'});
addPair('input-hover-butter', {state: 'hover', theme: 'butter'});
addPair('input-focus-visible', {state: 'focus-visible'});
addPair('input-focus-visible-butter', {
  state: 'focus-visible',
  theme: 'butter',
});
addPair('input-focus-visible-forced-colors', {
  state: 'focus-visible',
  forcedColors: true,
});
addPair('input-pressed', {state: 'pressed'});
addPair('input-open', {state: 'open'});
addPair('input-open-rtl', {state: 'open', direction: 'rtl'});
addPair('input-open-coarse', {
  state: 'open',
  viewport: NARROW,
  pointer: 'coarse',
});
addPair('disabled-hover', {state: 'disabled-hover'});
addPair('disabled-focus', {state: 'disabled-focus'});
addPair('caller-open', {state: 'caller-open'});
addPair('caller-open-rtl', {state: 'caller-open', direction: 'rtl'});
addPair('caller-open-narrow', {state: 'caller-open', viewport: NARROW});
addPair('secondary-rest', {story: 'secondary'});
addPair('secondary-hover', {story: 'secondary', state: 'hover'});
addPair('secondary-open', {story: 'secondary', state: 'open'});
addPair('tall-open', {story: 'tree', state: 'tall-open', viewport: SHORT});
addPair('tall-open-inset', {
  story: 'tree',
  state: 'tall-open',
  viewport: SHORT,
  inset: true,
});

/** The combobox each state drives, by accessible name. */
function targetName(item: AuditCase): string | null {
  if (item.story === 'secondary') {
    return 'View density';
  }
  if (item.story === 'tree') {
    return 'Project destination';
  }
  if (item.state === 'disabled-hover' || item.state === 'disabled-focus') {
    return 'Disabled value';
  }
  if (item.state === 'caller-open') {
    return 'Custom trigger selector';
  }
  return item.state === 'rest' ? null : 'Selected medium';
}

function storyId(item: AuditCase) {
  if (item.story === 'secondary') {
    return 'core-complexselector--secondary-variant';
  }
  if (item.story === 'tree') {
    // The app declares its block-end bar once, through LayerProvider's
    // public `inset` (spec:AST-059 FR6), in its own story.
    return item.inset
      ? 'core-complexselector--tree-list-with-search-above-app-bar'
      : 'core-complexselector--tree-list-with-search';
  }
  return 'core-complexselector--audit-matrix';
}

/**
 * The root color scheme: `html[data-theme]` maps the mode to `color-scheme`,
 * and forced colors mode forces `color-scheme: light dark` (CSS Color
 * Adjustment Module Level 1).
 */
function expectedColorScheme(item: AuditCase) {
  return item.forcedColors ? 'light dark' : item.mode;
}

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

/**
 * Whether a PNG paints more than one color, read from its decoded pixels so a
 * blank or single-color frame cannot pass as evidence.
 */
function isNonBlank(png: Buffer): boolean {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
    } else if (type === 'IDAT') {
      chunks.push(data);
    }
    offset += 12 + length;
  }
  if (channels === 0 || width === 0 || height === 0) {
    return false;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  let first: string | null = null;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(
      raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
    );
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predictor =
          toLeft <= toUp && toLeft <= toUpLeft
            ? left
            : toUp <= toUpLeft
              ? up
              : upLeft;
      }
      line[x] = (line[x] + predictor) & 255;
    }
    for (let x = 0; x < stride; x += channels) {
      const pixel = line.subarray(x, x + channels).toString('hex');
      if (first == null) {
        first = pixel;
      } else if (pixel !== first) {
        return true;
      }
    }
    previous = line;
  }
  return false;
}

async function nextFrames(page: Page) {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Settled-render readback taken just before capture: running animations under
 * the subject, and the subject plus every selector control box and open popup
 * measured twice, two animation frames and 100 ms apart.
 */
async function readSettledRender(page: Page, rootSelector: string) {
  const sample = async () =>
    page.evaluate(selector => {
      const root = document.querySelector(selector);
      const nodes = [
        root,
        ...document.querySelectorAll(
          '.astryx-complex-selector, .astryx-complex-selector-popup',
        ),
      ].filter(
        (node): node is Element => node != null && node.checkVisibility(),
      );
      return nodes.map(node => {
        const box = node.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map(
          value => Math.round(value * 100) / 100,
        );
      });
    }, rootSelector);
  const first = await sample();
  await nextFrames(page);
  await page.waitForTimeout(100);
  const second = await sample();
  const runningAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(animation => animation.playState === 'running').length,
  );
  return {
    runningAnimations,
    geometry: {first, second},
    geometryStable: JSON.stringify(first) === JSON.stringify(second),
  };
}

/** Text contrast for labels, trigger text, and status messages. */
async function readContrastPairs(page: Page, rootSelector: string) {
  return page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (root == null) {
      return [];
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    /** Any computed CSS color as sRGB 0–255 plus alpha 0–1. */
    function rgba(color: string): [number, number, number, number] {
      if (ctx == null) {
        return [0, 0, 0, 0];
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    }
    function over(
      front: [number, number, number, number],
      back: [number, number, number],
    ): [number, number, number] {
      return [0, 1, 2].map(
        index => front[index] * front[3] + back[index] * (1 - front[3]),
      ) as [number, number, number];
    }
    function backdrop(element: Element): [number, number, number] {
      const layers: [number, number, number, number][] = [];
      let node: Element | null = element;
      while (node) {
        const layer = rgba(getComputedStyle(node).backgroundColor);
        if (layer[3] > 0) {
          layers.push(layer);
          if (layer[3] >= 0.999) {
            break;
          }
        }
        node = node.parentElement;
      }
      if (layers.length === 0 || layers[layers.length - 1][3] < 0.999) {
        layers.push(rgba(getComputedStyle(document.body).backgroundColor));
      }
      return layers
        .reverse()
        .reduce<[number, number, number]>(
          (back, front) => over(front, back),
          [255, 255, 255],
        );
    }
    function luminance([r, g, b]: number[]) {
      const [lr, lg, lb] = [r, g, b].map(channel => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    }
    const parts = [
      ...root.querySelectorAll(
        'label, .astryx-complex-selector button[role="combobox"] > span, .astryx-field-status',
      ),
    ].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return parts.map(element => {
      const style = getComputedStyle(element);
      const back = backdrop(element);
      const front = over(rgba(style.color), back);
      const [high, low] = [luminance(front), luminance(back)].sort(
        (a, b) => b - a,
      );
      const ratio = Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseFloat(style.fontWeight) || 400;
      const threshold =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      const control =
        element.closest('.astryx-complex-selector') ??
        (element instanceof HTMLLabelElement && element.htmlFor
          ? document
              .getElementById(element.htmlFor)
              ?.closest('.astryx-complex-selector')
          : null);
      const isDisabled =
        control?.querySelector('[aria-disabled="true"]') != null;
      return {
        part: `${element.tagName.toLowerCase()}: ${(element.textContent ?? '').trim().slice(0, 60)}`,
        color: style.color,
        backdrop: `rgb(${back.map(Math.round).join(', ')})`,
        fontSize,
        fontWeight,
        ratio,
        threshold,
        exception: isDisabled ? 'inactive control' : null,
        passed: isDisabled || ratio + 1e-6 >= threshold,
      };
    });
  }, rootSelector);
}

async function paintOf(owner: Locator) {
  return owner.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      transform: style.transform,
      cursor: style.cursor,
    };
  });
}

/**
 * The open popup's layer box and the component-owned scroll containers in it
 * (the layer root, the painted surface, and the content box the trigger
 * controls) whose content overflows them. Caller content is not counted.
 */
async function readPopupScroll(page: Page, contentId: string | null) {
  return page.evaluate(controlsId => {
    const surface = [
      ...document.querySelectorAll('.astryx-complex-selector-popup'),
    ].find(element => element.checkVisibility());
    if (surface == null) {
      return null;
    }
    const popup = surface.closest('[popover]') ?? surface;
    const box = popup.getBoundingClientRect();
    const content =
      controlsId == null ? null : document.getElementById(controlsId);
    const owned = [popup, surface, content].filter(
      (element, index, list): element is Element =>
        element != null && list.indexOf(element) === index,
    );
    const scrolling = owned
      .filter(element => {
        const overflowY = getComputedStyle(element).overflowY;
        return (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          element.scrollHeight > element.clientHeight + 1
        );
      })
      .map(element => ({
        node:
          element === popup
            ? 'layer'
            : element === surface
              ? 'surface'
              : 'content',
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
    const edges = (element: Element | null) => {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      };
    };
    return {
      owned: owned.length,
      geometry: {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        height: box.height,
      },
      // The painted surface and the content it holds can extend past a capped
      // layer box; the block-end bar must clear what paints, not only the box.
      surfaceGeometry: edges(surface),
      contentGeometry: edges(content),
      scrolling,
    };
  }, contentId);
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expected = process.env.ASTRYX_HEAD_SHA;
  if (expected && expected !== checkoutSha) {
    throw new Error(
      `checkout ${checkoutSha} does not match expected head ${expected}`,
    );
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const response = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!response.ok) {
    throw new Error(`Storybook build has no SHA stamp (${response.status})`);
  }
  storybookSha = (await response.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      `Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
});

test.afterAll(async () => {
  await server?.close();
});

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: item.viewport,
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
      hasTouch: item.pointer === 'coarse',
      forcedColors: item.forcedColors ? 'active' : 'none',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(
      `${server.origin}/iframe.html?id=${storyId(item)}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`,
      {waitUntil: 'load'},
    );
    await page.locator('#storybook-root').waitFor();
    const rootSelector =
      item.story === 'matrix'
        ? '[data-testid="audit-matrix"]'
        : '#storybook-root';
    const subject = page.locator(rootSelector);
    await subject.waitFor();
    // Read the shipped transitions under reduced motion before
    // `holdMotionStill` overrides every duration for the captures:
    // design:reduced-motion DR1/DR3 require a fine-pointer state change to
    // complete at once, with no animated transform.
    await page.emulateMedia({reducedMotion: 'reduce'});
    const reducedMotionTransitions = await page.evaluate(selector => {
      const root = document.querySelector(selector);
      return [
        ...(root?.querySelectorAll(
          '.astryx-complex-selector, .astryx-complex-selector *',
        ) ?? []),
      ]
        .map(element => {
          const style = getComputedStyle(element);
          const properties = style.transitionProperty.split(',');
          const durations = style.transitionDuration.split(',');
          return properties
            .map((property, index) => ({
              property: property.trim(),
              duration: (durations[index % durations.length] ?? '0s').trim(),
            }))
            .filter(
              ({property, duration}) =>
                (property === 'transform' || property === 'all') &&
                Number.parseFloat(duration) > 0,
            )
            .map(transition => ({
              target:
                typeof element.className === 'string'
                  ? (element.className
                      .split(' ')
                      .find(name => name.startsWith('astryx-')) ??
                    element.tagName.toLowerCase())
                  : element.tagName.toLowerCase(),
              ...transition,
            }));
        })
        .flat();
    }, rootSelector);
    await holdMotionStill(page);
    await page.evaluate(async () => document.fonts.ready);

    const name = targetName(item);
    const trigger =
      name == null ? null : page.getByRole('combobox', {name, exact: true});
    // The built-in control box paints the field; a caller-rendered control
    // paints itself.
    const owner =
      trigger == null
        ? null
        : item.state === 'caller-open'
          ? trigger
          : page.locator('.astryx-complex-selector', {has: trigger});
    const restPaint = owner == null ? null : await paintOf(owner);
    let statePaint: Awaited<ReturnType<typeof paintOf>> | null = null;
    const stateFacts: Record<string, unknown> = {};

    if (trigger != null && owner != null) {
      if (item.state === 'hover' || item.state === 'disabled-hover') {
        await trigger.hover();
        stateFacts.hovered = await owner.evaluate(element =>
          element.matches(':hover'),
        );
      } else if (
        item.state === 'focus-visible' ||
        item.state === 'disabled-focus'
      ) {
        // Reach the trigger by keyboard: the field ring is a keyboard ring.
        await trigger.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        stateFacts.focused = await trigger.evaluate(
          element => element === document.activeElement,
        );
        stateFacts.focusVisible = await trigger.evaluate(element =>
          element.matches(':focus-visible'),
        );
        if (item.state === 'disabled-focus') {
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }
      } else if (item.state === 'pressed') {
        const box = await trigger.boundingBox();
        if (box == null) {
          throw new Error(`${item.key}: trigger has no layout box`);
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        stateFacts.active = await trigger.evaluate(element =>
          element.matches(':active'),
        );
      } else if (
        item.state === 'open' ||
        item.state === 'caller-open' ||
        item.state === 'tall-open'
      ) {
        if (item.state === 'caller-open') {
          // spec:AST-055 AR2: the caller's control carries the one focus
          // ring. Reach it by keyboard and record its ring before opening.
          await trigger.focus();
          await page.keyboard.press('Shift+Tab');
          await page.keyboard.press('Tab');
          stateFacts.callerFocused = await trigger.evaluate(
            element => element === document.activeElement,
          );
          stateFacts.callerFocusVisible = await trigger.evaluate(element =>
            element.matches(':focus-visible'),
          );
          await nextFrames(page);
          const focusPaint = await paintOf(owner);
          stateFacts.callerFocusPaint = focusPaint;
          // A ring the rest state does not already paint: a visible outline
          // that differs from rest, or a changed box shadow.
          stateFacts.callerFocusRing =
            (focusPaint.outlineStyle !== 'none' &&
              Number.parseFloat(focusPaint.outlineWidth) > 0 &&
              (focusPaint.outlineStyle !== restPaint?.outlineStyle ||
                focusPaint.outlineWidth !== restPaint?.outlineWidth ||
                focusPaint.outlineColor !== restPaint?.outlineColor)) ||
            focusPaint.boxShadow !== restPaint?.boxShadow;
          await page.mouse.move(0, 0);
        }
        if (item.pointer === 'coarse') {
          await trigger.tap();
        } else {
          await trigger.click();
        }
        await page
          .getByRole('dialog', {name: name ?? undefined, exact: true})
          .waitFor({state: 'visible'});
        await page.mouse.move(0, 0);
      }
      await nextFrames(page);
      statePaint = await paintOf(owner);
    }
    await page.evaluate(async () => document.fonts.ready);

    const observed = await page.evaluate(selector => {
      const root = document.querySelector(selector);
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        direction:
          root == null
            ? null
            : getComputedStyle(
                root.querySelector('.astryx-complex-selector, button') ?? root,
              ).direction,
        viewport: {width: innerWidth, height: innerHeight},
        dpr: devicePixelRatio,
        hover: matchMedia('(hover: hover)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        forcedColors: matchMedia('(forced-colors: active)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        storybookError: document.body.classList.contains(
          'sb-show-errordisplay',
        ),
        comboboxes: root?.querySelectorAll('[role="combobox"]').length ?? 0,
        statuses: [...(root?.querySelectorAll('.astryx-field-status') ?? [])]
          .length,
        statusesWithIcon: [
          ...(root?.querySelectorAll('.astryx-field-status') ?? []),
        ].filter(status => status.querySelector('svg') != null).length,
        onFieldStatusIcons:
          root?.querySelectorAll(
            '.astryx-complex-selector .astryx-input-status-icon',
          ).length ?? 0,
        overflowingElements: [...document.querySelectorAll('body *')]
          .filter(element => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.right > innerWidth + 1;
          })
          .slice(0, 5)
          .map(element => {
            const box = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className:
                typeof element.className === 'string'
                  ? element.className.slice(0, 80)
                  : '',
              left: box.left,
              right: box.right,
            };
          }),
      };
    }, rootSelector);

    const triggerFacts =
      trigger == null
        ? null
        : await trigger.evaluate(element => ({
            role: element.getAttribute('role'),
            expanded: element.getAttribute('aria-expanded'),
            disabled: element.getAttribute('aria-disabled'),
            nativeDisabled: (element as HTMLButtonElement).disabled === true,
            focused: element === document.activeElement,
          }));
    const matrixFacts =
      item.story === 'matrix'
        ? await page.evaluate(() => {
            const read = (label: string) => {
              const element = [
                ...document.querySelectorAll('[role="combobox"]'),
              ].find(
                candidate =>
                  candidate.getAttribute('aria-labelledby') != null &&
                  document
                    .getElementById(
                      candidate.getAttribute('aria-labelledby') ?? '',
                    )
                    ?.textContent?.trim()
                    .startsWith(label),
              );
              return element == null
                ? null
                : {
                    busy: element.getAttribute('aria-busy'),
                    disabled: element.getAttribute('aria-disabled'),
                    nativeDisabled:
                      (element as HTMLButtonElement).disabled === true,
                    required: element.getAttribute('aria-required'),
                    invalid: element.getAttribute('aria-invalid'),
                  };
            };
            const custom = document.querySelector(
              '[data-testid="rtl-custom-trigger"]',
            );
            return {
              loading: read('Loading value'),
              disabled: read('Disabled value'),
              invalid: read('Invalid required value'),
              customRole: custom?.getAttribute('role') ?? null,
              customDisabled: custom?.getAttribute('aria-disabled') ?? null,
            };
          })
        : null;
    const popupScroll = await readPopupScroll(
      page,
      trigger == null ? null : await trigger.getAttribute('aria-controls'),
    );
    const popupFitsInline =
      popupScroll == null ||
      (popupScroll.geometry.left >= -1 &&
        popupScroll.geometry.right <= item.viewport.width + 1);
    // Recorded: whether the popup also keeps the runtime's inline gutter.
    const popupKeepsGutter =
      popupScroll == null ||
      (popupScroll.geometry.left >= RUNTIME_GUTTER - 1 &&
        popupScroll.geometry.right <= item.viewport.width - RUNTIME_GUTTER + 1);
    const contrast = item.forcedColors
      ? []
      : await readContrastPairs(page, rootSelector);

    let statePass: boolean;
    if (item.state === 'rest') {
      statePass =
        reducedMotionTransitions.length === 0 &&
        (item.story === 'secondary'
          ? observed.comboboxes === 1
          : observed.comboboxes === 10 &&
            observed.statuses === 3 &&
            matrixFacts?.loading?.busy === 'true' &&
            matrixFacts.disabled?.disabled === 'true' &&
            matrixFacts.disabled.nativeDisabled === false &&
            matrixFacts.invalid?.required === 'true' &&
            matrixFacts.invalid.invalid === 'true' &&
            matrixFacts.customRole === 'combobox' &&
            matrixFacts.customDisabled === null);
    } else if (item.state === 'hover') {
      statePass =
        stateFacts.hovered === true &&
        JSON.stringify(statePaint) !== JSON.stringify(restPaint);
    } else if (item.state === 'disabled-hover') {
      statePass =
        stateFacts.hovered === true &&
        triggerFacts?.disabled === 'true' &&
        JSON.stringify(statePaint) === JSON.stringify(restPaint) &&
        statePaint?.cursor === 'default';
    } else if (item.state === 'focus-visible') {
      statePass =
        stateFacts.focused === true &&
        stateFacts.focusVisible === true &&
        (statePaint?.outlineStyle !== 'none' ||
          statePaint.boxShadow !== restPaint?.boxShadow);
    } else if (item.state === 'disabled-focus') {
      statePass =
        stateFacts.focused === true &&
        triggerFacts?.focused === true &&
        triggerFacts.disabled === 'true' &&
        triggerFacts.nativeDisabled === false &&
        triggerFacts.expanded === 'false';
    } else if (item.state === 'pressed') {
      statePass = stateFacts.active === true;
    } else if (item.state === 'tall-open') {
      // One scroll owner and a box inside the runtime's gutters: the layer
      // runtime owns the viewport cap and every consumer inherits it.
      const floor =
        item.viewport.height -
        RUNTIME_GUTTER -
        (item.inset ? APP_INSET_BLOCK_END : 0);
      const paintedBottom =
        popupScroll == null
          ? Number.POSITIVE_INFINITY
          : Math.max(
              popupScroll.geometry.bottom,
              popupScroll.surfaceGeometry?.bottom ?? Number.POSITIVE_INFINITY,
              popupScroll.contentGeometry?.bottom ?? Number.POSITIVE_INFINITY,
            );
      stateFacts.paintedBottom = paintedBottom;
      stateFacts.floor = floor;
      statePass =
        triggerFacts?.expanded === 'true' &&
        popupScroll != null &&
        popupScroll.scrolling.length <= 1 &&
        paintedBottom <= floor + 1;
    } else {
      statePass =
        triggerFacts?.expanded === 'true' &&
        triggerFacts.role === 'combobox' &&
        popupScroll != null &&
        popupFitsInline;
      if (item.state === 'caller-open' && trigger != null) {
        // spec:AST-055 FR4: the popup opens against the caller's control,
        // touching its block edge and overlapping it inline.
        const control = await trigger.boundingBox();
        const surface = popupScroll?.surfaceGeometry ?? null;
        const anchored =
          control != null &&
          surface != null &&
          surface.left < control.x + control.width &&
          surface.right > control.x &&
          (Math.abs(surface.top - (control.y + control.height)) <=
            POPUP_OFFSET_TOLERANCE ||
            Math.abs(control.y - surface.bottom) <= POPUP_OFFSET_TOLERANCE);
        stateFacts.controlRect = control;
        stateFacts.anchoredToControl = anchored;
        statePass =
          statePass &&
          anchored &&
          stateFacts.callerFocused === true &&
          stateFacts.callerFocusVisible === true &&
          stateFacts.callerFocusRing === true;
      }
    }

    const settled = await readSettledRender(page, rootSelector);
    const png =
      item.story === 'matrix' && popupScroll == null
        ? await subject.screenshot({animations: 'disabled'})
        : await page.screenshot({animations: 'disabled'});
    if (item.state === 'pressed') {
      await page.mouse.up();
    }

    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 3,
      expected: {
        build: checkoutSha,
        storyId: storyId(item),
        mode: item.mode,
        colorScheme: expectedColorScheme(item),
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        target: name,
        pointer: item.pointer,
        forcedColors: item.forcedColors,
        viewport: item.viewport,
        dpr: 1,
        appInsetBlockEnd: item.inset ? APP_INSET_BLOCK_END : 0,
        reducedMotionTransforms: item.state === 'rest' ? 0 : null,
        runningAnimations: 0,
        geometryStable: true,
        textContrastThreshold: 4.5,
      },
      observed: {
        build: storybookSha,
        ...observed,
        trigger: triggerFacts,
        matrix: matrixFacts,
        restPaint,
        statePaint,
        stateFacts,
        reducedMotionTransitions,
        popup: popupScroll,
        contrast,
        settled,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        nonBlank: isNonBlank(png),
      },
      checks: {
        statePass,
        popupFitsInline,
        popupKeepsGutter,
        // Recorded, not gating: a token-layer pair is reported against the
        // token layer rather than this component.
        contrastPass: contrast.every(pair => pair.passed),
      },
      passed:
        storybookSha === checkoutSha &&
        pageErrors.length === 0 &&
        !observed.storybookError &&
        observed.theme === item.theme &&
        observed.mode === item.mode &&
        observed.colorScheme === expectedColorScheme(item) &&
        observed.direction === item.direction &&
        observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height &&
        observed.dpr === 1 &&
        observed.reducedMotion &&
        observed.coarsePointer === (item.pointer === 'coarse') &&
        observed.forcedColors === item.forcedColors &&
        !observed.horizontalOverflow &&
        observed.fonts === 'loaded' &&
        settled.runningAnimations === 0 &&
        settled.geometryStable &&
        isNonBlank(png) &&
        popupFitsInline &&
        statePass,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );

    await context.close();
  });
}

test('manifest is complete', async () => {
  const receiptFiles = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  const receipts = receiptFiles.map(
    (file): AuditReceipt =>
      JSON.parse(
        fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
      ) as AuditReceipt,
  );
  const manifest = {
    schemaVersion: 3,
    component: 'core/ComplexSelector',
    build: checkoutSha,
    frames: cases.map(item => ({
      key: item.key,
      image: `${item.key}.png`,
      receipt: `${item.key}.sensors.json`,
    })),
  };
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => receipt.expected),
  ).toEqual([]);
});
