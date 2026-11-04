// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file OutlineFocus.a11y.chromium.spec.ts
 * @input Uses the built Outline keyboard-navigation Storybook story and real Chromium
 * @output Pixel, computed-style, input-modality, focus-model, and clipping evidence
 *   for Outline's keyboard focus indicator
 * @position Browser regression for the focus behavior that DOM emulation cannot paint
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Browser, type Page} from '@playwright/test';
import pixelmatch from 'pixelmatch';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/outline-focus-evidence');
const STORY_ID = 'core-outline--keyboard-navigation';
const BASE_VIEWPORT = {width: 1280, height: 900};

interface FocusPaint {
  readonly text: string;
  readonly tag: string;
  readonly focusVisible: boolean;
  readonly tabIndex: string | null;
  readonly ariaCurrent: string | null;
  readonly ariaActiveDescendant: string | null;
  readonly level: string | null;
  readonly outline: {
    readonly width: string;
    readonly style: string;
    readonly color: string;
    readonly offset: string;
  };
  readonly tokens: {
    readonly width: string;
    readonly style: string;
    readonly color: string;
    readonly offset: string;
  };
  readonly adjacentBackground: string;
  readonly contrast: number;
  readonly clippedBy: ReadonlyArray<string>;
}

interface Receipt {
  readonly target: string;
  readonly state: string;
  readonly theme: 'neutral';
  readonly mode: 'light' | 'dark';
  readonly direction: 'ltr' | 'rtl';
  readonly viewport: {readonly width: number; readonly height: number};
  readonly forcedColors: boolean;
  readonly pageScaleFactor: number;
  readonly browser: string;
  readonly build: string;
  readonly focused: FocusPaint;
  readonly arrowed: FocusPaint;
  readonly pointerFocusVisible: boolean;
  readonly touchFocusVisible: boolean | null;
  readonly restToFocusChangedPixels: number;
  readonly restToArrowChangedPixels: number;
  readonly screenshots: ReadonlyArray<string>;
  readonly video: string;
}

let storybook: StaticServer;
const receipts: Receipt[] = [];
let checkoutSha = '';
let storybookSha = '';

test.beforeAll(async () => {
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    process.env.ASTRYX_HEAD_SHA &&
    process.env.ASTRYX_HEAD_SHA !== checkoutSha
  ) {
    throw new Error('The audited checkout does not match the PR head');
  }
  fs.mkdirSync(OUTPUT, {recursive: true});
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
});

test.afterAll(async () => {
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        component: 'core/Outline',
        checkoutSha,
        storybookSha,
        storyId: STORY_ID,
        statesNotApplicable: {
          selected: 'Outline exposes current location, not selection',
          disabled: 'OutlineItem has no disabled state',
          ariaActiveDescendant:
            'Outline uses actual DOM focus with roving tabindex instead',
        },
        receipts,
      },
      null,
      2,
    )}\n`,
  );
  await storybook?.close();
});

function storyUrl(
  origin: string,
  mode: 'light' | 'dark',
  direction: 'ltr' | 'rtl',
): string {
  return `${origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=astryxTheme:neutral;colorMode:${mode};direction:${direction}`;
}

function parseColor(color: string): [number, number, number, number] {
  const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) {
    throw new Error(`Cannot parse rendered color: ${color}`);
  }
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}

function luminance([red, green, blue]: ReadonlyArray<number>): number {
  const linear = [red, green, blue].map(channel => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(parseColor(foreground));
  const backgroundLuminance = luminance(parseColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function focusPaint(page: Page): Promise<FocusPaint> {
  const rendered = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      throw new Error('There is no focused HTMLElement');
    }
    const style = getComputedStyle(element);
    const width = Number.parseFloat(style.outlineWidth);
    const offset = Number.parseFloat(style.outlineOffset);
    const rect = element.getBoundingClientRect();
    const ring = {
      left: rect.left - width - offset,
      right: rect.right + width + offset,
      top: rect.top - width - offset,
      bottom: rect.bottom + width + offset,
    };
    const clippedBy: string[] = [];
    let ancestor = element.parentElement;
    while (ancestor != null) {
      const ancestorStyle = getComputedStyle(ancestor);
      const ancestorRect = ancestor.getBoundingClientRect();
      const clipsX = ['hidden', 'clip', 'scroll', 'auto'].includes(
        ancestorStyle.overflowX,
      );
      const clipsY = ['hidden', 'clip', 'scroll', 'auto'].includes(
        ancestorStyle.overflowY,
      );
      if (
        (clipsX &&
          (ring.left < ancestorRect.left || ring.right > ancestorRect.right)) ||
        (clipsY &&
          (ring.top < ancestorRect.top || ring.bottom > ancestorRect.bottom))
      ) {
        clippedBy.push(
          `${ancestor.tagName}.${ancestor.className || '(no-class)'}`,
        );
      }
      ancestor = ancestor.parentElement;
    }
    let backdrop = element.parentElement;
    let adjacentBackground = 'rgba(0, 0, 0, 0)';
    while (backdrop != null) {
      const candidate = getComputedStyle(backdrop).backgroundColor;
      if (!candidate.endsWith(', 0)') && candidate !== 'transparent') {
        adjacentBackground = candidate;
        break;
      }
      backdrop = backdrop.parentElement;
    }
    return {
      text: element.textContent?.trim() ?? '',
      tag: element.tagName,
      focusVisible: element.matches(':focus-visible'),
      tabIndex: element.getAttribute('tabindex'),
      ariaCurrent: element.getAttribute('aria-current'),
      ariaActiveDescendant:
        element
          .closest('nav')
          ?.querySelector('[aria-activedescendant]')
          ?.getAttribute('aria-activedescendant') ?? null,
      level: element.getAttribute('data-level'),
      outline: {
        width: style.outlineWidth,
        style: style.outlineStyle,
        color: style.outlineColor,
        offset: style.outlineOffset,
      },
      tokens: {
        width: style.getPropertyValue('--focus-outline-width').trim(),
        style: style.getPropertyValue('--focus-outline-style').trim(),
        color: style.getPropertyValue('--focus-outline-color').trim(),
        offset: style.getPropertyValue('--focus-outline-offset').trim(),
      },
      adjacentBackground,
      clippedBy,
    };
  });
  return {
    ...rendered,
    contrast: contrast(rendered.outline.color, rendered.adjacentBackground),
  };
}

function changedPixels(before: Buffer, after: Buffer): number {
  const left = PNG.sync.read(before);
  const right = PNG.sync.read(after);
  expect({width: left.width, height: left.height}).toEqual({
    width: right.width,
    height: right.height,
  });
  return pixelmatch(left.data, right.data, undefined, left.width, left.height, {
    threshold: 0,
  });
}

async function screenshotRegion(page: Page): Promise<Buffer> {
  const box = await page
    .getByRole('navigation', {name: 'Table of contents'})
    .boundingBox();
  if (box == null) {
    throw new Error('Outline has no rendered box');
  }
  const pad = 8;
  return page.screenshot({
    animations: 'disabled',
    clip: {
      x: Math.max(0, Math.floor(box.x - pad)),
      y: Math.max(0, Math.floor(box.y - pad)),
      width: Math.ceil(box.width + 2 * pad),
      height: Math.ceil(box.height + 2 * pad),
    },
  });
}

function expectVisibleTokenRing(paint: FocusPaint): void {
  expect(paint.tag).toBe('A');
  expect(paint.focusVisible).toBe(true);
  expect(paint.outline.width).toBe(paint.tokens.width);
  expect(paint.outline.style).toBe(paint.tokens.style);
  expect(paint.outline.offset).toBe(paint.tokens.offset);
  expect(paint.outline.width).toBe('2px');
  expect(paint.outline.style).toBe('solid');
  expect(paint.outline.offset).toBe('3px');
  expect(paint.outline.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(paint.contrast).toBeGreaterThanOrEqual(3);
  expect(paint.clippedBy).toEqual([]);
  expect(paint.ariaActiveDescendant).toBeNull();
}

interface Scenario {
  readonly state: string;
  readonly mode: 'light' | 'dark';
  readonly direction: 'ltr' | 'rtl';
  readonly viewport: {readonly width: number; readonly height: number};
  readonly forcedColors?: boolean;
  readonly hasTouch?: boolean;
  readonly pageScaleFactor?: number;
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    state: 'default-light',
    mode: 'light',
    direction: 'ltr',
    viewport: BASE_VIEWPORT,
  },
  {
    state: 'default-dark',
    mode: 'dark',
    direction: 'ltr',
    viewport: BASE_VIEWPORT,
  },
  {
    state: 'narrow-rtl-light',
    mode: 'light',
    direction: 'rtl',
    viewport: {width: 320, height: 640},
  },
  {
    state: 'narrow-rtl-dark',
    mode: 'dark',
    direction: 'rtl',
    viewport: {width: 320, height: 640},
  },
  {
    state: 'forced-colors',
    mode: 'light',
    direction: 'ltr',
    viewport: BASE_VIEWPORT,
    forcedColors: true,
  },
  {
    state: 'narrow-touch',
    mode: 'light',
    direction: 'ltr',
    viewport: {width: 320, height: 640},
    hasTouch: true,
  },
  {
    state: 'high-zoom-focus-return',
    mode: 'light',
    direction: 'ltr',
    // 320 CSS px is the WCAG 400% reflow equivalent of the 1280px baseline.
    viewport: {width: 320, height: 640},
    pageScaleFactor: 4,
  },
];

async function runScenario(
  browser: Browser,
  target: {readonly name: string; readonly origin: string},
  scenario: Scenario,
): Promise<string[]> {
  const failures: string[] = [];
  const context = await browser.newContext({
    viewport: scenario.viewport,
    colorScheme: scenario.mode,
    deviceScaleFactor: 1,
    forcedColors: scenario.forcedColors ? 'active' : 'none',
    hasTouch: scenario.hasTouch ?? false,
    isMobile: scenario.hasTouch ?? false,
    recordVideo: {dir: OUTPUT, size: scenario.viewport},
  });
  const page = await context.newPage();
  const video = page.video();
  const prefix = `${target.name}__${scenario.state}`;
  const screenshots = {
    rest: path.join(OUTPUT, `${prefix}__rest.png`),
    focus: path.join(OUTPUT, `${prefix}__focus.png`),
    arrow: path.join(OUTPUT, `${prefix}__arrow.png`),
    pointer: path.join(OUTPUT, `${prefix}__pointer.png`),
  };
  const videoPath = path.join(OUTPUT, `${prefix}.webm`);
  let receipt: Receipt | null = null;
  try {
    await page.goto(
      storyUrl(target.origin, scenario.mode, scenario.direction),
      {
        waitUntil: 'load',
      },
    );
    const nav = page.getByRole('navigation', {name: 'Table of contents'});
    await nav.waitFor({state: 'visible'});
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(6);
    await expect(nav.locator('[aria-current="location"]')).toHaveCount(1);
    await expect(nav.locator('[aria-selected]')).toHaveCount(0);
    await expect(nav.locator('[aria-disabled]')).toHaveCount(0);
    expect(
      await links.evaluateAll(elements =>
        elements.map(element => element.getAttribute('data-level')),
      ),
    ).toEqual(['2', '2', '2', '3', '3', '2']);
    const currentIndex = await links.evaluateAll(elements =>
      elements.findIndex(
        element => element.getAttribute('aria-current') === 'location',
      ),
    );
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    const nextIndex = (currentIndex + 1) % 6;

    if (scenario.pageScaleFactor != null) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setPageScaleFactor', {
        pageScaleFactor: scenario.pageScaleFactor,
      });
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(
        scenario.pageScaleFactor,
      );
    }

    const rest = await screenshotRegion(page);
    fs.writeFileSync(screenshots.rest, rest);

    await page.getByRole('button', {name: 'Focus me, then press Tab'}).focus();
    await page.keyboard.press('Tab');
    const focused = await focusPaint(page);
    const focusedPng = await screenshotRegion(page);
    fs.writeFileSync(screenshots.focus, focusedPng);

    await page.keyboard.press('ArrowDown');
    const arrowed = await focusPaint(page);
    const arrowPng = await screenshotRegion(page);
    fs.writeFileSync(screenshots.arrow, arrowPng);

    const prior = await links.nth(currentIndex).getAttribute('tabindex');
    const current = await links.nth(nextIndex).getAttribute('tabindex');
    expect(prior).toBe('-1');
    expect(current).toBe('0');

    // Focus return uses the roving stop the reader last chose, not the old current item.
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('button', {name: 'Focus me, then press Tab'}),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(links.nth(nextIndex)).toBeFocused();

    // Programmatic focus uses the same actual-DOM-focus model;
    // aria-activedescendant is intentionally absent.
    await links.nth(4).focus();
    await expect(links.nth(4)).toBeFocused();
    await expect(nav.locator('[aria-activedescendant]')).toHaveCount(0);
    await expect(links.nth(currentIndex)).toHaveAttribute(
      'aria-current',
      'location',
    );
    await expect(links.nth(4)).not.toHaveAttribute('aria-current');

    const thirdBox = await links.nth(2).boundingBox();
    if (thirdBox == null) {
      throw new Error('The pointer target has no rendered box');
    }
    await page.mouse.click(
      thirdBox.x + thirdBox.width / 2,
      thirdBox.y + thirdBox.height / 2,
    );
    const pointerFocusVisible = await links
      .nth(2)
      .evaluate(element => element.matches(':focus-visible'));
    fs.writeFileSync(screenshots.pointer, await screenshotRegion(page));

    let touchFocusVisible: boolean | null = null;
    if (scenario.hasTouch) {
      const fourthBox = await links.nth(3).boundingBox();
      if (fourthBox == null) {
        throw new Error('The touch target has no rendered box');
      }
      await page.touchscreen.tap(
        fourthBox.x + fourthBox.width / 2,
        fourthBox.y + fourthBox.height / 2,
      );
      touchFocusVisible = await links
        .nth(3)
        .evaluate(element => element.matches(':focus-visible'));
    }

    receipt = {
      target: target.name,
      state: scenario.state,
      theme: 'neutral',
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      forcedColors: scenario.forcedColors ?? false,
      pageScaleFactor: scenario.pageScaleFactor ?? 1,
      browser: browser.version(),
      build: target.name === 'current-head' ? storybookSha : 'external-preview',
      focused,
      arrowed,
      pointerFocusVisible,
      touchFocusVisible,
      restToFocusChangedPixels: changedPixels(rest, focusedPng),
      restToArrowChangedPixels: changedPixels(rest, arrowPng),
      screenshots: Object.values(screenshots).map(file => path.basename(file)),
      video: path.basename(videoPath),
    };

    const checks = () => {
      expectVisibleTokenRing(focused);
      expect(focused.ariaCurrent).toBe('location');
      expect(focused.tabIndex).toBe('0');
      expect(focused.level).toMatch(/^[1-6]$/);

      expectVisibleTokenRing(arrowed);
      expect(arrowed.ariaCurrent).toBeNull();
      expect(arrowed.tabIndex).toBe('0');
      expect(arrowed.level).toMatch(/^[1-6]$/);

      expect(receipt?.pointerFocusVisible).toBe(false);
      expect(receipt?.touchFocusVisible).not.toBe(true);
      expect(receipt?.restToFocusChangedPixels).toBeGreaterThan(0);
      expect(receipt?.restToArrowChangedPixels).toBeGreaterThan(0);
    };
    try {
      checks();
    } catch (error) {
      failures.push(`${target.name}/${scenario.state}: ${String(error)}`);
    }
  } catch (error) {
    failures.push(`${target.name}/${scenario.state}: ${String(error)}`);
  } finally {
    if (receipt != null) {
      receipts.push(receipt);
    }
    await context.close();
    if (video != null) {
      await video.saveAs(videoPath);
    }
  }
  return failures;
}

test('keeps the actual focused Outline link visibly outlined in every supported context', async ({
  browser,
}) => {
  test.setTimeout(4 * 60 * 1000);
  const failures: string[] = [];
  const targets = [{name: 'current-head', origin: storybook.origin}] as const;
  for (const target of targets) {
    for (const scenario of SCENARIOS) {
      failures.push(...(await runScenario(browser, target, scenario)));
    }
  }
  expect(failures).toEqual([]);
});
